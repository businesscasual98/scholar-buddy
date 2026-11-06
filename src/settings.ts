import { App, PluginSettingTab, Setting } from "obsidian";
import type ZoteroCitationsSyncPlugin from "./main";

export interface ZoteroSyncSettings {
  /** Port of Zotero's built-in HTTP server. */
  zoteroPort: number;
  /** Folder for literature notes. Empty = the vault root. */
  notesFolder: string;
  /** Filename template. Empty = "@{{citekey}}". */
  noteNameTemplate: string;
  /** Initial content of a new literature note. Empty = a basic frontmatter template. */
  contentTemplate: string;
  /** Better BibTeX export: vault-relative or absolute. Empty = the vault's only .bib file. */
  bibPath: string;
  /** What "Insert citation" writes. Empty = "[@{{citekey}}]". */
  citationTemplate: string;
  /** What "Insert citation" writes with Shift+Enter. Empty = "@{{citekey}}". */
  alternativeCitationTemplate: string;
  /** Create a literature note for items that have annotations but no note yet. */
  createMissingNotes: boolean;
  /** Also sync Zotero child notes (not just PDF annotations). */
  includeChildNotes: boolean;
  /** Run a sync when Obsidian finishes loading. */
  syncOnStartup: boolean;
  /** How often to ask Zotero whether anything changed. 0 disables polling. */
  pollIntervalSeconds: number;
  /** Heading written at the top of the synced block. */
  blockHeading: string;

  // --- Kindle
  kindleEnabled: boolean;
  /** Vault-relative path to a copy of the Kindle's "My Clippings.txt". */
  kindleClippingsPath: string;
  kindleHeading: string;
  /** "Raw Kindle title => citekey" per line; "=> skip" ignores a book. */
  kindleOverrides: string;

  // --- state, not shown in the UI
  citationsImported: boolean;
  lastLibraryVersion: number;
  citekeyCache: Record<string, string>;
  kindleMatchCache: Record<string, string>;
  lastSyncAt: number;
  lastKindleUnmatched: string[];
}

export const DEFAULT_SETTINGS: ZoteroSyncSettings = {
  zoteroPort: 23119,
  notesFolder: "",
  noteNameTemplate: "",
  contentTemplate: "",
  bibPath: "",
  citationTemplate: "",
  alternativeCitationTemplate: "",
  createMissingNotes: true,
  includeChildNotes: true,
  syncOnStartup: true,
  pollIntervalSeconds: 30,
  blockHeading: "## Zotero annotations",
  kindleEnabled: false,
  kindleClippingsPath: "My Clippings.txt",
  kindleHeading: "## Kindle highlights",
  kindleOverrides: "",
  citationsImported: false,
  lastLibraryVersion: 0,
  citekeyCache: {},
  kindleMatchCache: {},
  lastSyncAt: 0,
  lastKindleUnmatched: [],
};

export class ZoteroSyncSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: ZoteroCitationsSyncPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;
    const save = () => this.plugin.saveSettings();

    new Setting(containerEl)
      .setName("Sync now")
      .setDesc("Pull all highlights and notes from Zotero (and Kindle, if enabled) into your literature notes.")
      .addButton((b) =>
        b.setButtonText("Sync").setCta().onClick(() => this.plugin.runSync("manual"))
      );

    new Setting(containerEl).setName("When to sync").setHeading();

    new Setting(containerEl)
      .setName("Sync when Obsidian opens")
      .addToggle((t) =>
        t.setValue(s.syncOnStartup).onChange(async (v) => {
          s.syncOnStartup = v;
          await save();
        })
      );

    new Setting(containerEl)
      .setName("Watch Zotero for changes")
      .setDesc(
        "Seconds between checks. Each check is a single tiny request to Zotero; a sync only runs when something changed. 0 turns watching off."
      )
      .addText((t) =>
        t
          .setPlaceholder("30")
          .setValue(String(s.pollIntervalSeconds))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            s.pollIntervalSeconds = Number.isFinite(n) && n >= 0 ? n : 0;
            await save();
            this.plugin.restartPolling();
          })
      );

    new Setting(containerEl).setName("Where notes go").setHeading();

    new Setting(containerEl)
      .setName("Literature note folder")
      .setDesc("Leave empty to use the vault's top level.")
      .addText((t) =>
        t
          .setPlaceholder("Reading notes")
          .setValue(s.notesFolder)
          .onChange(async (v) => {
            s.notesFolder = v.trim();
            await save();
          })
      );

    new Setting(containerEl)
      .setName("Note name template")
      .setDesc("Supports {{citekey}}, {{title}}, {{year}}, {{authorString}}.")
      .addText((t) =>
        t
          .setPlaceholder("@{{citekey}}")
          .setValue(s.noteNameTemplate)
          .onChange(async (v) => {
            s.noteNameTemplate = v.trim();
            await save();
          })
      );

    new Setting(containerEl)
      .setName("New note content")
      .setDesc(
        "What a new literature note starts with. Variables: {{citekey}}, {{title}}, {{titleShort}}, {{authorString}}, {{year}}, {{abstract}}, {{containerTitle}}, {{DOI}}, {{URL}}, {{publisher}}, {{publisherPlace}}, {{page}}, {{note}}, {{zoteroSelectURI}}. Notes created from a Zotero sync have only citekey, title, year and authorString."
      )
      .addTextArea((t) =>
        t.setValue(s.contentTemplate).onChange(async (v) => {
          s.contentTemplate = v;
          await save();
        })
      );

    new Setting(containerEl).setName("Citations").setHeading();

    const libraryStatus = new Setting(containerEl).setName("Library");
    const showLibraryStatus = () => {
      const { entries, lastProblem } = this.plugin.library;
      libraryStatus.setDesc(lastProblem ?? `${entries.size} references loaded from "${this.plugin.bibPath()}".`);
    };
    libraryStatus.addButton((b) =>
      b.setButtonText("Reload").onClick(async () => {
        await this.plugin.library.refresh(true);
        showLibraryStatus();
      })
    );
    void this.plugin.library.refresh().then(showLibraryStatus);

    new Setting(containerEl)
      .setName(".bib file")
      .setDesc("Your Better BibTeX export, with \"Keep updated\" on. Leave empty to use the vault's only .bib file.")
      .addText((t) =>
        t
          .setPlaceholder("Library.bib")
          .setValue(s.bibPath)
          .onChange(async (v) => {
            s.bibPath = v.trim();
            await save();
            await this.plugin.library.refresh(true);
            showLibraryStatus();
          })
      );

    new Setting(containerEl)
      .setName("Citation format")
      .setDesc("What \"Insert citation\" writes. Takes the same variables as new note content.")
      .addText((t) =>
        t
          .setPlaceholder("[@{{citekey}}]")
          .setValue(s.citationTemplate)
          .onChange(async (v) => {
            s.citationTemplate = v;
            await save();
          })
      );

    new Setting(containerEl)
      .setName("Secondary citation format")
      .setDesc("What \"Insert citation\" writes when you press Shift+Enter.")
      .addText((t) =>
        t
          .setPlaceholder("@{{citekey}}")
          .setValue(s.alternativeCitationTemplate)
          .onChange(async (v) => {
            s.alternativeCitationTemplate = v;
            await save();
          })
      );

    new Setting(containerEl).setName("Literature notes").setHeading();

    new Setting(containerEl)
      .setName("Create notes for items that don't have one yet")
      .setDesc("Off = only update literature notes that already exist.")
      .addToggle((t) =>
        t.setValue(s.createMissingNotes).onChange(async (v) => {
          s.createMissingNotes = v;
          await save();
        })
      );

    new Setting(containerEl).setName("Zotero").setHeading();

    new Setting(containerEl)
      .setName("Include Zotero child notes")
      .setDesc("Notes attached to an item in Zotero, in addition to PDF annotations.")
      .addToggle((t) =>
        t.setValue(s.includeChildNotes).onChange(async (v) => {
          s.includeChildNotes = v;
          await save();
        })
      );

    new Setting(containerEl)
      .setName("Block heading")
      .setDesc("Written at the top of the synced section in each note.")
      .addText((t) =>
        t.setValue(s.blockHeading).onChange(async (v) => {
          s.blockHeading = v;
          await save();
        })
      );

    new Setting(containerEl)
      .setName("Zotero port")
      .setDesc("Zotero's local HTTP server. Only change this if you changed it in Zotero.")
      .addText((t) =>
        t.setValue(String(s.zoteroPort)).onChange(async (v) => {
          const n = parseInt(v, 10);
          if (Number.isFinite(n) && n > 0) {
            s.zoteroPort = n;
            await save();
          }
        })
      );

    new Setting(containerEl).setName("Kindle").setHeading();

    new Setting(containerEl)
      .setName("Sync Kindle highlights")
      .setDesc(
        "Reads a copy of your Kindle's \"My Clippings.txt\" from the vault. Books are matched to Zotero items by title and author; unmatched books get a note named after the book."
      )
      .addToggle((t) =>
        t.setValue(s.kindleEnabled).onChange(async (v) => {
          s.kindleEnabled = v;
          await save();
        })
      );

    new Setting(containerEl)
      .setName("Clippings file")
      .setDesc("Vault-relative path. The plugin re-syncs whenever this file changes, so just overwrite it with a fresh copy from the Kindle.")
      .addText((t) =>
        t
          .setPlaceholder("My Clippings.txt")
          .setValue(s.kindleClippingsPath)
          .onChange(async (v) => {
            s.kindleClippingsPath = v.trim();
            await save();
          })
      );

    new Setting(containerEl)
      .setName("Kindle block heading")
      .addText((t) =>
        t.setValue(s.kindleHeading).onChange(async (v) => {
          s.kindleHeading = v;
          await save();
        })
      );

    new Setting(containerEl)
      .setName("Book → citekey overrides")
      .setDesc(
        "One per line: the book title exactly as it appears in the clippings file, then =>, then the Better BibTeX citekey. Use => skip to ignore a book. Unmatched books from the last sync are listed below for copy-paste."
      )
      .addTextArea((t) => {
        t.setPlaceholder("Dune (Herbert, Frank) => herbertDune1965\nRiemen => skip")
          .setValue(s.kindleOverrides)
          .onChange(async (v) => {
            s.kindleOverrides = v;
            await save();
          });
        t.inputEl.rows = 8;
        t.inputEl.cols = 60;
      });

    if (s.lastKindleUnmatched.length) {
      const box = containerEl.createEl("details");
      box.createEl("summary", { text: `${s.lastKindleUnmatched.length} Kindle books not matched to Zotero (last sync)` });
      const pre = box.createEl("pre", { cls: "setting-item-description" });
      pre.setText(s.lastKindleUnmatched.map((t) => `${t} => `).join("\n"));
    }

    const status = containerEl.createEl("p", { cls: "setting-item-description" });
    status.setText(
      s.lastSyncAt
        ? `Last sync: ${new Date(s.lastSyncAt).toLocaleString()} (library version ${s.lastLibraryVersion}).`
        : "Never synced yet."
    );
  }
}
