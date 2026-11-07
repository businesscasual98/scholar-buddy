/**
 * Carries [[wikilinks]] the user added inside a synced block over to the
 * freshly rendered block, so linking words in a quote survives a re-sync.
 *
 * Both blocks are split into paragraphs. Paragraphs that carry a stable id
 * (an annotation key, a Kindle location) are matched by id; the rest are
 * pooled. For every link in an old paragraph we look for its visible text in
 * the corresponding new paragraph and wrap it again. If the text is gone from
 * Zotero/Kindle, the link is dropped — there's nothing left to anchor it to.
 */

const LINK_RE = /\[\[[^\]]+\]\]/g;

export type KeyOf = (paragraph: string) => string | null;

export function carryWikilinks(oldBlock: string, newBlock: string, keyOf: KeyOf): string {
  if (!LINK_RE.test(oldBlock)) return newBlock;
  LINK_RE.lastIndex = 0;

  const oldParas = oldBlock.split("\n\n");
  const newParas = newBlock.split("\n\n");

  const oldByKey = new Map<string, string>();
  const oldPool: string[] = [];
  for (const p of oldParas) {
    const k = keyOf(p);
    if (k) oldByKey.set(k, p);
    else oldPool.push(p);
  }

  const out: string[] = [];
  const unkeyedIdx: number[] = [];
  for (const p of newParas) {
    const k = keyOf(p);
    if (k && oldByKey.has(k)) {
      out.push(relink(oldByKey.get(k) as string, p));
    } else {
      out.push(p);
      if (!k) unkeyedIdx.push(out.length - 1);
    }
  }

  // Unkeyed paragraphs (heading, notes section, …): relink them as one unit so
  // links survive even if the paragraphs shifted around a little.
  if (unkeyedIdx.length && oldPool.length) {
    const joined = relink(oldPool.join("\n\n"), unkeyedIdx.map((i) => out[i]).join("\n\n"));
    const pieces = joined.split("\n\n");
    if (pieces.length === unkeyedIdx.length) unkeyedIdx.forEach((i, n) => (out[i] = pieces[n]));
  }

  return out.join("\n\n");
}

/** Re-apply every [[link]] found in `oldText` to `newText`. */
export function relink(oldText: string, newText: string): string {
  const links = oldText.match(LINK_RE) ?? [];
  let out = newText;
  let cursor = 0;
  for (const link of links) {
    const visible = visibleText(link);
    if (!visible) continue;
    let idx = findOutsideLinks(out, visible, cursor);
    if (idx < 0 && cursor > 0) idx = findOutsideLinks(out, visible, 0);
    if (idx < 0) continue;
    out = out.slice(0, idx) + link + out.slice(idx + visible.length);
    cursor = idx + link.length;
  }
  return out;
}

/** The text a reader sees for a link: alias if present, else the target. */
function visibleText(link: string): string {
  const inner = link.slice(2, -2);
  const bar = inner.lastIndexOf("|");
  return (bar >= 0 ? inner.slice(bar + 1) : inner).trim();
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

/**
 * Index of `needle` in `hay` at or after `from`, as a whole word (so "a" never
 * matches inside "and"), skipping matches that sit inside an existing [[...]].
 */
function findOutsideLinks(hay: string, needle: string, from: number): number {
  const spans: [number, number][] = [];
  for (const m of hay.matchAll(LINK_RE)) spans.push([m.index, (m.index) + m[0].length]);
  let i = hay.indexOf(needle, from);
  while (i >= 0) {
    const end = i + needle.length;
    const inside = spans.some(([s, e]) => i >= s && i < e);
    const wholeWord =
      !(i > 0 && WORD_CHAR.test(hay[i - 1]) && WORD_CHAR.test(needle[0])) &&
      !(end < hay.length && WORD_CHAR.test(hay[end]) && WORD_CHAR.test(needle[needle.length - 1]));
    if (!inside && wholeWord) return i;
    i = hay.indexOf(needle, i + 1);
  }
  return -1;
}
