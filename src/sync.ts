import { App, TFile, normalizePath } from "obsidian";
import { ZoteroClient, ZoteroItemData, ZoteroUnavailableError } from "./zotero";
import {
  Markers,
  SyncedItem,
  ZOTERO_MARKERS,
  assembleBlock,
  authorString,
  fillTemplate,
  mergeBlock,
  renderZoteroBlock,
  templateVars,
} from "./render";
import {
  KindleBook,
  authorSurname,
  kindleParagraphKey,
  parseClippings,
  pickCandidate,
  renderKindleEntries,
  searchQueries,
  searchTitle,
} from "./kindle";
import type { ZoteroSyncSettings } from "./settings";

export interface SyncResult {
  items: number;
  annotations: number;
  created: number;
  updated: number;
  unchanged: number;
  skippedNoCitekey: number;
  bbtOffline: boolean;
  libraryVersion: number;
}

export interface NoteTarget {
  folder: string;
  titleTemplate: string;
  contentTemplate: string;
}

/** Characters that can't appear in file names on Windows/macOS. */
const UNSAFE = /[\\/:*?"<>|]/g;

// ====================================================================== Zotero

export async function syncLibrary(
  app: App,
  client: ZoteroClient,
  settings: ZoteroSyncSettings,
  target: NoteTarget
): Promise<SyncResult> {
  const libraryVersion = await client.libraryVersion();

  // 1. Everything annotation-shaped, minus the trash.
  const annotations = (await client.allItemsOfType("annotation")).filter((a) => !a.deleted && a.parentItem);
  const notes = settings.includeChildNotes
    ? (await client.allItemsOfType("note")).filter((n) => !n.deleted && n.parentItem)
    : [];

  // 2. Annotations hang off attachments; resolve attachment → parent item.
  const attachmentKeys = uniq(annotations.map((a) => a.parentItem as string));
  const attachments = await client.itemsByKey(attachmentKeys);

  const byParent = new Map<string, SyncedItem>();
  const bucket = (parentKey: string): SyncedItem => {
    let it = byParent.get(parentKey);
    if (!it) {
      it = { key: parentKey, title: "", year: "", authorString: "", annotations: [], notes: [] };
      byParent.set(parentKey, it);
    }
    return it;
  };

  for (const a of annotations) {
    const att = attachments.get(a.parentItem as string);
    const parentKey = att?.parentItem; // standalone PDFs have no parent → skipped
    if (!parentKey || att?.deleted) continue;
    bucket(parentKey).annotations.push(a);
  }
  for (const n of notes) bucket(n.parentItem as string).notes.push(n);

  // 3. Parent metadata (title/authors/year) for frontmatter of new notes, and to drop trashed parents.
  const parents = await client.itemsByKey([...byParent.keys()]);
  for (const [key, item] of byParent) {
    const p = parents.get(key);
    if (!p || p.deleted) {
      byParent.delete(key);
      continue;
    }
    item.title = p.title ?? "";
    item.year = (p.date ?? "").match(/\d{4}/)?.[0] ?? "";
    item.authorString = authorString(p.creators);
    item.annotations.sort(bySortIndex);
  }

  // 4. Citekeys via Better BibTeX, falling back to whatever we resolved last time.
  let bbtOffline = false;
  try {
    Object.assign(settings.citekeyCache, await client.citekeys([...byParent.keys()]));
  } catch (e) {
    if (!(e instanceof ZoteroUnavailableError)) throw e;
    bbtOffline = true;
  }

  // 5. Write.
  const result: SyncResult = {
    items: byParent.size,
    annotations: annotations.length,
    created: 0,
    updated: 0,
    unchanged: 0,
    skippedNoCitekey: 0,
    bbtOffline,
    libraryVersion,
  };

  for (const item of byParent.values()) {
    const citekey = settings.citekeyCache[item.key];
    if (!citekey) {
      result.skippedNoCitekey++;
      continue;
    }
    const vars = templateVars(item, citekey);
    const path = notePath(target, fillTemplate(target.titleTemplate, vars));
    const block = renderZoteroBlock(item, settings.blockHeading);
    const head = settings.createMissingNotes ? fillTemplate(target.contentTemplate, vars) : null;
    tally(result, await writeBlock(app, path, block, ZOTERO_MARKERS, head));
  }

  return result;
}

// ====================================================================== Kindle

export const KINDLE_MARKERS: Markers = {
  start: "%% kindle-sync:start %%",
  end: "%% kindle-sync:end %%",
  keyOf: kindleParagraphKey,
};
export interface KindleResult {
  books: number;
  highlights: number;
  created: number;
  updated: number;
  unchanged: number;
  matched: number;
  unmatched: string[];
  skipped: number;
}

/** "Raw Kindle title => citekey" lines from settings; value "skip" ignores the book. */
export function parseOverrides(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf("=>");
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 2).trim();
    if (k && v) out[k] = v;
  }
  return out;
}

export async function syncKindle(
  app: App,
  client: ZoteroClient | null,
  settings: ZoteroSyncSettings,
  target: NoteTarget,
  clippings: string
): Promise<KindleResult> {
  const books = parseClippings(clippings);
  const overrides = parseOverrides(settings.kindleOverrides);
  const result: KindleResult = {
    books: books.length,
    highlights: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    matched: 0,
    unmatched: [],
    skipped: 0,
  };

  for (const book of books) {
    result.highlights += book.highlights.length;
    const citekey = await resolveCitekey(book, overrides, settings, client);
    if (citekey === "skip") {
      result.skipped++;
      continue;
    }

    let path: string;
    let head: string;
    if (citekey) {
      result.matched++;
      const vars = { citekey, title: book.title, authorString: book.author, year: "" };
      path = notePath(target, fillTemplate(target.titleTemplate, vars));
      head = fillTemplate(target.contentTemplate, vars);
    } else {
      // Not in Zotero: keep the highlights anyway, in a note named after the book.
      result.unmatched.push(book.rawTitle);
      path = notePath(target, book.title);
      head = `---\ntitle: ${book.title}\nauthors: ${book.author}\nsource: kindle\n---\n`;
    }

    const block = assembleBlock(KINDLE_MARKERS, settings.kindleHeading, renderKindleEntries(book));
    tally(result, await writeBlock(app, path, block, KINDLE_MARKERS, settings.createMissingNotes ? head : null));

    // A book that used to be unmatched left a title-named note behind. If that
    // note holds nothing but the synced block, it's now redundant — trash it.
    if (citekey) {
      for (const stale of [book.title, book.rawTitle.replace(/\s*\(Z-Library\)\s*/gi, " ").trim()]) {
        const stalePath = notePath(target, stale);
        if (stalePath !== path) await trashIfUntouched(app, stalePath, KINDLE_MARKERS);
      }
    }
  }
  return result;
}

async function trashIfUntouched(app: App, path: string, markers: Markers): Promise<void> {
  const f = app.vault.getAbstractFileByPath(path);
  if (!(f instanceof TFile)) return;
  const content = await app.vault.read(f);
  if (!/^---\n[\s\S]*?\nsource: kindle\n[\s\S]*?---/.test(content)) return; // only notes we created
  const rest = content
    .replace(/^---\n[\s\S]*?\n---\n?/, "")
    .replace(new RegExp(escapeRe(markers.start) + "[\\s\\S]*?" + escapeRe(markers.end)), "")
    .trim();
  if (rest === "") await app.vault.trash(f, true);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Override → cached auto-match → Better BibTeX search (title, then author surname
 * must appear in the result's authors) → "" when nothing fits.
 */
async function resolveCitekey(
  book: KindleBook,
  overrides: Record<string, string>,
  settings: ZoteroSyncSettings,
  client: ZoteroClient | null
): Promise<string> {
  if (overrides[book.rawTitle]) return overrides[book.rawTitle];
  const cached = settings.kindleMatchCache[book.rawTitle];
  if (cached) return cached;
  if (!client) return "";

  const query = searchTitle(book.title);
  const surname = authorSurname(book.author);
  // Zotero's quick search wants every word to hit, so try a few phrasings.
  for (const q of searchQueries(book.title)) {
    let hits;
    try {
      hits = await client.search(q);
    } catch {
      return "";
    }
    const citekey = pickCandidate(hits, query, surname);
    if (citekey) {
      settings.kindleMatchCache[book.rawTitle] = citekey;
      return citekey;
    }
  }
  return "";
}

// ====================================================================== shared

interface WriteOutcome {
  created?: true;
  updated?: true;
  unchanged?: true;
}

/**
 * Put `block` into the note at `path`. Existing note: merge into its marked
 * region. Missing note: create it from `head` (frontmatter), or do nothing when
 * `head` is null.
 */
async function writeBlock(app: App, path: string, block: string, markers: Markers, head: string | null): Promise<WriteOutcome> {
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof TFile) {
    const old = await app.vault.read(existing);
    const next = mergeBlock(old, block, markers);
    if (next === old) return { unchanged: true };
    await app.vault.modify(existing, next);
    return { updated: true };
  }
  if (head === null) return {};
  const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  if (folder && !app.vault.getAbstractFileByPath(folder)) await app.vault.createFolder(folder);
  await app.vault.create(path, head.replace(/\n*$/, "\n\n") + block + "\n");
  return { created: true };
}

export function notePath(target: NoteTarget, fileName: string): string {
  const safe = fileName.replace(UNSAFE, "_").trim() + ".md";
  return normalizePath(target.folder ? `${target.folder}/${safe}` : safe);
}

function tally(r: { created: number; updated: number; unchanged: number }, o: WriteOutcome): void {
  if (o.created) r.created++;
  else if (o.updated) r.updated++;
  else if (o.unchanged) r.unchanged++;
}

function bySortIndex(a: ZoteroItemData, b: ZoteroItemData): number {
  return (a.annotationSortIndex ?? "").localeCompare(b.annotationSortIndex ?? "");
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}
