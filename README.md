# Zotero Citations Sync

**Your Zotero highlights, in your Obsidian literature notes, automatically.**

Highlight a PDF in Zotero → the quote appears in that paper's note in Obsidian, with a link that jumps back to the exact spot in the PDF. No export step, no templates to configure, and your own writing in the note is never touched.

It also searches your library and inserts citations, and can replace the [Citations](https://github.com/hans/obsidian-citation-plugin) plugin outright: it uses the same `@citekey` notes, folder and Better BibTeX citekeys, and copies your Citations settings the first time it runs.

```
---
citekey: vaughanRelevanceEthnographyProduction2005
title: On the relevance of ethnography for the production of public sociology and policy
authors: Diane Vaughan
year: 2005
---
Mentions a [[Burawoy]] article introducing "back-translation" — think about   ← your notes,
this in my role with the [[defense]] sector.                                   ← untouched

%% zotero-sync:start %%
## Zotero annotations
*Auto-generated from Zotero — edit in Zotero, not here. Notes above/below this block are safe.*

> "professional sociology, public sociology, critical sociology, and policy sociology" — [p. 411](zotero://open-pdf/…)

> "sociologists actively taking professional knowledge back to those from whom it came" — [p. 413](zotero://open-pdf/…)

- ✎ policymakers need theory and evidence hooks — make them accessible — [p. 413](zotero://open-pdf/…)
%% zotero-sync:end %%
```

## What it does

- **Searches your library.** `Open literature note`, `Insert literature note link`, `Insert literature note content` and `Insert citation` search your Better BibTeX `.bib` export, so they work even when Zotero is closed. See [Citations](#citations).
- **Syncs on its own.** Runs when Obsidian opens, then watches Zotero for changes (one tiny request every 30 s — a real sync only happens when something changed). There's also a ribbon button and a `Sync annotations from Zotero now` command.
- **Keeps your writing safe.** Everything from Zotero lives between two `%% zotero-sync %%` markers (invisible in reading view). Anything outside them is yours and is never modified. Delete the block and it'll be re-added; edit inside it and your edits will be overwritten next sync — Zotero is the source of truth there.
- **…except your wikilinks.** Wrap a word or phrase in a quote with `[[brackets]]` (or `[[Target|alias]]`) and it survives every sync. The plugin finds the same text in the freshly rendered quote and re-links it. If the highlight is deleted in Zotero, the link goes with it.
- **Kindle too** (optional). Point it at a copy of your Kindle's `My Clippings.txt` and highlights land in the same notes, in a `%% kindle-sync %%` block. Books are matched to Zotero items by title + author; books that aren't in Zotero still get a note named after the book so nothing is lost. See [Kindle](#kindle).
- **Round-trips to the PDF.** Every highlight links to `zotero://open-pdf/…`, so clicking `p. 413` opens the PDF in Zotero scrolled to that highlight.
- **Handles all annotation types.** Highlights and underlines become blockquotes (with your comment indented beneath), sticky notes become bullets, image/ink annotations get a placeholder link. Zotero child notes are included too (toggle in settings).
- **Creates notes for un-noted papers** (optional). If you've annotated a paper but never made a literature note, one is created using your Citations content template.
- **Stays quiet.** Nothing is written if nothing changed, so file-sync tools (Remotely Save, Obsidian Sync, git) don't see churn.

## Requirements

| | |
|---|---|
| **Zotero 7 or newer** running on the same computer | The plugin talks to Zotero directly, so Zotero needs to be open for a sync to happen. Close it and the plugin waits patiently. |
| **Zotero's local API enabled** | In Zotero: *Edit → Settings → Advanced → Miscellaneous* → tick **Enable local API**. One-time. |
| **[Better BibTeX](https://retorque.re/zotero-better-bibtex/)** | Provides the citekeys that name your notes. |
| **A Better BibTeX `.bib` export** *(for search and citations)* | In Zotero: *File → Export Library* → **Better BibLaTeX** or **Better BibTeX** → tick **Keep updated**, and save it in your vault. Annotation sync doesn't need it. |

Desktop only (Zotero doesn't run on phones).

## Install

**From the community plugin list** *(once published)*: Settings → Community plugins → Browse → "Zotero Citations Sync".

**Manually**: download `main.js`, `manifest.json` and `styles.css` from the latest release into `<vault>/.obsidian/plugins/zotero-citations-sync/`, then enable the plugin in Settings → Community plugins.

## Citations

| Command | Hotkey | In the search window |
|---|---|---|
| Open literature note | `Ctrl/Cmd+Shift+O` | `Enter` opens the note (creating it if needed), `Ctrl+Enter` opens it in a new pane, `Tab` shows the item in Zotero, `Shift+Tab` opens the PDF |
| Insert literature note link | `Ctrl/Cmd+Shift+E` | `Enter` inserts a link, creating the note if needed |
| Insert literature note content | | `Enter` inserts the new-note template, filled in for that reference |
| Insert citation | | `Enter` inserts the citation format, `Shift+Enter` the secondary format |
| Refresh citation library | `Ctrl/Cmd+Shift+R` | Reloads the `.bib` file; it also reloads by itself when the file changes |

**Moving from the Citations plugin:** your existing notes and links keep working, because note names don't change. Your settings are copied on first run. While Citations stays enabled, the commands above have no hotkeys, so the two don't both fire. Once you turn it off and reload Obsidian, the hotkeys apply.

Templates support plain `{{variable}}` substitution, not the Handlebars helpers and `{{#if}}` blocks Citations allows. CSL-JSON exports aren't supported. Export BibLaTeX or BibTeX instead.

## Settings

| Setting | Default | |
|---|---|---|
| Sync when Obsidian opens | on | |
| Watch Zotero for changes | 30 s | How often to ask Zotero "anything new?". `0` turns it off. |
| Literature note folder | *(copied from Citations)* | |
| Note name template | *(copied from Citations)* | Supports `{{citekey}}`, `{{title}}`, `{{year}}`, `{{authorString}}`. |
| New note content | *(copied from Citations)* | |
| .bib file | *(copied from Citations, or the vault's only `.bib`)* | Vault-relative or absolute path. |
| Citation format / secondary format | `[@{{citekey}}]` / `@{{citekey}}` | |
| Create notes for items that don't have one yet | on | Off = only update existing notes. |
| Include Zotero child notes | on | |
| Block heading | `## Zotero annotations` | |
| Zotero port | 23119 | Only change if you changed it in Zotero. |
| Sync Kindle highlights | off | |
| Clippings file | `My Clippings.txt` | Vault-relative. |
| Book → citekey overrides | | `Exact Kindle title => citekey`, one per line; `=> skip` ignores a book. |

## Kindle

Kindle has no API, so the plugin reads the `My Clippings.txt` file every Kindle keeps on its own storage (it records every highlight and note you make on the device, for purchased *and* sideloaded books, with no publisher export caps).

1. Plug in the Kindle, copy `documents/My Clippings.txt` into your vault (root is fine).
2. Settings → Kindle → turn on **Sync Kindle highlights**; the path defaults to `My Clippings.txt`.
3. That's it. The plugin syncs on startup and whenever that file changes — so next time, just overwrite the copy with a fresh one.

**Matching.** Each book is looked up in Zotero via Better BibTeX (title, then the author's surname has to appear on the item). A clean single hit is cached; anything ambiguous is left unmatched and its highlights go to a note named after the book (`Braiding Sweetgrass.md`, with `source: kindle` in the frontmatter). When you later add the book to Zotero, add a line to **Book → citekey overrides** — the settings page lists every unmatched title ready to paste — and the next sync moves the block into `@citekey.md`. (The old title-named note isn't deleted; merge or trash it yourself.)

**Dedupe.** Kindle keeps the old entry when you extend a highlight; overlapping highlights collapse to the longest one. Notes typed on a highlight are shown beneath it (`↳`), like Zotero comments.

## FAQ

**Does this modify anything in Zotero?**
No. It's strictly one-way, Zotero → Obsidian, and only ever reads from Zotero.

**What if I edit the synced block in Obsidian?**
It'll be overwritten on the next sync. Put your commentary above or below the markers, or edit the annotation's comment in Zotero.

**Can I move the block?**
Yes — cut and paste it anywhere in the note. The plugin finds it by the markers.

**Annotations disappeared from a note.**
They were probably deleted or trashed in Zotero; the block mirrors Zotero exactly.

**A paper was skipped with "no citekey".**
Better BibTeX hasn't assigned it one yet (or BBT isn't installed). Open the item in Zotero and BBT will generate a key; the next sync picks it up.

**Group libraries?**
Not yet — the personal library only. Open an issue if you need this.

**How is this different from ZotLit / Zotero Integration?**
Those are powerful, template-driven importers that own the notes they create. This plugin does one thing: keep the annotation section of your *existing* Citations notes current, automatically. If you already live in Citations and just want your highlights to show up, this is the lighter tool.

## Development

```
npm install
npm run dev            # rebuild on change
npm run build          # type-check + production bundle
npm run install-local -- "C:\path\to\vault"   # copy into a vault for testing
```

## License

MIT
