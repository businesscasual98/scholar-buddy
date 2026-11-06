import type { ZoteroItemData } from "./zotero";
import { carryWikilinks, KeyOf } from "./links";

export interface Markers {
  start: string;
  end: string;
  /** Extracts a stable id from a rendered paragraph, for carrying wikilinks across syncs. */
  keyOf: KeyOf;
}

export const ZOTERO_MARKERS: Markers = {
  start: "%% zotero-sync:start %%",
  end: "%% zotero-sync:end %%",
  keyOf: (p) => p.match(/annotation=([A-Z0-9]{8})\)/)?.[1] ?? null,
};

export const BLOCK_NOTICE =
  "*Auto-generated — regenerated on every sync. Wiki-links you add around words in the quotes are kept; other edits inside this block are overwritten.*";

export interface SyncedItem {
  key: string;
  title: string;
  year: string;
  authorString: string;
  annotations: ZoteroItemData[];
  notes: ZoteroItemData[];
}

/** Zotero item metadata → template variables (a subset of what Citations offers). */
export function templateVars(item: SyncedItem, citekey: string): Record<string, string> {
  return { citekey, title: item.title, year: item.year, authorString: item.authorString };
}

/** Minimal {{var}} substitution; unknown variables become empty strings. */
export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, name: string) => vars[name] ?? "");
}

export function authorString(creators: ZoteroItemData["creators"]): string {
  return (creators ?? [])
    .map((c) => c.name ?? [c.firstName, c.lastName].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(", ");
}

function quote(text: string): string {
  return text
    .trim()
    .split(/\r?\n/)
    .map((l) => "> " + l)
    .join("\n");
}

function htmlToMarkdown(html: string): string {
  const s = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h\d|li|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<(b|strong)>([\s\S]*?)<\/\1>/gi, "**$2**")
    .replace(/<(i|em)>([\s\S]*?)<\/\1>/gi, "*$2*")
    .replace(/<[^>]+>/g, "");
  const el = document.createElement("textarea");
  el.innerHTML = s; // decode entities; textarea never executes markup
  return el.value.replace(/\n{3,}/g, "\n\n").trim();
}

function renderAnnotation(a: ZoteroItemData): string {
  const page = a.annotationPageLabel ?? "";
  const link = `zotero://open-pdf/library/items/${a.parentItem}?page=${encodeURIComponent(page)}&annotation=${a.key}`;
  const ref = `[${page ? "p. " + page : "open"}](${link})`;
  const comment = (a.annotationComment ?? "").trim();
  const text = (a.annotationText ?? "").trim();

  switch (a.annotationType) {
    case "highlight":
    case "underline": {
      let out = quote(`"${text}" — ${ref}`);
      if (comment) out += "\n" + quote(comment).replace(/^> /, ">   ↳ ");
      return out;
    }
    case "note":
    case "text":
      return `- ✎ ${comment || text} — ${ref}`;
    case "image":
      return `- 🖼 image annotation — ${ref}${comment ? ": " + comment : ""}`;
    case "ink":
      return `- ✍ ink annotation — ${ref}${comment ? ": " + comment : ""}`;
    default:
      return `- annotation — ${ref}`;
  }
}

export function renderZoteroBlock(item: SyncedItem, heading: string): string {
  const entries = item.annotations.map(renderAnnotation);
  if (item.notes.length) {
    entries.push("### Zotero notes");
    for (const n of item.notes) entries.push(htmlToMarkdown(n.note ?? ""));
  }
  return assembleBlock(ZOTERO_MARKERS, heading, entries);
}

/** START / heading / notice / blank / entries separated by blank lines / END. */
export function assembleBlock(markers: Markers, heading: string, entries: string[]): string {
  const parts: string[] = [markers.start, heading, BLOCK_NOTICE, ""];
  for (const e of entries) parts.push(e + "\n");
  parts.push(markers.end);
  return parts.join("\n");
}

function blockRe(m: Markers): RegExp {
  return new RegExp(escapeRe(m.start) + "[\\s\\S]*?" + escapeRe(m.end));
}

/**
 * Replace the marked region in `existing` (carrying the user's wikilinks over),
 * or append the block if the note has none yet.
 */
export function mergeBlock(existing: string, block: string, markers: Markers): string {
  const re = blockRe(markers);
  const old = existing.match(re)?.[0];
  if (old !== undefined) {
    const merged = carryWikilinks(old, block, markers.keyOf);
    return existing.replace(re, () => merged);
  }
  return existing.replace(/\n+$/, "") + "\n\n" + block + "\n";
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
