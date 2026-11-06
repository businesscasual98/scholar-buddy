// Copies the built plugin into a vault's .obsidian/plugins folder.
//   node scripts/install-local.mjs "C:\path\to\vault"
import { cpSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const vault = process.argv[2];
if (!vault || !existsSync(join(vault, ".obsidian"))) {
  console.error("usage: node scripts/install-local.mjs <vault path>");
  process.exit(1);
}
const dest = join(vault, ".obsidian", "plugins", "zotero-citations-sync");
mkdirSync(dest, { recursive: true });
for (const f of ["main.js", "manifest.json", "styles.css"]) cpSync(f, join(dest, f));
console.log("installed to", dest);
