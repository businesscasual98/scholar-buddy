// Node-side smoke test for the pure modules, run against a real clippings file:
//   npx esbuild scripts/smoke.ts --bundle --platform=node --outfile=scripts/smoke.js && node scripts/smoke.js "<clippings>"
import { readFileSync } from "fs";
import { parseClippings, renderKindleEntries, kindleParagraphKey, searchTitle, authorSurname } from "../src/kindle";
import { carryWikilinks, relink } from "../src/links";

const file = process.argv[2];
const books = parseClippings(readFileSync(file, "utf-8"));
console.log(`${books.length} books, ${books.reduce((n, b) => n + b.highlights.length, 0)} highlights after dedupe`);
for (const b of books.slice(0, 60)) {
  const notes = b.highlights.filter((h) => h.note).length;
  console.log(
    `${String(b.highlights.length).padStart(3)}  ${b.title.slice(0, 45).padEnd(45)} | ${b.author.padEnd(22)} | q="${searchTitle(b.title)}" surname=${authorSurname(b.author)}${notes ? ` notes=${notes}` : ""}`
  );
}

const boggs = books.find((b) => b.rawTitle.startsWith("The Next American"));
if (boggs) {
  console.log("\n--- sample render (Boggs, first 3 + any with notes)");
  const entries = renderKindleEntries(boggs);
  console.log(entries.slice(0, 3).join("\n\n"));
  console.log(entries.filter((e) => e.includes("↳")).slice(0, 2).join("\n\n"));
  console.log("keys:", entries.slice(0, 3).map(kindleParagraphKey));
}

console.log("\n--- wikilink carry-over");
const oldBlock = [
  "%% zotero-sync:start %%",
  "## Zotero annotations",
  "*notice*",
  "",
  '> "professional [[sociology]], public sociology, and [[Public Policy|policy sociology]]" — [p. 411](zotero://open-pdf/library/items/X?page=411&annotation=N7VN6L45)',
  "",
  '> "we must acknowledge our [[limitations]]" — [p. 414](zotero://open-pdf/library/items/X?page=414&annotation=74VNBWRE)',
  "",
  "%% zotero-sync:end %%",
].join("\n");
const newBlock = [
  "%% zotero-sync:start %%",
  "## Zotero annotations",
  "*notice*",
  "",
  '> "we must acknowledge our limitations regarding policy" — [p. 414](zotero://open-pdf/library/items/X?page=414&annotation=74VNBWRE)',
  "",
  '> "professional sociology, public sociology, and policy sociology" — [p. 411](zotero://open-pdf/library/items/X?page=411&annotation=N7VN6L45)',
  ">   ↳ new comment from Zotero",
  "",
  "%% zotero-sync:end %%",
].join("\n");
const keyOf = (p: string) => p.match(/annotation=([A-Z0-9]{8})\)/)?.[1] ?? null;
console.log(carryWikilinks(oldBlock, newBlock, keyOf));
console.log("\nrelink same word twice:", relink("[[a]] and [[a]]", "a and a and a"));
console.log("relink word removed:", relink('"[[gone]] word"', '"other word"'));
