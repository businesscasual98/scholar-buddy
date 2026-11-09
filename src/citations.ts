import { shell } from "electron";
import { App, Editor, FuzzyMatch, FuzzySuggestModal, Modifier, Notice, TFile, normalizePath, renderMatches } from "obsidian";
import { BibEntry, entryVars } from "./bib";
import { fillNoteTemplate, fillTemplate } from "./render";
import { notePath } from "./sync";
import type ScholarBuddyPlugin from "./main";

type Choose = (entry: BibEntry, evt: MouseEvent | KeyboardEvent) => void;

interface ModalOptions {
  instructions: [string, string][];
  /** Key combinations, besides plain Enter, that choose the selected result. */
  keys: [Modifier[], string][];
  choose: Choose;
}

/** Literature-note search. Each command is this window with a different action. */
class CitationSearchModal extends FuzzySuggestModal<BibEntry> {
  constructor(app: App, private items: BibEntry[], private options: ModalOptions) {
    super(app);
    this.limit = 50;
    this.setPlaceholder("Search by title, author, year or citekey");
    this.setInstructions(options.instructions.map(([command, purpose]) => ({ command, purpose })));
    this.modalEl.addClass("scholar-buddy-search");
    for (const [modifiers, key] of options.keys) {
      this.scope.register(modifiers, key, (evt) => {
        this.selectActiveSuggestion(evt);
        return false;
      });
    }
  }

  getItems(): BibEntry[] {
    return this.items;
  }

  getItemText(e: BibEntry): string {
    return [e.title, e.authorString, e.year, e.id].filter(Boolean).join(" ");
  }

  onChooseItem(item: BibEntry, evt: MouseEvent | KeyboardEvent): void {
    this.options.choose(item, evt);
  }

  renderSuggestion(match: FuzzyMatch<BibEntry>, el: HTMLElement): void {
    el.empty();
    const e = match.item;
    const row = el.createDiv({ cls: "scholar-buddy-result" });
    const parts = [e.title, e.authorString, e.year, e.id].filter(Boolean) as string[];
    // Highlights index into getItemText, so each piece shifts them to its own offset.
    const within = (text: string | undefined): [number, number][] => {
      if (!text) return [];
      const start = parts.slice(0, parts.indexOf(text)).reduce((n, p) => n + p.length + 1, 0);
      return match.match.matches
        .map(([a, b]): [number, number] => [a - start, Math.min(b - start, text.length)])
        .filter(([a, b]) => a >= 0 && a < b);
    };
    renderMatches(row.createDiv({ cls: "scholar-buddy-title" }), e.title || e.id, within(e.title));
    const meta = row.createDiv({ cls: "scholar-buddy-meta" });
    if (e.authorString) renderMatches(meta.createSpan({ cls: "scholar-buddy-authors" }), e.authorString, within(e.authorString));
    if (e.year) meta.createSpan({ cls: "scholar-buddy-year", text: e.year });
    row.createDiv({ cls: "scholar-buddy-citekey", text: e.id });
  }
}

/** Find the entry's note, or create it. A note differing only by letter case counts as the same note. */
export async function getOrCreateNote(plugin: ScholarBuddyPlugin, entry: BibEntry): Promise<TFile> {
  const { app } = plugin;
  const target = plugin.noteTarget();
  const vars = entryVars(entry);
  const path = notePath(target, fillTemplate(target.titleTemplate, vars));
  const existing = app.vault.getFileByPath(path);
  if (existing) return existing;
  // A note whose name differs only in letter case is the same file on Windows and macOS, so
  // creating would fail. Look for one in the note's own folder, not the whole vault.
  const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  const parent = folder ? app.vault.getFolderByPath(normalizePath(folder)) : app.vault.getRoot();
  const lower = path.toLowerCase();
  const match = parent?.children.find((f): f is TFile => f instanceof TFile && f.path.toLowerCase() === lower);
  if (match) return match;
  if (folder && !parent) await app.vault.createFolder(folder);
  return app.vault.create(path, fillNoteTemplate(target.contentTemplate, vars));
}

function isCtrl(evt: MouseEvent | KeyboardEvent): boolean {
  return evt.ctrlKey || evt.metaKey;
}

async function openPdf(entry: BibEntry): Promise<void> {
  const pdf = entry.files.find((f) => f.toLowerCase().endsWith(".pdf"));
  if (!pdf) {
    new Notice("This reference has no PDF attached.");
    return;
  }
  const error = await shell.openPath(pdf);
  if (error) new Notice(`Couldn't open the PDF: ${error}`);
}

function reportFailure(what: string, e: unknown): void {
  console.error(`Scholar Buddy: ${what}`, e);
  new Notice(`${what}: ${(e as Error).message}`);
}

/** Registers the library search and citation commands. No default hotkeys, per Obsidian's guidelines. */
export function registerCitationCommands(plugin: ScholarBuddyPlugin): void {
  const { app } = plugin;

  const search = async (options: ModalOptions): Promise<void> => {
    await plugin.library.refresh();
    const items = [...plugin.library.entries.values()];
    if (!items.length) {
      new Notice(plugin.library.lastProblem ?? "No references found. Check the .bib file in this plugin's options.", 8000);
      return;
    }
    new CitationSearchModal(app, items, options).open();
  };

  const openNote = async (entry: BibEntry, newPane: boolean): Promise<void> => {
    try {
      const file = await getOrCreateNote(plugin, entry);
      await app.workspace.getLeaf(newPane).openFile(file);
    } catch (e) {
      reportFailure("Couldn't open the literature note", e);
    }
  };

  const insertLink = async (entry: BibEntry, editor: Editor, sourcePath: string): Promise<void> => {
    try {
      const file = await getOrCreateNote(plugin, entry);
      editor.replaceSelection(app.fileManager.generateMarkdownLink(file, sourcePath));
    } catch (e) {
      reportFailure("Couldn't create the literature note", e);
    }
  };

  plugin.addCommand({
    id: "open-literature-note",
    name: "Open literature note",
    callback: () =>
      void search({
        instructions: [
          ["↑↓", "to navigate"],
          ["↵", "to open literature note"],
          ["ctrl ↵", "to open in a new pane"],
          ["tab", "to open in Zotero"],
          ["shift tab", "to open PDF"],
          ["esc", "to dismiss"],
        ],
        keys: [
          [["Mod"], "Enter"],
          [[], "Tab"],
          [["Shift"], "Tab"],
        ],
        choose: (entry, evt) => {
          if (evt instanceof KeyboardEvent && evt.key === "Tab") {
            if (evt.shiftKey) void openPdf(entry);
            else window.open(entry.zoteroSelectURI);
            return;
          }
          void openNote(entry, isCtrl(evt));
        },
      }),
  });

  plugin.addCommand({
    id: "insert-note-link",
    name: "Insert literature note link",
    editorCallback: (editor: Editor, ctx) =>
      void search({
        instructions: [
          ["↑↓", "to navigate"],
          ["↵", "to insert link to literature note"],
          ["esc", "to dismiss"],
        ],
        keys: [],
        choose: (entry) => void insertLink(entry, editor, ctx.file?.path ?? ""),
      }),
  });

  plugin.addCommand({
    id: "insert-note-content",
    name: "Insert literature note content",
    editorCallback: (editor: Editor) =>
      void search({
        instructions: [
          ["↑↓", "to navigate"],
          ["↵", "to insert literature note content"],
          ["esc", "to dismiss"],
        ],
        keys: [],
        choose: (entry) => {
          editor.replaceSelection(fillNoteTemplate(plugin.noteTarget().contentTemplate, entryVars(entry)));
        },
      }),
  });

  plugin.addCommand({
    id: "insert-citation",
    name: "Insert citation",
    editorCallback: (editor: Editor) =>
      void search({
        instructions: [
          ["↑↓", "to navigate"],
          ["↵", "to insert citation"],
          ["shift ↵", "to insert secondary citation"],
          ["esc", "to dismiss"],
        ],
        keys: [[["Shift"], "Enter"]],
        choose: (entry, evt) => {
          const s = plugin.settings;
          const template = evt.shiftKey
            ? s.alternativeCitationTemplate || "@{{citekey}}"
            : s.citationTemplate || "[@{{citekey}}]";
          editor.replaceSelection(fillTemplate(template, entryVars(entry)));
        },
      }),
  });

  const refresh = async (): Promise<void> => {
    await plugin.library.refresh(true);
    const { entries, lastProblem } = plugin.library;
    new Notice(lastProblem ?? `Citation library: ${entries.size} references loaded.`, lastProblem ? 8000 : 4000);
  };
  plugin.addCommand({
    id: "refresh-library",
    name: "Refresh citation library",
    callback: () => void refresh(),
  });
}
