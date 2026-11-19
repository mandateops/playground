// Fails when an object shape is used inline in a position the coding standard
// requires to be a named type: a function parameter or return annotation, a
// type assertion (`as { ... }`), or a type argument (`Array<{ ... }>`,
// `Record<K, { ... }>`, `Promise<{ ... }>`, `computed<{ ... }>`, ...). Nested
// field shapes inside an already-named `type`/`interface` are fine, as is the
// documented Vue `defineProps`/`defineEmits`/`withDefaults` exception.
//
// AST-based (not regex) so it understands where a `{ ... }` sits. Runs under
// bun or node. Pass file paths to check a subset (the pre-commit hook passes
// staged files); pass none to walk the whole workspace.

import ts from "typescript";
import { relative, REPO_ROOT, runGate } from "./lib/gateShared.mjs";

const DEFINE_MACROS = new Set(["defineProps", "defineEmits", "withDefaults"]);

// Is `node` (a TypeLiteral) a type argument of a defineProps/defineEmits/
// withDefaults call? Those are the sanctioned inline-type exception in Vue SFCs.
function isInsideVueMacro(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isCallExpression(current) && ts.isIdentifier(current.expression)) {
      if (DEFINE_MACROS.has(current.expression.text)) return true;
    }
  }
  return false;
}

// A TypeLiteral anywhere beneath a `type X = ...` or `interface X` is part of
// that named definition, however deeply nested, so it is not dangling.
function isInsideNamedType(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isTypeAliasDeclaration(current) || ts.isInterfaceDeclaration(current))
      return true;
  }
  return false;
}

// A parameter of an inline callback (an arrow or function expression passed
// directly as a call argument, e.g. `fn(x, (p: { ... }) => ...)`) is local and
// single-use; naming its shape adds noise rather than clarity. Named function
// and method signatures, returns, generics, and assertions are still flagged.
function isInlineCallbackParameter(parameter) {
  const fn = parameter.parent;
  if (!fn || !(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) return false;
  return Boolean(fn.parent) && ts.isCallExpression(fn.parent);
}

// Classify why a TypeLiteral is dangling, or return null if it sits in an
// allowed position (a named type/interface body, or a nested field shape).
function danglingReason(node) {
  const parent = node.parent;
  if (!parent) return null;
  if (isInsideNamedType(node)) return null;

  if (ts.isParameter(parent) && parent.type === node) {
    return isInlineCallbackParameter(parent) ? null : "parameter type";
  }
  if (ts.isTypeAssertionExpression?.(parent) && parent.type === node)
    return "type assertion";
  if (ts.isAsExpression(parent) && parent.type === node) return "type assertion";

  if (
    (ts.isFunctionDeclaration(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isArrowFunction(parent) ||
      ts.isFunctionExpression(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isCallSignatureDeclaration(parent) ||
      ts.isFunctionTypeNode(parent)) &&
    parent.type === node
  ) {
    return "return type";
  }

  // Type argument: `Array<{...}>`, `Record<K, {...}>`, `Promise<{...}>`,
  // `computed<{...}>`, `foo<{...}>()`. The TypeLiteral is an element of some
  // node's typeArguments list.
  const typeArgs = parent.typeArguments;
  if (typeArgs && typeArgs.some((arg) => arg === node)) return "type argument";

  return null;
}

function checkSource(text, path, lineOffset, findings) {
  const sourceFile = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".vue") ? ts.ScriptKind.TS : undefined,
  );

  const visit = (node) => {
    if (ts.isTypeLiteralNode(node)) {
      const reason = danglingReason(node);
      if (reason && !isInsideVueMacro(node)) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(sourceFile),
        );
        findings.push({
          path,
          line: line + lineOffset + 1,
          reason,
          snippet: node.getText(sourceFile).replace(/\s+/g, " ").slice(0, 72),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

// Diff-scoped modes (--staged, --base) keep only findings on lines the change
// adds or modifies, so pre-existing debt on untouched lines never blocks. This
// enforces "no new dangling types" without a repo-wide retrofit first.
runGate(process.argv.slice(2), {
  checkSource,
  report: {
    header: (count) =>
      `Dangling inline types found (${count}). Extract each into a named type:\n`,
    line: (finding) =>
      `  ${relative(REPO_ROOT, finding.path)}:${finding.line}  (${finding.reason})  ${finding.snippet}`,
    footer:
      "\nNamed types belong in the module's types file (or alongside the signature) with NatSpec.",
  },
});
