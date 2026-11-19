// Fails when a `//` comment trails code on the same line. A comment belongs on
// its own line above what it describes, so the intent reads before the code
// rather than crowding its right margin. Inline tool directives
// (@ts-expect-error, biome-ignore, eslint-disable-line and the like) are exempt
// because they only act on the line they annotate.
//
// Only real comment tokens are inspected, taken from the TypeScript scanner, so
// a `//` inside a string, template, or regex literal is never mistaken for a
// comment. Diff-scoped by the shared runner: only lines this change adds can
// fail, so pre-existing trailing comments on untouched lines never block. Runs
// under bun or node. Pass file paths to check a subset (the pre-commit hook
// passes staged files); pass none to walk the whole workspace.

import { pathToFileURL } from "node:url";
import ts from "typescript";
import { relative, REPO_ROOT, runGate } from "./lib/gateShared.mjs";

// Comments in any code file crowd the margin, so this reads plain JavaScript,
// TypeScript, Vue single-file components, and Rust.
const CHECKABLE_EXTENSIONS = [".ts", ".js", ".vue", ".rs"];

// Inline directives that only work on the line they annotate, which is the one
// legitimate reason for a comment to trail code.
const ALLOWED_TRAILING =
  /^\/\/\s*(@ts-(expect-error|ignore|nocheck)\b|biome-ignore\b|eslint-disable-line\b|eslint-disable-next-line\b|prettier-ignore\b|v8 ignore\b|c8 ignore\b)/;

// Zero-based line index of a character offset within some text.
function lineIndexAt(text, offset) {
  return text.slice(0, offset).split("\n").length - 1;
}

// Single-line comments with their raw text and start offset. Comments are read
// from the parsed source, not a bare scanner: only the parser tracks when a `/`
// opens a regex literal or a `}` resumes a template, so a `//` inside a regex
// (`/\//g`) or an interpolated template (`` `${x} // y` ``) is never mistaken
// for a comment. Block comments are excluded: this gate targets the `//`
// trailing comment. Ranges are deduped because one comment can be both the
// trailing trivia of one node and the leading trivia of the next.
function scanLineComments(text) {
  const sourceFile = ts.createSourceFile("scan.ts", text, ts.ScriptTarget.Latest, true);
  const comments = [];
  const seen = new Set();

  const collect = (ranges) => {
    if (!ranges) return;
    for (const range of ranges) {
      if (range.kind !== ts.SyntaxKind.SingleLineCommentTrivia) continue;
      if (seen.has(range.pos)) continue;
      seen.add(range.pos);
      comments.push({ text: text.slice(range.pos, range.end), start: range.pos });
    }
  };

  const visit = (node) => {
    collect(ts.getLeadingCommentRanges(text, node.getFullStart()));
    collect(ts.getTrailingCommentRanges(text, node.getEnd()));
    node.forEachChild(visit);
  };
  visit(sourceFile);

  return comments;
}

// True when non-whitespace code precedes the comment on its own line, i.e. the
// comment trails code rather than sitting on its own line.
function trailsCode(text, start) {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  return text.slice(lineStart, start).trim().length > 0;
}

// Rust has no TypeScript-style parser available here, so `.rs` files are
// scanned with a conservative line regex instead of the tokeniser above: a
// `//` preceded by code on the same line, guarding against a URL's `://`.
// It accepts the documented tradeoff that a regex, not a real parser, is a
// known false positive on a `//` inside a string literal.
const RUST_TRAILING_COMMENT = /^\s*[^/*\s].*[^:/]\/\//;

function scanRustLineComments(text) {
  const comments = [];
  let offset = 0;
  for (const line of text.split("\n")) {
    if (RUST_TRAILING_COMMENT.test(line)) {
      const commentStart = line.search(/\/\//);
      comments.push({ text: line.slice(commentStart), start: offset + commentStart });
    }
    offset += line.length + 1;
  }
  return comments;
}

function checkSource(text, path, lineOffset, findings) {
  const comments = path.endsWith(".rs")
    ? scanRustLineComments(text)
    : scanLineComments(text);
  for (const comment of comments) {
    if (ALLOWED_TRAILING.test(comment.text)) continue;
    if (!path.endsWith(".rs") && !trailsCode(text, comment.start)) continue;
    findings.push({
      path,
      line: lineIndexAt(text, comment.start) + lineOffset + 1,
      snippet: comment.text.trim().slice(0, 72),
    });
  }
}

const gate = {
  extensions: CHECKABLE_EXTENSIONS,
  checkSource,
  report: {
    header: (count) =>
      `Trailing inline comments found (${count}). Move each onto its own line above the code:\n`,
    line: (finding) =>
      `  ${relative(REPO_ROOT, finding.path)}:${finding.line}  ${finding.snippet}`,
    footer:
      "\nA comment on its own line above the code reads before the code it explains; inline tool directives are exempt.",
  },
};

const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  runGate(process.argv.slice(2), gate);
}

export { checkSource };
