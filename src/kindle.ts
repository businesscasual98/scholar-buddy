/**
 * Parser + renderer for Kindle's "My Clippings.txt". Pure: no Obsidian imports,
 * so it can be tested from Node.
 */

export interface KindleHighlight {
  text: string;
  page?: string;
  locStart?: number;
  locEnd?: number;
  added: string;
  /** A note the reader typed on this highlight (Kindle stores it as a separate entry at the same location). */
  note?: string;
  /** True for a note with no highlight under it. */
  standalone?: boolean;
}

export interface KindleBook {
  /** Exactly as it appears in the clippings file — used as the stable id for overrides/cache. */
  rawTitle: string;
  title: string;
  author: string;
  /** Only known for Zotero-named PDFs ("Author - Year - Title"). */
  year?: string;
  highlights: KindleHighlight[];
}

interface Clipping {
  rawTitle: string;
  kind: "highlight" | "note" | "bookmark" | "clip";
  page?: string;
  locStart?: number;
  locEnd?: number;
  added: string;
  text: string;
}

const META_RE =
  /^- Your (Highlight|Note|Bookmark|Clip)(?: (?:on|at))?(?: page (\S+))?(?: \|)?(?: (?:Location|Loc\.) (\d+)(?:-(\d+))?)?.*?\| Added on (.+)$/i;

export function parseClippings(raw: string): KindleBook[] {
  const clippings: Clipping[] = [];
  for (const entry of raw.split(/^==========\r?$/m)) {
    const lines = entry.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
    if (lines.length < 2) continue;
    const rawTitle = lines[0].replace(/\uFEFF/g, "").trim();
    const m = lines[1].trim().match(META_RE);
    if (!m) continue;
    const [, kind, page, ls, le, added] = m;
    clippings.push({
      rawTitle,
      kind: kind.toLowerCase() as Clipping["kind"],
      page: page || undefined,
      locStart: ls ? parseInt(ls, 10) : undefined,
      locEnd: le ? parseInt(le, 10) : ls ? parseInt(ls, 10) : undefined,
      added: added.trim(),
      text: lines.slice(2).join("\n").trim(),
    });
  }

  const books = new Map<string, KindleBook>();
  for (const c of clippings) {
    let book = books.get(c.rawTitle);
    if (!book) {
      const { title, author, year } = splitTitle(c.rawTitle);
      book = { rawTitle: c.rawTitle, title, author, year, highlights: [] };
      books.set(c.rawTitle, book);
    }
    if (c.kind === "highlight" && c.text) {
      book.highlights.push({ text: c.text, page: c.page, locStart: c.locStart, locEnd: c.locEnd, added: c.added });
    }
  }

  for (const book of books.values()) {
    book.highlights = dedupe(book.highlights);
    attachNotes(
      book,
      clippings.filter((c) => c.rawTitle === book.rawTitle && c.kind === "note" && c.text)
    );
    book.highlights.sort(byPosition);
  }

  return [...books.values()].filter((b) => b.highlights.length);
}

/**
 * "Istanbul (Vintage International) (Pamuk, Orhan)" → title "Istanbul", author "Orhan Pamuk".
 * Kindle puts the author in the last parenthetical; anything before it is series/edition noise.
 */
export function splitTitle(rawTitle: string): { title: string; author: string; year?: string } {
  let t = rawTitle.replace(/\s*\(Z-Library\)\s*/gi, " ").trim();
  let author = "";

  // PDFs sent from Zotero are named "Author - Year - Title" (or "Last, First - Title").
  const zotero = t.match(/^(.+?) - (\d{4}) - (.+)$/);
  if (zotero) {
    return { title: zotero[3].trim(), author: zotero[1].replace(/\s+et al\.?$/i, "").trim(), year: zotero[2] };
  }
  const lastFirst = t.match(/^([^-]+,[^-]+) - (.+)$/);
  if (lastFirst) {
    return { title: lastFirst[2].trim(), author: normalizeAuthor(lastFirst[1]) };
  }
  const m = t.match(/^(.*)\(([^()]*)\)\s*$/);
  if (m) {
    author = m[2].trim();
    t = m[1].trim();
  }
  // strip remaining trailing parentheticals like "(Vintage International)"
  for (;;) {
    const s = t.match(/^(.*)\([^()]*\)\s*$/);
    if (!s) break;
    t = s[1].trim();
  }
  return { title: t.replace(/\s{2,}/g, " "), author: normalizeAuthor(author) };
}

/** "Kimmerer, Robin Wall" → "Robin Wall Kimmerer"; leaves "Haruki Murakami; Jay Rubin" alone. */
export function normalizeAuthor(a: string): string {
  const s = a.replace(/\s{2,}/g, " ").trim();
  if (s.includes(";") || s.includes("[")) return s;
  const parts = s.split(",").map((p) => p.trim());
  return parts.length === 2 && parts[1] ? `${parts[1]} ${parts[0]}` : s;
}

/** Search-friendly version of a title: first clause only, no punctuation. */
export function searchTitle(title: string): string {
  return title
    .split(/[:–—]| - /)[0]
    .replace(/[^\p{L}\p{N}' ]+/gu, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Surname to check a Zotero match against; last word of the normalized author, or "". */
export function authorSurname(author: string): string {
  const first = author.split(/[;,]/)[0].replace(/\[.*?\]/g, "").trim();
  const words = first.split(/\s+/).filter(Boolean);
  return normKey(words[words.length - 1] ?? "");
}

/** Comparison key: no accents, case or punctuation ("Forché" → "forche", "30-Year" → "30year"). */
export function normKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export interface MatchCandidate {
  citekey?: string;
  title?: string;
  author?: { family?: string; literal?: string }[];
}

/**
 * Pick the one Zotero item that is this Kindle book, or null when it's absent
 * or ambiguous. Title must match at the start in either direction (Kindle's
 * "The Fraud A Novel" vs Zotero's "The Fraud"), the author surname must appear,
 * and when several fit ("Dune" vs "Dune Messiah") only an exact title wins.
 */
export function pickCandidate(hits: MatchCandidate[], query: string, surname: string): string | null {
  const q = normKey(query);
  if (!q) return null;
  const fits = hits.filter((h) => {
    const t = normKey(h.title ?? "");
    const titleOk = t.length > 0 && (t.startsWith(q) || q.startsWith(t));
    const authorOk = !surname || (h.author ?? []).some((a) => normKey(a.family ?? a.literal ?? "").includes(surname));
    return titleOk && authorOk;
  });
  if (fits.length === 1) return fits[0].citekey ?? null;
  const exact = fits.filter((h) => normKey(h.title ?? "") === q);
  return exact.length === 1 ? exact[0].citekey ?? null : null;
}

/**
 * Search queries to try, most specific first. Better BibTeX's search is a
 * substring match, so keep the title's own punctuation ("Cry, the Beloved
 * Country") and, when the Kindle title is longer than Zotero's ("The Fraud A
 * Novel" vs "The Fraud"), fall back to shorter and shorter prefixes.
 */
export function searchQueries(title: string): string[] {
  const words = title.split(/[:–—]| - /)[0].replace(/\s{2,}/g, " ").trim().split(" ").filter(Boolean);
  const out: string[] = [];
  for (let n = words.length; n >= Math.min(2, words.length); n--) out.push(words.slice(0, n).join(" "));
  return out.filter((q) => q.length > 0);
}

/** Kindle keeps the old entry when you extend a highlight; keep only the longest of overlapping ones. */
function dedupe(hs: KindleHighlight[]): KindleHighlight[] {
  const out: KindleHighlight[] = [];
  for (const h of hs) {
    const norm = h.text.replace(/\s+/g, " ");
    if (out.some((o) => o.text.replace(/\s+/g, " ").includes(norm))) continue; // subset of something kept
    for (let i = out.length - 1; i >= 0; i--) {
      if (norm.includes(out[i].text.replace(/\s+/g, " "))) out.splice(i, 1); // supersedes an earlier one
    }
    out.push(h);
  }
  return out;
}

function attachNotes(book: KindleBook, notes: Clipping[]): void {
  for (const n of notes) {
    const loc = n.locStart;
    let host: KindleHighlight | undefined;
    if (loc !== undefined) {
      host =
        book.highlights.find((h) => h.locStart !== undefined && h.locEnd !== undefined && loc >= h.locStart && loc <= h.locEnd) ??
        book.highlights.find((h) => h.locEnd === loc) ??
        book.highlights.find((h) => h.locEnd !== undefined && Math.abs(h.locEnd - loc) <= 2);
    } else if (n.page) {
      host = book.highlights.find((h) => h.page === n.page);
    }
    if (host) host.note = host.note ? host.note + "\n" + n.text : n.text;
    else book.highlights.push({ text: "", note: n.text, standalone: true, page: n.page, locStart: loc, locEnd: loc, added: n.added });
  }
}

function byPosition(a: KindleHighlight, b: KindleHighlight): number {
  const la = a.locStart ?? pageNum(a.page) ?? 0;
  const lb = b.locStart ?? pageNum(b.page) ?? 0;
  return la - lb;
}

function pageNum(p?: string): number | undefined {
  const n = parseInt((p ?? "").split("-")[0], 10);
  return Number.isFinite(n) ? n : undefined;
}

// ------------------------------------------------------------------ render

export function positionRef(h: KindleHighlight): string {
  const parts: string[] = [];
  if (h.page) parts.push(`p. ${h.page}`);
  if (h.locStart !== undefined) parts.push(`loc. ${h.locStart}${h.locEnd && h.locEnd !== h.locStart ? "-" + h.locEnd : ""}`);
  return parts.join(" · ") || "n.p.";
}

export function renderKindleEntries(book: KindleBook): string[] {
  const q = (s: string) => s.trim().split(/\r?\n/).map((l) => "> " + l).join("\n");
  return book.highlights.map((h) => {
    const ref = positionRef(h);
    if (h.standalone) return `- ✎ ${(h.note ?? "").trim()} — ${ref}`;
    let out = q(`"${h.text}" — ${ref}`);
    if (h.note) out += "\n" + q(h.note).replace(/^> /, ">   ↳ ");
    return out;
  });
}

/** Stable id for a Kindle paragraph — used to carry wikilinks across syncs. */
export function kindleParagraphKey(p: string): string | null {
  const m = p.match(/— ((?:p\. \S+)?(?: · )?(?:loc\. [\d-]+)?)\s*$/m);
  return m && m[1] ? "k:" + m[1] : null;
}
