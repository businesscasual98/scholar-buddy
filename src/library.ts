import { promises as fs } from "fs";
import { isAbsolute } from "path";
import { App, normalizePath } from "obsidian";
import { BibEntry, parseBib } from "./bib";

/**
 * The search index behind the citation commands, read from a Better BibTeX export so it
 * works whether or not Zotero is running.
 */
export class BibLibrary {
  entries = new Map<string, BibEntry>();
  /** Why the last load failed or was incomplete, for the settings tab and notices. */
  lastProblem: string | null = null;
  private mtime = 0;
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
      this.lastProblem = "No .bib file is set. Choose one in this plugin's settings.";
      return;
    }
    let text: string;
    try {
      const mtime = await this.statMtime(path);
      if (!force && mtime === this.mtime && this.entries.size) return;
      text = await this.read(path);
      this.mtime = mtime;
    } catch (e) {
      this.lastProblem = `Could not read "${path}": ${(e as Error).message}`;
      return;
    }
    const { entries, errors } = parseBib(text);
    // Better BibTeX may be mid-write. Keep the last good library rather than emptying the search.
    if (!entries.length && this.entries.size) {
      this.mtime = 0;
      this.lastProblem = `"${path}" had no readable entries, so the previous library was kept.`;
      return;
    }
    this.entries = new Map(entries.map((e) => [e.id, e]));
    this.lastProblem = entries.length
      ? errors.length
        ? `${errors.length} entries in "${path}" could not be read (first: ${errors[0]}).`
        : null
      : `"${path}" has no BibTeX entries.`;
    if (errors.length) console.warn("Zotero Citations Sync: .bib problems", errors);
  }

  private async statMtime(path: string): Promise<number> {
    if (isAbsolute(path)) return (await fs.stat(path)).mtimeMs;
    const stat = await this.app.vault.adapter.stat(normalizePath(path));
    if (!stat) throw new Error("file not found");
    return stat.mtime;
  }

  private read(path: string): Promise<string> {
    return isAbsolute(path) ? fs.readFile(path, "utf8") : this.app.vault.adapter.read(normalizePath(path));
  }
}
