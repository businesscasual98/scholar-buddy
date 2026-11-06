/**
 * Small BibTeX/BibLaTeX reader. Pure (no Obsidian imports) so it can be tested in Node.
 * It extracts what literature-note templates and the search window need, not a full model
 * of BibLaTeX, which keeps the plugin far smaller than bundling a complete parser.
 */

export interface BibEntry {
  id: string;
  type: string;
  title?: string;
  titleShort?: string;
  authorString?: string;
  year?: string;
  containerTitle?: string;
  abstract?: string;
  DOI?: string;
  URL?: string;
  eprint?: string;
  eprinttype?: string;
  eventPlace?: string;
  note?: string;
  page?: string;
  publisher?: string;
  publisherPlace?: string;
  files: string[];
  zoteroSelectURI: string;
}

export interface BibParseResult {
  entries: BibEntry[];
  errors: string[];
}

/** Fields whose values are literal strings: never run these through LaTeX decoding. */
const VERBATIM = new Set(["url", "doi", "eprint", "file", "files", "urlraw", "verba", "verbb", "verbc"]);
const NON_ENTRIES = new Set(["comment", "preamble", "string"]);
const BS = "\\";

class Scanner {
  i = 0;
  constructor(readonly s: string, start: number) {
    this.i = start;
  }
  skipSpace(): void {
    while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++;
  }
  /** Reads a value's text from an opening `{` or `"`, returning it without the delimiters. */
  delimited(): string {
    const open = this.s[this.i];
    const start = ++this.i;
    let depth = 0;
    for (; this.i < this.s.length; this.i++) {
      const c = this.s[this.i];
      if (c === BS) {
        this.i++;
      } else if (c === "{") {
        depth++;
      } else if (c === "}") {
        if (depth === 0 && open === "{") return this.s.slice(start, this.i++);
        depth--;
      } else if (c === '"' && open === '"' && depth === 0) {
        return this.s.slice(start, this.i++);
      }
    }
    throw new Error("unterminated value");
  }
  value(macros: Map<string, string>): string {
    let out = "";
    for (;;) {
      this.skipSpace();
      const c = this.s[this.i];
      if (c === "{" || c === '"') {
        out += this.delimited();
      } else {
        const m = /^[^\s,#{}]+/.exec(this.s.slice(this.i, this.i + 200));
        if (!m) throw new Error("expected a value");
        this.i += m[0].length;
        out += macros.get(m[0].toLowerCase()) ?? m[0];
      }
      this.skipSpace();
      if (this.s[this.i] !== "#") return out;
      this.i++;
    }
  }
}

function readFields(sc: Scanner, macros: Map<string, string>): Map<string, string> {
  const fields = new Map<string, string>();
  for (;;) {
    sc.skipSpace();
    const c = sc.s[sc.i];
    if (c === undefined) throw new Error("unterminated entry");
    if (c === ",") {
      sc.i++;
      continue;
    }
    if (c === "}") {
      sc.i++;
      return fields;
    }
    const m = /^[^\s=,{}]+/.exec(sc.s.slice(sc.i, sc.i + 200));
    if (!m) throw new Error("expected a field name");
    sc.i += m[0].length;
    sc.skipSpace();
    if (sc.s[sc.i] !== "=") throw new Error(`expected "=" after ${m[0]}`);
    sc.i++;
    const value = sc.value(macros);
    const name = m[0].toLowerCase();
    if (!fields.has(name)) fields.set(name, value); // repeated field: first one wins
  }
}

export function parseBib(text: string): BibParseResult {
  const entries: BibEntry[] = [];
  const errors: string[] = [];
  const macros = new Map<string, string>();
  const start = /^[ \t]*@([a-zA-Z]+)[ \t]*\{/gm;
  let m: RegExpExecArray | null;
  while ((m = start.exec(text))) {
    const type = m[1].toLowerCase();
    if (type === "comment" || type === "preamble") continue;
    const sc = new Scanner(text, start.lastIndex);
    try {
      if (type === "string") {
        for (const [k, v] of readFields(sc, macros)) macros.set(k, v);
      } else if (!NON_ENTRIES.has(type)) {
        const keyMatch = /^\s*([^,\s{}]*)\s*,/.exec(text.slice(sc.i, sc.i + 1000));
        if (!keyMatch || !keyMatch[1]) throw new Error("missing citekey");
        sc.i += keyMatch[0].length;
        entries.push(toEntry(keyMatch[1], type, readFields(sc, macros)));
      }
      start.lastIndex = sc.i;
    } catch (e) {
      const line = text.slice(0, m.index).split("\n").length;
      errors.push(`line ${line}: ${(e as Error).message}`);
      // lastIndex stays just past this "@type{", so parsing resumes at the next entry.
    }
  }
  return { entries, errors };
}

/** Language values whose titles get sentence-cased, as the Citations plugin's parser does. */
const ENGLISH = /^(american|british|canadian|english|australian|newzealand|usenglish|ukenglish|en|eng|en-[a-z]+)$/;
const SENTENCE_CASED_FIELDS = new Set(["title", "shorttitle", "booktitle"]);

function isEnglish(f: Map<string, string>): boolean {
  for (const name of ["langid", "hyphenation"]) {
    const v = f.get(name);
    if (v !== undefined && !ENGLISH.test(v.trim().toLowerCase())) return false;
  }
  const language = f.get("language");
  return language === undefined || language.toLowerCase().split(/\s*,\s*/).some((l) => ENGLISH.test(l.trim()));
}

function toEntry(id: string, type: string, f: Map<string, string>): BibEntry {
  const english = isEnglish(f);
  const text = (name: string): string | undefined => {
    const v = f.get(name);
    if (v === undefined) return undefined;
    return english && SENTENCE_CASED_FIELDS.has(name) ? sentenceCase(v) : decodeLatex(v);
  };
  const raw = (name: string): string | undefined => {
    const v = f.get(name);
    return v === undefined ? undefined : unescapeVerbatim(v);
  };
  const eprint = raw("eprint");
  const eprinttype = text("eprinttype");
  const primaryClass = text("primaryclass");
  const container =
    text("journaltitle") ??
    text("journal") ??
    text("booktitle") ??
    (eprint
      ? `${eprinttype ? eprinttype + ":" : ""}${eprint}${primaryClass ? ` [${primaryClass}]` : ""}`
      : undefined);
  return {
    id,
    type,
    title: text("title"),
    titleShort: text("shorttitle"),
    authorString: f.has("author") ? parseNames(f.get("author") as string).join(", ") : undefined,
    year: yearOf(f),
    containerTitle: container,
    abstract: text("abstract"),
    DOI: raw("doi"),
    URL: raw("url"),
    eprint,
    eprinttype,
    eventPlace: text("venue"),
    note: text("note")?.replace(/(zotero:\/\/.+)/g, "[Link]($1)"),
    page: text("pages"),
    publisher: text("publisher"),
    publisherPlace: text("location"),
    files: [...splitFiles(f.get("file")), ...splitFiles(f.get("files"))],
    zoteroSelectURI: `zotero://select/items/@${id}`,
  };
}

function yearOf(f: Map<string, string>): string | undefined {
  // Free-form values occur ("Week 4 MT 2020", "Mon, 04/27/2015 - 12:00"), so look for a whole 4-digit year.
  const m = /(?:^|\D)(\d{4})(?!\d)/.exec(f.get("year") ?? f.get("date") ?? "");
  return m ? String(parseInt(m[1], 10)) : undefined;
}

/** Should this word keep its capitals when a title is sentence-cased? */
function keepsCase(word: string): boolean {
  if (!word.trim()) return false;
  if (!/[\p{L}\p{N}]/u.test(word)) return true;
  const w = word.replace(/[/’'”:()]/g, "");
  if (w === "I") return true;
  if (w.length === 1) return false;
  if (/^[\p{Lu}\p{Lt}\p{N}]{2,}$/u.test(w)) return true; // ALLCAPS
  if (/^[\p{Lu}\p{Lt}][\p{Ll}\p{Lm}\p{Lo}]*([-+][\p{L}\p{N}]+)*\p{P}*$/u.test(w)) return false; // Capitalized, Hyphen-Joined
  return /[\p{Lu}\p{Lt}]/u.test(w) || /^[0-9]+$/.test(w); // iPhone, McDonald, 2017
}

/**
 * Title Case → Sentence case, keeping `{protected}` text. Follows the rules of the parser in the
 * Citations plugin, so new literature notes read like the ones it already created. Better BibTeX
 * brace-protects proper nouns, which is what makes this safe.
 */
export function sentenceCase(raw: string): string {
  // Split into runs, tracking which ones were brace-protected. A brace after \command is its
  // argument rather than protection.
  const runs: { text: string; isProtected: boolean }[] = [];
  let buf = "";
  let depth = 0;
  const stack: boolean[] = [];
  const flush = (isProtected: boolean) => {
    if (buf) runs.push({ text: decodeInline(buf), isProtected });
    buf = "";
  };
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === BS) {
      buf += c + (raw[i + 1] ?? "");
      i++;
    } else if (c === "{") {
      const isArgument = /\\[a-zA-Z]+\s*$/.test(buf) || /\\['`^"~=.uvHck]$/.test(buf);
      stack.push(isArgument);
      if (isArgument) {
        buf += c;
      } else {
        if (depth === 0) flush(false);
        depth++;
      }
    } else if (c === "}") {
      if (stack.pop()) {
        buf += c;
      } else {
        depth = Math.max(0, depth - 1);
        if (depth === 0) flush(true);
      }
    } else {
      buf += c;
    }
  }
  flush(depth > 0);

  const text = runs.map((r) => r.text).join("");
  const keep: [number, number][] = [];
  let at = 0;
  for (const run of runs) {
    if (run.isProtected) {
      keep.push([at, at + run.text.length]);
    } else {
      let pos = at;
      for (const piece of run.text.split(/(\s+)/)) {
        if (keepsCase(piece)) keep.push([pos, pos + piece.length]);
        pos += piece.length;
      }
    }
    at += run.text.length;
  }

  // Text that is mostly lower-case or mostly capitals is left alone as already cased on purpose.
  const count = { upper: 0, lower: 0, other: 0 };
  for (const word of text.split(/\b/)) {
    if (/^[\p{Ll}\p{N}]{2,}$/u.test(word)) count.lower++;
    else if (/^[\p{Lu}\p{Lt}\p{N}]{2,}$/u.test(word)) count.upper++;
    else if (/\p{L}/u.test(word)) count.other++;
  }
  if (Math.max(count.upper, count.lower) > count.other + Math.min(count.upper, count.lower)) {
    return finishText(text);
  }

  // Capitals that begin a sentence stay, unless they only follow an abbreviation ("U.S. Taxes").
  for (const m of text.matchAll(/(^|[—:?!.]\s+)[\p{Lu}\p{Lt}]/gu)) {
    const index = m.index ?? 0;
    if (index > 2 && /\.[\p{Lu}\p{Lt}]\.$/u.test(text.slice(0, index + 1))) continue;
    keep.push([index, index + m[0].length]);
  }
  for (const m of text.matchAll(/("[^"]+")|(“[^“]+“)/g)) {
    keep.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
  }
  keep.push([0, 1]);

  let out = text.toLowerCase();
  if (out.length !== text.length) return finishText(text); // rare letters whose lower case changes length
  out = out.replace(/(([?!]\s*|^)(['"¡¿“‘„«\s]+)?[^\s])/g, (x) => x.toUpperCase());
  for (const [start, end] of keep) out = out.slice(0, start) + text.slice(start, end) + out.slice(end);
  return finishText(out);
}

/** Remove BibTeX escaping from a literal field, leaving any other backslash (as in a Windows path). */
function unescapeVerbatim(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === BS && i + 1 < s.length && /[\\:;{}%#_&$~^]/.test(s[i + 1])) out += s[++i];
    else out += s[i];
  }
  return out;
}

function splitFiles(value: string | undefined): string[] {
  if (!value) return [];
  const parts: string[] = [];
  let cur = "";
  for (let i = 0; i < value.length; i++) {
    if (value[i] === BS && value[i + 1] === ";") {
      cur += BS + ";";
      i++;
    } else if (value[i] === ";") {
      parts.push(cur);
      cur = "";
    } else {
      cur += value[i];
    }
  }
  parts.push(cur);
  return parts.map((p) => unescapeVerbatim(p).trim()).filter(Boolean);
}

/** Split on `sep` wherever it occurs outside braces. */
function splitTopLevel(s: string, sep: RegExp): string[] {
  const out: string[] = [];
  let depth = 0;
  let last = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === BS) {
      i++;
    } else if (c === "{") {
      depth++;
    } else if (c === "}") {
      depth--;
    } else if (depth === 0) {
      const m = sep.exec(s.slice(i, i + 40));
      if (m && m.index === 0) {
        out.push(s.slice(last, i));
        i += m[0].length - 1;
        last = i + 1;
      }
    }
  }
  out.push(s.slice(last));
  return out;
}

/** "Last, First and family=X, given=Y, prefix=z" → display names in "First prefix Last" order. */
export function parseNames(value: string): string[] {
  return splitTopLevel(value, /^\s+and\s+/)
    .map((n) => n.trim())
    .filter(Boolean)
    .map((name) => {
      const parts = splitTopLevel(name, /^,/).map((p) => p.trim());
      const extended = new Map<string, string>();
      for (const p of parts) {
        const kv = /^(family|given|prefix|suffix)\s*=\s*([\s\S]*)$/.exec(p);
        if (kv) extended.set(kv[1], kv[2]);
      }
      let ordered: (string | undefined)[];
      if (extended.size) {
        ordered = [extended.get("given"), extended.get("prefix"), extended.get("family"), extended.get("suffix")];
      } else if (parts.length === 1) {
        ordered = [parts[0]];
      } else if (parts.length === 2) {
        ordered = [parts[1], parts[0]];
      } else {
        ordered = [parts.slice(2).join(", "), parts[0], parts[1]];
      }
      return ordered
        .filter((p): p is string => !!p)
        .map(decodeLatex)
        .join(" ");
    });
}

const SYMBOLS: Record<string, string> = {
  textbackslash: BS,
  textasciicircum: "^",
  textasciitilde: "~",
  textbar: "|",
  textless: "<",
  textgreater: ">",
  textendash: "–",
  textemdash: "—",
  ldots: "…",
  dots: "…",
  ss: "ß",
  ae: "æ",
  AE: "Æ",
  oe: "œ",
  OE: "Œ",
  aa: "å",
  AA: "Å",
  o: "ø",
  O: "Ø",
  l: "ł",
  L: "Ł",
  i: "ı",
  j: "ȷ",
  par: "\n\n",
  item: "\n- ",
};

const ACCENTS: Record<string, string> = {
  "'": "́",
  "`": "̀",
  "^": "̂",
  '"': "̈",
  "~": "̃",
  "=": "̄",
  ".": "̇",
  u: "̆",
  v: "̌",
  H: "̋",
  c: "̧",
  k: "̨",
};

/** Commands whose `{argument}` is discarded rather than kept as text. */
const DROP_ARGUMENT = new Set(["hspace", "vspace", "label", "begin", "end"]);

/** Turn LaTeX-flavoured field text into plain text. Unknown commands keep their argument's text. */
export function decodeLatex(input: string): string {
  return finishText(decodeInline(input));
}

/** Dashes and whitespace clean-up, applied once a field's text is complete. */
function finishText(s: string): string {
  return s
    .replace(/---/g, "—")
    .replace(/--/g, "–")
    .replace(/[ \t ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeInline(input: string): string {
  let out = "";
  const s = input;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "{" || c === "}" || c === "$") continue; // a literal dollar is written \$
    if (c === "~") {
      out += " ";
      continue;
    }
    if (c !== BS) {
      out += c;
      continue;
    }
    const next = s[i + 1];
    if (next === undefined) break;
    const word = /^[a-zA-Z]+/.exec(s.slice(i + 1, i + 40))?.[0];
    if (next in ACCENTS && (!word || word.length === 1)) {
      // \'e  \'{e}  \v{s}  \c c
      let j = i + 2;
      while (s[j] === " " && word) j++;
      let letter = s[j];
      if (letter === "{") letter = s[++j];
      if (letter === BS) letter = s[++j]; // \'{\i}
      if (letter && letter !== "}") {
        const base = letter === "i" ? "i" : letter === "j" ? "j" : letter;
        out += (base + ACCENTS[next]).normalize("NFC");
        i = s[j + 1] === "}" ? j + 1 : j;
        continue;
      }
    }
    if (word) {
      i += word.length;
      if (word in SYMBOLS) {
        out += SYMBOLS[word];
        if (s[i + 1] === "{" && s[i + 2] === "}") i += 2;
        else if (s[i + 1] === " ") i++;
      } else if (DROP_ARGUMENT.has(word) && s[i + 1] === "{") {
        const close = s.indexOf("}", i + 1);
        i = close < 0 ? s.length : close;
      } else if (s[i + 1] === " ") {
        i++; // a space after a command name only terminates it
      }
      continue;
    }
    // \& \% \_ \# \$ \{ \} and friends are the literal character; \, is a thin space.
    out += next === "," || next === " " ? " " : next === BS ? "\n" : next;
    i++;
  }
  return out;
}

/** Template variables, using the same names as the Citations plugin. */
export function entryVars(e: BibEntry): Record<string, string> {
  const vars: Record<string, string> = { citekey: e.id, zoteroSelectURI: e.zoteroSelectURI };
  for (const k of [
    "abstract",
    "authorString",
    "containerTitle",
    "DOI",
    "eprint",
    "eprinttype",
    "eventPlace",
    "note",
    "page",
    "publisher",
    "publisherPlace",
    "title",
    "titleShort",
    "URL",
    "year",
  ] as const) {
    const v = e[k];
    if (v) vars[k] = v;
  }
  return vars;
}
