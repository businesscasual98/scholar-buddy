import { App, FileSystemAdapter, TFile, normalizePath } from "obsidian";
import { BibEntry, parseBib } from "./bib";

/** C:\... or C:/..., \\server\share, or /... on macOS and Linux. */
const ABSOLUTE = /^([a-zA-Z]:[\\/]|\\\\|\/)/;

/**
 * The search index behind the citation commands, read from a Better BibTeX export so it
 * works whether or not Zotero is running.
 */
export class BibLibrary {
  entries = new Map<string, BibEntry>();
  /** Why the last load failed or was incomplete, for the settings tab and notices. */
  lastProblem: string | null = null;
  /** What was last parsed: a vault file's mtime, or an outside file's full text. */
  private version: number | string | null = null;
  private loading: Promise<void> | null = null;

  constructor(private app: App, private path: () => string) {}

  /** Reload if the file changed since the last read. Cheap enough to call when a search opens. */
  refresh(force = false): Promise<void> {
    if (!this.loading) {
      this.loading = this.load(force).finally(() => {
        this.loading = null;
      });
    }
    return this.loading;
  }

  private async load(force: boolean): Promise<void> {
    const path = this.path();
    if (!path) {
      this.lastProblem = "No .bib file is set. Choose one in this plugin's options.";
      return;
    }
    let text: string;
    let version: number | string;
    try {
      if (ABSOLUTE.test(path)) {
        // Outside the vault there's no file index to ask for a modified time, so compare contents.
        text = new TextDecoder("utf-8").decode(await FileSystemAdapter.readLocalFile(path));
        version = text;
      } else {
        const file = this.vaultFile(path);
        version = file.stat.mtime;
        if (!force && version === this.version && this.entries.size) return;
        text = await this.app.vault.read(file);
      }
    } catch (e) {
      this.lastProblem = `Could not read "${path}": ${(e as Error).message}`;
      return;
    }
    if (!force && version === this.version && this.entries.size) return;
    const { entries, errors } = parseBib(text);
    // Better BibTeX may be mid-write. Keep the last good library rather than emptying the search.
    if (!entries.length && this.entries.size) {
      this.version = null;
      this.lastProblem = `"${path}" had no readable entries, so the previous library was kept.`;
      return;
    }
    this.version = version;
    this.entries = new Map(entries.map((e) => [e.id, e]));
    this.lastProblem = entries.length
      ? errors.length
        ? `${errors.length} entries in "${path}" could not be read (first: ${errors[0]}).`
        : null
      : `"${path}" has no BibTeX entries.`;
  }

  private vaultFile(path: string): TFile {
    const file = this.app.vault.getFileByPath(normalizePath(path));
    if (!file) throw new Error("file not found");
    return file;
  }
}
