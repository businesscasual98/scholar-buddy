# Scholar Buddy

**Your Zotero library and highlights, in your Obsidian notes.**

*Built and maintained by a poor UCLA PhD student for other scholars.*

Scholar Buddy connects [Zotero](https://www.zotero.org) (where your papers live) to [Obsidian](https://obsidian.md) (where your notes live). With it you can:

- 🔎 **Search your whole Zotero library from Obsidian** and open a note for any paper in one keystroke.
- ✍️ **Drop citations into your writing**, like `[@hooks1994]`, without leaving the page.
- 🖍️ **See your PDF highlights in your notes automatically.** Highlight something in Zotero, and it appears in that paper's note a few seconds later.

Works on **Mac and Windows**. It doesn't work on phones or tablets, because Zotero desktop isn't available there.

---

## Quickstart (about 10 minutes)

You only do this once. If a step looks different on your screen, skip to [Something not working?](#something-not-working).

> **Mac or Windows?** Where the steps differ, Windows comes first and Mac second. On a Mac, use **Cmd** wherever it says **Ctrl**.

### Step 1: Install the three apps

1. **Zotero**: download it from [zotero.org/download](https://www.zotero.org/download) and install it like any app. You need version 7 or newer.
2. **Obsidian**: download it from [obsidian.md/download](https://obsidian.md/download). The first time you open it, it asks you to make a **vault**. That's just a folder for your notes, so pick a name like `School Notes`.
3. **Better BibTeX**, a free add-on for Zotero that gives every paper a short nickname called a *citekey*:
   1. Go to the [Better BibTeX releases page](https://github.com/retorquere/zotero-better-bibtex/releases/latest) and download the file ending in **`.xpi`**. If you use Firefox, right-click the link and choose **Save Link As…**, otherwise Firefox tries to install it into itself.
   2. In Zotero, open the **Tools** menu and choose **Plugins**.
   3. Drag the `.xpi` file into that window, or click the ⚙️ gear and choose **Install Plugin From File…**.
   4. Restart Zotero if it asks you to.

### Step 2: Make your library file (the `.bib` file)

This is a single file listing every paper in your Zotero library. Scholar Buddy reads it to search your library.

1. In Obsidian, right-click any note in the left sidebar. Choose **Show in system explorer** on Windows, or **Reveal in Finder** on a Mac. A window opens showing your vault folder, so remember where it is.
2. In Zotero, open the **File** menu and choose **Export Library…**.
3. For **Format**, pick **Better BibLaTeX**.
4. ✅ Tick **Keep updated**. This keeps the file current as you add papers, so you never have to export again.
5. Click **OK** and save the file **inside your vault folder**, at the top level and not in a subfolder. The suggested name is fine.

### Step 3: Install Scholar Buddy in Obsidian

1. In Obsidian, click the ⚙️ **Settings** gear in the bottom-left corner.
2. In the left column, click **Community plugins**.
3. If Obsidian shows a message about **Restricted mode**, click the button to turn on community plugins. It only asks once.
4. Click **Browse**, search for **Scholar Buddy**, then click **Install**, then **Enable**.

That's it! If your `.bib` file is at the top of your vault, Scholar Buddy finds it on its own.

### Step 4: Try it

1. Press **Ctrl+P** on Windows or **Cmd+P** on a Mac. This opens the command search box.
2. Type **Scholar Buddy** and choose **Open literature note**.
3. Start typing a paper's title or author, and press **Enter**. Scholar Buddy creates a note for that paper, or opens it if you already have one.

**Shortcut tip:** give yourself keyboard shortcuts in ⚙️ Settings → **Hotkeys**. Search for "Scholar Buddy", click the ⊕ next to a command, and press the keys you want. Popular choices are **Ctrl+Shift+O** (Mac: **Cmd+Shift+O**) for *Open literature note* and **Ctrl+Shift+E** (Mac: **Cmd+Shift+E**) for *Insert literature note link*.

### Step 5 (optional): Bring in your PDF highlights

1. Open Zotero's settings: **Edit → Settings** on Windows, or **Zotero → Settings** on a Mac.
2. Click **Advanced**, and under **Miscellaneous** tick ✅ **Allow other applications on this computer to communicate with Zotero**.
3. Keep Zotero open while you work in Obsidian. Highlights and comments you make on a PDF in Zotero now show up in that paper's note. Click a page number in the note to jump back to that spot in the PDF.

## Everyday use

Open the command search box (**Ctrl+P**, or **Cmd+P** on a Mac), type **Scholar Buddy**, and pick one of these:

| I want to… | Choose | Then |
|---|---|---|
| Open my notes on a paper | **Open literature note** | Find the paper and press **Enter**. Press **Ctrl+Enter** (Mac: **Cmd+Enter**) to open it beside your current note. |
| Link to a paper's note from what I'm writing | **Insert literature note link** | Find the paper and press **Enter** |
| Cite a paper, like `[@citekey]` | **Insert citation** | Find the paper and press **Enter** |
| Open a paper's PDF | **Open literature note** | Find the paper and press **Shift+Tab** |
| Find a paper in Zotero | **Open literature note** | Find the paper and press **Tab** |

Your notes are normal notes, so write whatever you like in them. Scholar Buddy only ever updates the highlights section it adds, and never touches your own writing.

## Something not working?

- **"No references found"**: Scholar Buddy can't find your `.bib` file. Check that it's saved inside your vault folder (Step 2). If it's somewhere else, open ⚙️ Settings → **Scholar Buddy** and type its location into **.bib file**, either just the file name if it's in your vault, or the full path otherwise. A full path looks like `C:\Users\you\Documents\My Library.bib` on Windows or `/Users/you/Documents/My Library.bib` on a Mac.
- **A paper I just added isn't showing up**: make sure you ticked **Keep updated** in Step 2. Then run **Scholar Buddy: Refresh citation library** from the command search box.
- **My highlights aren't appearing**: Zotero has to be open, and Step 5 has to be done. Then run **Scholar Buddy: Sync annotations from Zotero now** from the command search box.
- **I can't find Scholar Buddy under Browse**: make sure community plugins are turned on (Step 3), and check your spelling.
- **My notes are going to the wrong folder**: open ⚙️ Settings → **Scholar Buddy** and set **Literature note folder**, for example `Sources`.
- **Still stuck?** [Open an issue](https://github.com/businesscasual98/scholar-buddy/issues) and say what you tried. Beginner questions are welcome!

---

# The detailed version

Everything below is for the curious, and for people moving over from other plugins.

Highlight a PDF in Zotero → the quote appears in that paper's note in Obsidian, with a link that jumps back to the exact spot in the PDF. Your own writing in the note is never touched.

It also searches your library and inserts citations, and can replace the [Citations](https://github.com/hans/obsidian-citation-plugin) plugin outright: it uses the same `@citekey` notes, folder and Better BibTeX citekeys, and copies your Citations settings the first time it runs.

Here's what a literature note looks like:

```
---
citekey: vaughanRelevanceEthnographyProduction2005
title: On the relevance of ethnography for the production of public sociology and policy
authors: Diane Vaughan
year: 2005
---
Mentions a [[Burawoy]] article introducing "back-translation" — compare with  ← your notes,
my [[methods]] reading.                                                        ← untouched

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
- **Creates notes for un-noted papers** (optional). If you've annotated a paper but never made a literature note, one is created from your new-note template.
- **Stays quiet.** Nothing is written if nothing changed, so file-sync tools (Remotely Save, Obsidian Sync, git) don't see churn.

## Requirements

| | |
|---|---|
| **Zotero 7 or newer** running on the same computer | The plugin talks to Zotero directly, so Zotero needs to be open for a sync to happen. Close it and the plugin waits patiently. |
| **Zotero's local API enabled** *(for highlight sync)* | In Zotero's settings (*Edit → Settings* on Windows, *Zotero → Settings* on a Mac) → *Advanced* → *Miscellaneous* → tick **Allow other applications on this computer to communicate with Zotero**. One-time. |
| **[Better BibTeX](https://retorque.re/zotero-better-bibtex/)** | Provides the citekeys that name your notes. |
| **A Better BibTeX `.bib` export** *(for search and citations)* | In Zotero: *File → Export Library* → **Better BibLaTeX** or **Better BibTeX** → tick **Keep updated**, and save it in your vault. Annotation sync doesn't need it. |

Desktop only, on Mac, Windows or Linux (Zotero desktop doesn't run on phones or tablets).

## Install

**From the community plugin list** *(once published)*: Settings → Community plugins → Browse → "Scholar Buddy".

**Manually**: download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/businesscasual98/scholar-buddy/releases/latest) into `<vault>/.obsidian/plugins/scholar-buddy/`, then enable the plugin in Settings → Community plugins.

## Citations

| Command | In the search window |
|---|---|
| Open literature note | `Enter` opens the note (creating it if needed), `Ctrl+Enter` opens it in a new pane, `Tab` shows the item in Zotero, `Shift+Tab` opens the PDF |
| Insert literature note link | `Enter` inserts a link, creating the note if needed |
| Insert literature note content | `Enter` inserts the new-note template, filled in for that reference |
| Insert citation | `Enter` inserts the citation format, `Shift+Enter` the secondary format |
| Refresh citation library | Reloads the `.bib` file; it also reloads by itself when the file changes |

The commands have no default hotkeys, so they can't clash with yours. Assign any you like in Settings → Hotkeys.

**Moving from the Citations plugin:** your existing notes and links keep working, because note names don't change, and your settings are copied on first run. Citations used `Ctrl/Cmd+Shift+O`, `E` and `R`; to keep them, turn Citations off and assign them to Open literature note, Insert literature note link, and Refresh citation library.

Templates support plain `{{variable}}` substitution, not the Handlebars helpers and `{{#if}}` blocks Citations allows. CSL-JSON exports aren't supported. Export BibLaTeX or BibTeX instead.

## Network use and file access

Scholar Buddy has no accounts, payments, ads or telemetry, and sends nothing over the internet.

- **Network use:** it connects only to the Zotero app on your own computer (`127.0.0.1`, port 23119 by default), using Zotero's local API and Better BibTeX's local endpoint. It needs this to read your annotations, notes and citekeys. Nothing leaves your machine.
- **Files outside your vault:** it reads your `.bib` export from outside the vault only if you set an absolute path to one, and `Shift+Tab` in the search window asks your system to open a PDF wherever Zotero stores it, which is usually outside the vault. It needs these so the export can stay where you keep it, and so you can reach the PDF from Obsidian.
- **Links:** `Tab` in the search window, and the links in synced annotations, open the Zotero app through `zotero://` links.

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

**Matching.** Each book is looked up in Zotero via Better BibTeX (title, then the author's surname has to appear on the item). A clean single hit is cached; anything ambiguous is left unmatched and its highlights go to a note named after the book (`Braiding Sweetgrass.md`, with `source: kindle` in the frontmatter). When you later add the book to Zotero, add a line to **Book → citekey overrides** — the settings page lists every unmatched title ready to paste — and the next sync moves the block into `@citekey.md`. The old title-named note goes to the trash if it holds nothing but the synced block; if you wrote anything else in it, it's kept for you to merge.

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
Those are powerful, template-driven importers that own the notes they create. Scholar Buddy keeps the annotation section of your *existing* notes current automatically, and adds a simple search and citation workflow. If you came from Citations and want your highlights to show up, this is the lighter tool.

## Development

```
npm install
npm run dev            # rebuild on change
npm run build          # type-check + production bundle
npm run lint           # Obsidian's review rules
npm test               # .bib reader and template tests
npm run install-local -- "C:\path\to\vault"   # copy into a vault for testing
```

## Credits

The search and citation commands follow the workflow of [Citations](https://github.com/hans/obsidian-citation-plugin) by Jon Gauthier. Sentence-casing logic is adapted from [`@retorquere/bibtex-parser`](https://github.com/retorquere/bibtex-parser). See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). Scholar Buddy isn't affiliated with Zotero, Better BibTeX, Amazon or Obsidian.

## License

MIT
