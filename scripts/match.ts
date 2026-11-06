// Runs the plugin's real Kindle→Zotero matcher against a live Better BibTeX for every book in a clippings file.
//   npx esbuild scripts/match.ts --bundle --platform=node --outfile=scripts/match.js && node scripts/match.js "<clippings>"
import { readFileSync } from "fs";
import { authorSurname, parseClippings, pickCandidate, searchQueries, searchTitle } from "../src/kindle";

const BBT = "http://127.0.0.1:23119/better-bibtex/json-rpc";

async function search(q: string) {
  const res = await fetch(BBT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "item.search", params: [q], id: 1 }),
  });
  return ((await res.json()) as { result?: unknown[] }).result ?? [];
}

(async () => {
  const books = parseClippings(readFileSync(process.argv[2], "utf-8"));
  let ok = 0;
  const miss: string[] = [];
  for (const b of books) {
    let found: string | null = null;
    for (const q of searchQueries(b.title)) {
      found = pickCandidate((await search(q)) as never, searchTitle(b.title), authorSurname(b.author));
      if (found) break;
    }
    if (found) ok++;
    else miss.push(b.rawTitle);
    console.log(`${found ? "OK  " : "MISS"} ${b.title.slice(0, 44).padEnd(44)} ${found ?? ""}`);
  }
  console.log(`\n${ok}/${books.length} matched; unmatched: ${JSON.stringify(miss)}`);
})();
