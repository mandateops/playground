// Fails when a value binding is introduced with a single-character name: a
// variable, a function or method parameter, an arrow parameter, or a
// destructured element. Identifiers must explain themselves, so `w`, `p`, `i`,
// and friends are rejected in favour of a descriptive name. Type parameters
// (`<T>`, `<K>`) are conventionally single letter and are left alone; this gate
// is about runtime values, not generics.
//
// The sole exception is `_`, the conventional throwaway for a binding that is
// deliberately unused (an ignored mapper argument, a discarded tuple slot);
// it signals absence, not a name.
//
// AST-based (not regex) so it only inspects binding positions, never a
// single-character property access or string. Runs under bun or node. Pass file
// paths to check a subset (the pre-commit hook passes staged files); pass none
// to walk the whole workspace.

import ts from "typescript";
import { relative, REPO_ROOT, runGate } from "./lib/gateShared.mjs";

// The binding is a single-character identifier we should reject. A binding name
// can also be a destructuring pattern, which is handled by recursing into its
// own elements rather than flagged here.
function isSingleCharIdentifier(nameNode) {
  return (
    nameNode &&
    ts.isIdentifier(nameNode) &&
    nameNode.text.length === 1 &&
    nameNode.text !== "_"
  );
}

function checkSource(text, path, lineOffset, findings) {
  const sourceFile = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".vue") ? ts.ScriptKind.TS : undefined,
  );

  const record = (nameNode, kind) => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(
      nameNode.getStart(sourceFile),
    );
    findings.push({ path, line: line + lineOffset + 1, name: nameNode.text, kind });
  };

  const visit = (node) => {
    if (ts.isParameter(node) && isSingleCharIdentifier(node.name)) {
      record(node.name, "parameter");
    } else if (ts.isVariableDeclaration(node) && isSingleCharIdentifier(node.name)) {
      record(node.name, "variable");
    } else if (ts.isBindingElement(node) && isSingleCharIdentifier(node.name)) {
      record(node.name, "destructured binding");
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

// Diff-scoped modes (--staged, --base) keep only findings on lines the change
// adds or modifies, so pre-existing single-character names on untouched lines
// never block. This enforces "no new single-character bindings" without a
// repo-wide retrofit first.
runGate(process.argv.slice(2), {
  checkSource,
  report: {
    header: (count) =>
      `Single-character bindings found (${count}). Give each a descriptive name:\n`,
    line: (finding) =>
      `  ${relative(REPO_ROOT, finding.path)}:${finding.line}  (${finding.kind})  ${finding.name}`,
    footer: "\nName the value for what it holds; a single letter explains nothing.",
  },
});
