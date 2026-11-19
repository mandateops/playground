// Fails when a comment line is a decorative separator, divider, or banner: a
// visual rule made from repeated separator characters rather than a helpful
// sentence. It flags `// ======`, a `/* ---- */` block, a `* ----` JSDoc
// continuation, and a Vue `<!-- ---- -->`, so comments carry information and
// not ornament.
//
// Only comment content is inspected, never code or string literals. TypeScript
// and JavaScript comments come from the TS scanner, which yields comment trivia
// as distinct tokens, so a `-----` inside a string is never seen. Vue template
// comments are matched separately because they live outside any <script> block.
//
// Detection is deliberately conservative to avoid false positives: a line is
// flagged only when it holds a run of at least four identical separator
// characters and those separators dominate the visible content, so ordinary
// prose, a stray hyphen, or a URL passes untouched. Runs under bun or node.
// Pass file paths to check a subset (the pre-commit hook passes staged files);
// pass none to walk the whole workspace.

import { pathToFileURL } from "node:url";
import ts from "typescript";
import { extractScripts, relative, REPO_ROOT, runGate } from "./lib/gateShared.mjs";

// Code files whose comments this gate reads. Wider than the type-shaped gates
// because a decorative divider is just as unwelcome in plain JavaScript or Rust.
const CHECKABLE_EXTENSIONS = [".ts", ".js", ".vue", ".rs"];

// Characters used to draw a horizontal rule: the ASCII punctuation runs plus
// the box-drawing line glyphs a divider is sometimes made of. A plain hyphen or
// slash in prose is only a concern once it repeats into a run, which the run
// threshold below enforces.
const SEPARATOR_CHARACTERS = "=-*#~_/─━═╍┅┄┈╌⎯";

// The shortest run of one separator character that reads as a drawn rule rather
// than punctuation. Three or fewer (`---`, `***`) stays within ordinary prose.
const MINIMUM_RUN_LENGTH = 4;

// The share of visible characters that must be separators for a line to count
// as decorative. Keeping it at half means a banner framing a short label is
// caught while a real sentence that merely contains a run is not.
const SEPARATOR_DOMINANCE = 0.5;

// Characters that fence a run off as quoted content rather than a drawn rule: a
// table cell (`|----|`), a regex or path shown in prose (`/====/`), or a code
// literal in backticks or quotes. A genuine divider is never wrapped this way,
// so a run bounded by these on both sides is content the reader is meant to see.
const RUN_DELIMITERS = "`'\"/|";

// A line of comment content is decorative when a single separator character
// repeats into a run of at least the threshold and separators make up at least
// half of what is visible. Spaces break a run, so spaced punctuation such as
// `- - - -` reads as prose and is left alone, and a run fenced by RUN_DELIMITERS
// (a table cell or a regex or literal quoted in prose) is treated as content.
function isDecorativeSeparator(content) {
  const trimmed = content.trim();
  if (trimmed.length === 0) return false;

  const characters = [...trimmed];
  let longestRun = 0;
  let longestRunEndIndex = -1;
  let currentRun = 0;
  let previousCharacter = "";
  let separatorCount = 0;
  let visibleCount = 0;

  characters.forEach((character, index) => {
    const isWhitespace = character === " " || character === "\t";
    if (!isWhitespace) visibleCount += 1;

    if (SEPARATOR_CHARACTERS.includes(character)) {
      separatorCount += 1;
      currentRun = character === previousCharacter ? currentRun + 1 : 1;
      if (currentRun > longestRun) {
        longestRun = currentRun;
        longestRunEndIndex = index;
      }
      previousCharacter = character;
    } else {
      currentRun = 0;
      previousCharacter = "";
    }
  });

  if (longestRun < MINIMUM_RUN_LENGTH) return false;
  if (visibleCount === 0) return false;
  if (separatorCount / visibleCount < SEPARATOR_DOMINANCE) return false;

  const beforeRun = characters[longestRunEndIndex - longestRun];
  const afterRun = characters[longestRunEndIndex + 1];
  const isFenced =
    beforeRun !== undefined &&
    afterRun !== undefined &&
    RUN_DELIMITERS.includes(beforeRun) &&
    RUN_DELIMITERS.includes(afterRun);
  return !isFenced;
}

// Reduce a raw comment token to the content lines a reader sees, with the
// comment markers removed. A single-line comment drops its leading `//`; a
// block comment drops `/*` and `*/` and each physical line drops one leading
// `*` JSDoc continuation marker so a `* ----` line is judged on `----`.
function commentContentLines(rawText, isBlock) {
  if (!isBlock) {
    return [rawText.replace(/^\/\//, "")];
  }
  const inner = rawText.replace(/^\/\*/, "").replace(/\*\/$/, "");
  return inner.split("\n").map((physicalLine) => physicalLine.replace(/^\s*\*/, ""));
}

// Zero-based line index of a character offset within some text.
function lineIndexAt(text, offset) {
  return text.slice(0, offset).split("\n").length - 1;
}

// Comment trivia tokens from a TypeScript or JavaScript source, each with its
// raw text, start offset, and whether it is a block comment. The scanner runs
// with trivia preserved, so comments arrive as their own tokens and string
// literals never reach this list.
function scanCodeComments(text) {
  const comments = [];
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    text,
  );
  let token = scanner.scan();
  while (token !== ts.SyntaxKind.EndOfFileToken) {
    const isBlock = token === ts.SyntaxKind.MultiLineCommentTrivia;
    if (token === ts.SyntaxKind.SingleLineCommentTrivia || isBlock) {
      comments.push({
        text: scanner.getTokenText(),
        start: scanner.getTokenPos(),
        isBlock,
      });
    }
    token = scanner.scan();
  }
  return comments;
}

function collectFromCodeComments(text, path, blockLineOffset, findings) {
  for (const comment of scanCodeComments(text)) {
    const baseLineIndex = lineIndexAt(text, comment.start);
    const contentLines = commentContentLines(comment.text, comment.isBlock);
    contentLines.forEach((content, lineWithinComment) => {
      if (!isDecorativeSeparator(content)) return;
      findings.push({
        path,
        line: baseLineIndex + lineWithinComment + blockLineOffset + 1,
        kind: comment.isBlock ? "block comment" : "line comment",
        snippet: content.trim().slice(0, 72),
      });
    });
  }
}

// Vue template comments (`<!-- ... -->`) sit outside every <script> block, so
// the TS scanner never reaches them; they are matched directly on the raw file.
function collectFromTemplateComments(text, path, findings) {
  const htmlComment = /<!--([\s\S]*?)-->/g;
  let match = htmlComment.exec(text);
  while (match !== null) {
    const baseLineIndex = lineIndexAt(text, match.index);
    match[1].split("\n").forEach((content, lineWithinComment) => {
      if (isDecorativeSeparator(content)) {
        findings.push({
          path,
          line: baseLineIndex + lineWithinComment + 1,
          kind: "template comment",
          snippet: content.trim().slice(0, 72),
        });
      }
    });
    match = htmlComment.exec(text);
  }
}

// Rust has no TypeScript-style parser available here, so `.rs` files are
// scanned with a line/block regex instead of the tokeniser above, the same
// tradeoff (and the same accepted false-positive risk on `//`/`/* */` inside a
// string literal) as the trailing-comment gate.
function scanRustComments(text) {
  const comments = [];
  for (const pattern of [/\/\/.*$/gm, /\/\*[\s\S]*?\*\//g]) {
    let match = pattern.exec(text);
    while (match !== null) {
      comments.push({
        text: match[0],
        start: match.index,
        isBlock: match[0].startsWith("/*"),
      });
      match = pattern.exec(text);
    }
  }
  return comments;
}

function collectFromRustComments(text, path, findings) {
  for (const comment of scanRustComments(text)) {
    const baseLineIndex = lineIndexAt(text, comment.start);
    const contentLines = commentContentLines(comment.text, comment.isBlock);
    contentLines.forEach((content, lineWithinComment) => {
      if (!isDecorativeSeparator(content)) return;
      findings.push({
        path,
        line: baseLineIndex + lineWithinComment + 1,
        kind: comment.isBlock ? "block comment" : "line comment",
        snippet: content.trim().slice(0, 72),
      });
    });
  }
}

// Inspect one file's comments. A .vue file is split so its <script> blocks are
// scanned as code (with each block's line offset restored) while its template
// comments are matched on the whole source; a .rs file uses the regex scanner
// above; any other file is scanned as code via the TypeScript tokeniser.
function checkSource(text, path, _lineOffset, findings) {
  if (path.endsWith(".vue")) {
    for (const block of extractScripts(text, path)) {
      collectFromCodeComments(block.text, path, block.lineOffset, findings);
    }
    collectFromTemplateComments(text, path, findings);
    return;
  }
  if (path.endsWith(".rs")) {
    collectFromRustComments(text, path, findings);
    return;
  }
  collectFromCodeComments(text, path, 0, findings);
}

const gate = {
  extensions: CHECKABLE_EXTENSIONS,
  wholeFile: true,
  checkSource,
  report: {
    header: (count) =>
      `Decorative separator comments found (${count}). Delete each; a comment must inform:\n`,
    line: (finding) =>
      `  ${relative(REPO_ROOT, finding.path)}:${finding.line}  (${finding.kind})  ${finding.snippet}`,
    footer:
      "\nDividers and banners add noise, not information; let the code structure speak.",
  },
};

// Only run the gate when invoked as a script; importing the module (the tests
// exercise `checkSource` directly) must not trigger the scan or its exit.
const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  runGate(process.argv.slice(2), gate);
}

export { checkSource, isDecorativeSeparator };
