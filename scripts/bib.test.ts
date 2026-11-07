// Unit tests for the .bib reader:  npm test
import { strict as assert } from "assert";
import { decodeLatex, entryVars, parseBib, parseNames, sentenceCase } from "../src/bib";
import { fillNoteTemplate, fillTemplate, yamlValue } from "../src/render";

const one = (src: string) => {
  const { entries, errors } = parseBib(src);
  assert.deepEqual(errors, []);
  assert.equal(entries.length, 1);
  return entries[0];
};

// Entries, citekeys with unusual characters, and braces nested inside values
const e = one(String.raw`
@article{delamont*Four2005,
  title = {Four {{Great Gates}}: Dilemmas},
  author = {Delamont, Sara and Atkinson, Paul},
  date = {2005-03-01},
  journaltitle = {Research in {{Education}}},
  pages = {8--33},
  langid = {english},
  doi = {10.1000/a_b},
  file = {C\:\\Users\\me\\a.epub;C\:\\Users\\me\\b.pdf}
}`);
assert.equal(e.id, "delamont*Four2005");
assert.equal(e.type, "article");
assert.equal(e.title, "Four Great Gates: Dilemmas");
assert.equal(e.authorString, "Sara Delamont, Paul Atkinson");
assert.equal(e.year, "2005");
assert.equal(e.containerTitle, "Research in Education");
assert.equal(e.page, "8–33");
assert.equal(e.DOI, "10.1000/a_b");
assert.deepEqual(e.files, ["C:\\Users\\me\\a.epub", "C:\\Users\\me\\b.pdf"]);
assert.equal(e.zoteroSelectURI, "zotero://select/items/@delamont*Four2005");

// A single Better BibTeX file path isn't escaped
assert.deepEqual(one(String.raw`@book{a, file = {C:\Users\me\one.pdf}}`).files, ["C:\\Users\\me\\one.pdf"]);

// Names, including Better BibTeX's extended format and corporate authors
assert.deepEqual(parseNames("family=Werfhorst, given=Herman G., prefix=van de"), ["Herman G. van de Werfhorst"]);
assert.deepEqual(parseNames("{{World Bank}} and hooks, bell"), ["World Bank", "bell hooks"]);
assert.deepEqual(parseNames("King, Jr., Martin Luther"), ["Martin Luther King Jr."]);
assert.deepEqual(parseNames("Salt and Pepper, Sam"), ["Salt", "Sam Pepper"]);
assert.deepEqual(parseNames("{Salt and Pepper Inc.}"), ["Salt and Pepper Inc."]);

// LaTeX
assert.equal(decodeLatex(String.raw`Fish \& Chips: 50\% \emph{off}`), "Fish & Chips: 50% off");
assert.equal(decodeLatex(String.raw`Caf\'e G\"odel \v{s} {\'e}`), "Café Gödel š é");
assert.equal(decodeLatex(String.raw`$<$ 25 and \$5`), "< 25 and $5");
assert.equal(decodeLatex(String.raw`one\par two\hspace{1em}three`), "one\n\ntwothree");

// Sentence case keeps protected text, acronyms, and the words after a colon
assert.equal(sentenceCase("The {{Divine}} Comedy of {{Dante Alighieri}}"), "The Divine comedy of Dante Alighieri");
assert.equal(sentenceCase("Reform in the {{EU}}: A New Hope for NATO"), "Reform in the EU: A new hope for NATO");
assert.equal(one("@book{a, title = {A Great Book}, langid = {english}}").title, "A great book");
assert.equal(one("@book{a, title = {Das Grosse Buch}, langid = {ngerman}}").title, "Das Grosse Buch");
assert.equal(one("@book{a, journaltitle = {Journal Of Things}}").containerTitle, "Journal Of Things");

// Years in free-form values; no number invented when there is none
assert.equal(one("@misc{a, year = {Week 4 MT 2020}}").year, "2020");
assert.equal(one("@misc{a, year = {Mon, 04/27/2015 - 12:00}}").year, "2015");
assert.equal(one("@misc{a, date = {n.d.}}").year, undefined);

// @string macros and concatenation; @comment is skipped
const macro = parseBib(`@string{jan = "January"}\n@comment{ignored}\n@misc{m, note = jan # " issue"}`);
assert.equal(macro.entries.length, 1);
assert.equal(macro.entries[0].note, "January issue");

// One broken entry is reported and doesn't lose the ones after it
const broken = parseBib("@misc{bad, title = {never closed\n\n@misc{good, title = {Fine}}");
assert.equal(broken.errors.length, 1);
assert.deepEqual(broken.entries.map((x) => x.id), ["good"]);

// Template variables use the Citations names; absent fields stay absent
const v = entryVars(e);
assert.equal(v.citekey, "delamont*Four2005");
assert.equal(v.authorString, "Sara Delamont, Paul Atkinson");
assert.equal(v.publisher, undefined);

// Frontmatter stays valid YAML whatever the values contain
const T = "---\ntitle: {{title}}\nauthors: {{authorString}}\nkey: \"{{citekey}}\"\nyear: {{year}}\n---\n\n{{title}}\n";
assert.equal(
  fillNoteTemplate(T, { title: "Plain title", authorString: "", citekey: "a", year: "2020" }),
  '---\ntitle: Plain title\nauthors: \nkey: "a"\nyear: 2020\n---\n\nPlain title\n'
);
assert.equal(
  fillNoteTemplate(T, { title: "War: A History", authorString: "@x", citekey: 'q"r', year: "" }),
  '---\ntitle: "War: A History"\nauthors: "@x"\nkey: "q\\"r"\nyear: \n---\n\nWar: A History\n'
);
assert.equal(yamlValue("Line one\nline two"), '"Line one\\nline two"');
assert.equal(yamlValue("Issue#1 matters"), "Issue#1 matters");
assert.equal(yamlValue("Why #1 matters"), '"Why #1 matters"');
assert.equal(yamlValue("true"), '"true"');
assert.equal(fillTemplate("[@{{citekey}}] {{missing}}", { citekey: "a: b" }), "[@a: b] ");

console.log("bib tests passed");
