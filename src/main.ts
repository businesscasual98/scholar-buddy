import { Notice, Plugin, TAbstractFile, TFile, debounce, normalizePath } from "obsidian";
import { DEFAULT_SETTINGS, ZoteroSyncSettingTab, ZoteroSyncSettings } from "./settings";
import { LocalApiDisabledError, ZoteroClient, ZoteroUnavailableError } from "./zotero";
import { NoteTarget, syncKindle, syncLibrary } from "./sync";
import { BibLibrary } from "./library";
import { registerCitationCommands } from "./citations";

const FALLBACK_CONTENT_TEMPLATE =
  "---\ncitekey: {{citekey}}\ntitle: {{title}}\nauthors: {{authorString}}\nyear: {{year}}\n---\n";

type Reason = "manual" | "startup" | "poll" | "file";

export default class ZoteroCitationsSyncPlugin extends Plugin {
  settings: ZoteroSyncSettings = DEFAULT_SETTINGS;
  library: BibLibrary = new BibLibrary(this.app, () => this.bibPath());

  private statusEl: HTMLElement | null = null;
  private pollHandle: number | null = null;
  private syncing = false;
  private kindleSyncing = false;

  async onload(): Promise<void> {
    await this.loadSettings();
    await this.importCitationsSettings();
    this.addSettingTab(new ZoteroSyncSettingTab(this.app, this));
    registerCitationCommands(this);

    // Better BibTeX rewrites the whole export, so wait for it to settle before re-reading.
    const reloadLibrary = debounce(() => void this.library.refresh(), 1000, true);
    this.registerEvent(
      this.app.vault.on("modify", (f: TAbstractFile) => {
        if (f.path === normalizePath(this.bibPath())) reloadLibrary();
      })
    );

    this.addRibbonIcon("refresh-cw", "Sync Zotero annotations", () => void this.runSync("manual"));
    this.addCommand({
      id: "sync-now",
      name: "Sync annotations from Zotero now",
      callback: () => void this.runSync("manual"),
    });
    this.addCommand({
      id: "sync-kindle-now",
      name: "Sync Kindle highlights now",
      callback: () => void this.runKindleSync("manual"),
    });
    this.statusEl = this.addStatusBarItem();
    this.setStatus("Zotero: idle");

    // A fresh "My Clippings.txt" dropped into the vault triggers a Kindle sync.
    this.registerEvent(
      this.app.vault.on("modify", (f: TAbstractFile) => {
        if (this.settings.kindleEnabled && f.path === normalizePath(this.settings.kindleClippingsPath))
          void this.runKindleSync("file");
      })
    );

    this.app.workspace.onLayoutReady(() => {
      void (async () => {
        void this.library.refresh();
        if (this.settings.syncOnStartup) {
          await this.runSync("startup");
          await this.runKindleSync("startup");
        }
        this.restartPolling();
      })();
    });
  }

  onunload(): void {
    this.stopPolling();
  }

  // ------------------------------------------------------------- Zotero sync
  async runSync(reason: Reason): Promise<void> {
    if (this.syncing) return;
    this.syncing = true;
    this.setStatus("Zotero: syncing…");
    try {
      const client = new ZoteroClient(this.settings.zoteroPort);
      const r = await syncLibrary(this.app, client, this.settings, this.noteTarget());
      this.settings.lastLibraryVersion = r.libraryVersion;
      this.settings.lastSyncAt = Date.now();
      await this.saveSettings();

      const changed = r.created + r.updated;
      this.setStatus(`Zotero: synced ${new Date().toLocaleTimeString()}`);
      if (reason === "manual" || changed > 0) {
        new Notice(
          `Zotero sync: ${r.annotations} annotations across ${r.items} items — ` +
            `${r.created} notes created, ${r.updated} updated` +
            (r.skippedNoCitekey ? `, ${r.skippedNoCitekey} skipped (no citekey)` : "") +
            (r.bbtOffline ? "\nBetter BibTeX wasn't reachable; used cached citekeys." : "")
        );
      }
      if (reason === "manual") await this.runKindleSync("manual");
    } catch (e) {
      this.setStatus("Zotero: unavailable");
      if (e instanceof LocalApiDisabledError) {
        if (reason !== "poll")
          new Notice(
            "Zotero's local API is off. In Zotero: Settings → Advanced → tick “Enable local API”.",
            10000
          );
      } else if (e instanceof ZoteroUnavailableError) {
        if (reason === "manual") new Notice("Zotero doesn't seem to be running.");
      } else {
        console.error("Zotero Citations Sync failed", e);
        new Notice(`Zotero sync failed: ${(e as Error).message}`);
      }
    } finally {
      this.syncing = false;
    }
  }

  // ------------------------------------------------------------- Kindle sync
  async runKindleSync(reason: Reason): Promise<void> {
    if (!this.settings.kindleEnabled || this.kindleSyncing) return;
    const path = normalizePath(this.settings.kindleClippingsPath);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      if (reason === "manual") new Notice(`Kindle: no clippings file at "${path}".`);
      return;
    }
    this.kindleSyncing = true;
    try {
      const raw = await this.app.vault.read(file);
      // Better BibTeX is only needed for auto-matching new books; cached/overridden books work without it.
      const client = new ZoteroClient(this.settings.zoteroPort);
      const r = await syncKindle(this.app, client, this.settings, this.noteTarget(), raw);
      this.settings.lastKindleUnmatched = r.unmatched;
      await this.saveSettings();
      if (reason === "manual" || reason === "file" || r.created + r.updated > 0) {
        new Notice(
          `Kindle sync: ${r.highlights} highlights across ${r.books} books — ` +
            `${r.created} notes created, ${r.updated} updated. ` +
            `${r.matched} matched to Zotero, ${r.unmatched.length} not (notes named by title)` +
            (r.skipped ? `, ${r.skipped} skipped` : "") +
            "."
        );
      }
    } catch (e) {
      console.error("Kindle sync failed", e);
      new Notice(`Kindle sync failed: ${(e as Error).message}`);
    } finally {
      this.kindleSyncing = false;
    }
  }

  /** Cheap change check: one request that returns just the library version. */
  private async pollOnce(): Promise<void> {
    if (this.syncing) return;
    try {
      const v = await new ZoteroClient(this.settings.zoteroPort).libraryVersion();
      if (v !== this.settings.lastLibraryVersion) await this.runSync("poll");
    } catch {
      // Zotero closed or API off — stay quiet, try again next tick.
    }
  }

  restartPolling(): void {
    this.stopPolling();
    const secs = this.settings.pollIntervalSeconds;
    if (secs > 0) {
      this.pollHandle = window.setInterval(() => void this.pollOnce(), secs * 1000);
      this.registerInterval(this.pollHandle);
    }
  }

  private stopPolling(): void {
    if (this.pollHandle !== null) window.clearInterval(this.pollHandle);
    this.pollHandle = null;
  }

  // ------------------------------------------------------------- config
  noteTarget(): NoteTarget {
    return {
      folder: this.settings.notesFolder,
      titleTemplate: this.settings.noteNameTemplate || "@{{citekey}}",
      contentTemplate: this.settings.contentTemplate || FALLBACK_CONTENT_TEMPLATE,
    };
  }

  /** The configured .bib file, or the vault's only .bib file if none is set. */
  bibPath(): string {
    if (this.settings.bibPath) return this.settings.bibPath;
    const found = this.app.vault.getFiles().filter((f) => f.extension === "bib");
    return found.length === 1 ? found[0].path : "";
  }

  /**
   * Copy the Citations plugin's settings once, filling only what's unset, so this plugin keeps
   * working the same after Citations is turned off or removed.
   */
  private async importCitationsSettings(): Promise<void> {
    if (this.settings.citationsImported) return;
    const path = normalizePath(`${this.app.vault.configDir}/plugins/obsidian-citation-plugin/data.json`);
    try {
      if (!(await this.app.vault.adapter.exists(path))) return;
      const raw = JSON.parse(await this.app.vault.adapter.read(path)) as Record<string, string>;
      const s = this.settings;
      s.notesFolder ||= raw.literatureNoteFolder ?? "";
      s.noteNameTemplate ||= raw.literatureNoteTitleTemplate ?? "";
      s.contentTemplate ||= raw.literatureNoteContentTemplate ?? "";
      s.citationTemplate ||= raw.markdownCitationTemplate ?? "";
      s.alternativeCitationTemplate ||= raw.alternativeMarkdownCitationTemplate ?? "";
      if (raw.citationExportFormat !== "csl-json") s.bibPath ||= raw.citationExportPath ?? "";
      s.citationsImported = true;
      await this.saveSettings();
    } catch (e) {
      console.warn("Zotero Citations Sync: could not read Citations plugin settings", e);
    }
  }

  private setStatus(text: string): void {
    this.statusEl?.setText(text);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
