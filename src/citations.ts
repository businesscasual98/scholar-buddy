import { App, Editor, FuzzyMatch, FuzzySuggestModal, Modifier, Notice, TFile, normalizePath, renderMatches } from "obsidian";
import { BibEntry, entryVars } from "./bib";
import { fillTemplate } from "./render";
import { notePath } from "./sync";
import type ZoteroCitationsSyncPlugin from "./main";

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
    this.modalEl.addClass("zcs-search");
    for (const [modifiers, key] of options.keys) {
      this.scope.register(modifiers, key, (evt) => {
        // Obsidian binds only plain Enter. `chooser` isn't in its public types, though
        // SuggestModal has always used it to pick the highlighted result.
        (this as unknown as { chooser: { useSelectedItem(e: KeyboardEvent): void } }).chooser.useSelectedItem(evt);
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
    const row = el.createDiv({ cls: "zcs-result" });
    const parts = [e.title, e.authorString, e.year, e.id].filter(Boolean) as string[];
    // Highlights index into getItemText, so each piece shifts them to its own offset.
    const within = (text: string | undefined): [number, number][] => {
      if (!text) return [];
      const start = parts.slice(0, parts.indexOf(text)).reduce((n, p) => n + p.length + 1, 0);
      return match.match.matches
        .map(([a, b]): [number, number] => [a - start, Math.min(b - start, text.length)])
        .filter(([a, b]) => a >= 0 && a < b);
    };
    renderMatches(row.createDiv({ cls: "zcs-title" }), e.title || e.id, within(e.title));
    const meta = row.createDiv({ cls: "zcs-meta" });
    if (e.authorString) renderMatches(meta.createSpan({ cls: "zcs-authors" }), e.authorString, within(e.authorString));
    if (e.year) meta.createSpan({ cls: "zcs-year", text: e.year });
    row.createDiv({ cls: "zcs-citekey", text: e.id });
  }
}

/** Find the entry's note regardless of case, as the Citations plugin does, or create it. */
export async function getOrCreateNote(plugin: ZoteroCitationsSyncPlugin, entry: BibEntry): Promise<TFile> {
  const { app } = plugin;
  const target = plugin.noteTarget();
  const vars = entryVars(entry);
  const path = notePath(target, fillTemplate(target.titleTemplate, vars));
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof TFile) return existing;
  const lower = path.toLowerCase();
  const match = app.vault.getMarkdownFiles().find((f) => f.path.toLowerCase() === lower);
  if (match) return match;
  const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  if (folder && !app.vault.getAbstractFileByPath(normalizePath(folder))) await app.vault.createFolder(folder);
  return app.vault.create(path, fillTemplate(target.contentTemplate, vars));
}

function isCtrl(evt: MouseEvent | KeyboardEvent): boolean {
  return evt.ctrlKey || evt.metaKey;
}

function openExternally(target: string): void {
  window.open(target);
}

function openPdf(entry: BibEntry): void {
  const pdf = entry.files.find((f) => f.toLowerCase().endsWith(".pdf"));
  if (!pdf) {
    new Notice("This reference has no PDF attached.");
    return;
  }
  // Loaded when needed so nothing but this action depends on Electron.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { shell } = require("electron") as { shell: { openPath(p: string): Promise<string> } };
  void shell.openPath(pdf).then((err) => {
    if (err) new Notice(`Couldn't open the PDF: ${err}`);
  });
}

function reportFailure(what: string, e: unknown): void {
  console.error(`Zotero Citations Sync: ${what}`, e);
  new Notice(`${what}: ${(e as Error).message}`);
}

/** Registers the commands that replace the Citations plugin. */
export function registerCitationCommands(plugin: ZoteroCitationsSyncPlugin): void {
  const { app } = plugin;

  const search = async (options: ModalOptions): Promise<void> => {
    await plugin.library.refresh();
    const items = [...plugin.library.entries.values()];
    if (!items.length) {
      new Notice(plugin.library.lastProblem ?? "No references found. Check the .bib file in this plugin's settings.", 8000);
      return;
    }
    new CitationSearchModal(app, items, options).open();
  };

  // While the Citations plugin is enabled it owns these hotkeys, and binding them twice would
  // fire both plugins. They apply from the next load once it's turned off.
  const citationsEnabled = (
    app as unknown as { plugins?: { enabledPlugins?: Set<string> } }
  ).plugins?.enabledPlugins?.has("obsidian-citation-plugin");
  const hotkey = (key: string) => (citationsEnabled ? {} : { hotkeys: [{ modifiers: ["Mod", "Shift"] as Modifier[], key }] });

  plugin.addCommand({
    id: "open-literature-note",
    name: "Open literature note",
    ...hotkey("o"),
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
            if (evt.shiftKey) openPdf(entry);
            else openExternally(entry.zoteroSelectURI);
            return;
          }
          getOrCreateNote(plugin, entry)
            .then((file) => app.workspace.getLeaf(isCtrl(evt)).openFile(file))
            .catch((e) => reportFailure("Couldn't open the literature note", e));
        },
      }),
  });

  plugin.addCommand({
    id: "insert-note-link",
    name: "Insert literature note link",
    ...hotkey("e"),
    editorCallback: (editor: Editor, ctx) =>
      void search({
        instructions: [
          ["↑↓", "to navigate"],
          ["↵", "to insert link to literature note"],
          ["esc", "to dismiss"],
        ],
        keys: [],
        choose: (entry) => {
          getOrCreateNote(plugin, entry)
            .then((file) => {
              editor.replaceSelection(app.fileManager.generateMarkdownLink(file, ctx.file?.path ?? ""));
            })
            .catch((e) => reportFailure("Couldn't create the literature note", e));
        },
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
          editor.replaceSelection(fillTemplate(plugin.noteTarget().contentTemplate, entryVars(entry)));
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

  plugin.addCommand({
    id: "refresh-library",
    name: "Refresh citation library",
    ...hotkey("r"),
    callback: () =>
      void plugin.library.refresh(true).then(() => {
        const { entries, lastProblem } = plugin.library;
        new Notice(lastProblem ?? `Citation library: ${entries.size} references loaded.`, lastProblem ? 8000 : 4000);
      }),
  });
}
