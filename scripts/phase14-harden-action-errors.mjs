#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const require = createRequire(path.join(root, "package.json"));
let ts;
try {
  ts = require("typescript");
} catch {
  console.error("Could not load TypeScript. Run this from the project root after npm install.");
  process.exit(1);
}

const dryRun = process.argv.includes("--dry-run");
const appRoot = path.join(root, "src", "app");
const safeImport = '@/lib/errors/safe-action-errors';
const patchedSummary = [];

async function walk(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const found = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(full)));
    else if (entry.isFile() && /(?:^|-)actions\.ts$/i.test(entry.name)) found.push(full);
  }
  return found;
}

function isId(node, name) {
  return Boolean(node && ts.isIdentifier(node) && node.text === name);
}

function isErrorMessage(node, errorName) {
  return ts.isPropertyAccessExpression(node)
    && isId(node.expression, errorName)
    && node.name.text === "message";
}

function isInsideExpectedDomainGuard(node, catchClause, errorName) {
  let current = node;
  while (current && current !== catchClause.block) {
    const parent = current.parent;
    if (
      ts.isIfStatement(parent)
      && isDescendantOf(node, parent.thenStatement)
      && ts.isBinaryExpression(parent.expression)
      && parent.expression.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword
      && isId(parent.expression.left, errorName)
      && ts.isIdentifier(parent.expression.right)
      && !["Error", "TypeError", "RangeError", "SyntaxError", "ReferenceError", "EvalError", "URIError", "AggregateError"].includes(parent.expression.right.text)
    ) {
      return true;
    }
    current = parent;
  }
  return false;
}

function isDescendantOf(node, ancestor) {
  let current = node;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

function isUserVisibleMessage(node, catchClause, errorName) {
  let current = node;
  while (current && current !== catchClause.block) {
    const parent = current.parent;
    if (ts.isPropertyAssignment(parent) && parent.name && ts.isIdentifier(parent.name) && parent.name.text === "message") {
      // Only target message properties that are returned from the catch path.
      let maybeReturn = parent.parent;
      while (maybeReturn && maybeReturn !== catchClause.block) {
        if (ts.isReturnStatement(maybeReturn)) return true;
        if (ts.isFunctionLike(maybeReturn)) return false;
        maybeReturn = maybeReturn.parent;
      }
    }
    if (ts.isReturnStatement(parent) && parent.expression === current) return true;
    if (ts.isFunctionLike(parent)) return false;
    current = parent;
  }
  return false;
}

function isConsoleErrorOfCatchVariable(node, errorName) {
  if (!ts.isCallExpression(node)) return false;
  const expression = node.expression;
  if (
    !ts.isPropertyAccessExpression(expression)
    || !isId(expression.expression, "console")
    || expression.name.text !== "error"
  ) return false;
  return node.arguments.some((arg) => isId(arg, errorName));
}

function actionLabel(filePath) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function transformFile(filePath, sourceText) {
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const edits = [];
  const importNames = new Set();
  let unsafeMessages = 0;
  let safeLogCalls = 0;
  const label = actionLabel(filePath);

  function addEdit(start, end, replacement) {
    edits.push({ start, end, replacement });
  }

  function visit(node) {
    if (ts.isCatchClause(node) && node.block) {
      const errorName = node.variableDeclaration && ts.isIdentifier(node.variableDeclaration.name)
        ? node.variableDeclaration.name.text
        : null;
      if (errorName) {
        const directConsoleStatements = [];
        const propertyAccesses = [];

        function visitCatch(child) {
          if (child !== node && ts.isCatchClause(child)) return;

          if (ts.isExpressionStatement(child) && isConsoleErrorOfCatchVariable(child.expression, errorName)) {
            directConsoleStatements.push(child);
          }

          if (
            ts.isPropertyAccessExpression(child)
            && isErrorMessage(child, errorName)
            && isUserVisibleMessage(child, node, errorName)
            && !isInsideExpectedDomainGuard(child, node, errorName)
          ) {
            propertyAccesses.push(child);
          }
          ts.forEachChild(child, visitCatch);
        }
        visitCatch(node.block);

        // Replace only unguarded error.message values that are returned to the client.
        for (const access of propertyAccesses) {
          addEdit(
            access.getStart(sourceFile),
            access.getEnd(),
            `safeActionErrorMessage(${errorName}, ${JSON.stringify(label)})`,
          );
          unsafeMessages += 1;
          importNames.add("safeActionErrorMessage");
        }

        if (propertyAccesses.length > 0) {
          // safeActionErrorMessage logs sanitized metadata; remove any raw error logging
          // inside this catch to avoid duplicate and potentially sensitive logs.
          for (const statement of directConsoleStatements) {
            addEdit(statement.getStart(sourceFile), statement.getEnd(), "/* sanitized error is logged by safeActionErrorMessage */");
          }
        } else {
          // If the action already returns a safe generic result, sanitize raw error logging.
          for (const statement of directConsoleStatements) {
            addEdit(
              statement.getStart(sourceFile),
              statement.getEnd(),
              `logUnexpectedActionError(${JSON.stringify(label)}, ${errorName});`,
            );
            safeLogCalls += 1;
            importNames.add("logUnexpectedActionError");
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  // Also sanitize raw console.error(error) calls outside catch clauses, such as
  // shared action-level error helpers. Keep edits already made inside catches.
  function visitRawConsoleLogs(node) {
    if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
      const call = node.expression;
      const expression = call.expression;
      const isConsoleError = ts.isPropertyAccessExpression(expression)
        && isId(expression.expression, "console")
        && expression.name.text === "error";
      const hasErrorVariable = call.arguments.some((argument) =>
        ts.isIdentifier(argument) && /^(error|err|exception)$/i.test(argument.text)
      );
      const alreadyEdited = edits.some((edit) => edit.start === node.getStart(sourceFile) && edit.end === node.getEnd());
      if (isConsoleError && hasErrorVariable && !alreadyEdited) {
        const errorArgument = [...call.arguments].reverse().find((argument) =>
          ts.isIdentifier(argument) && /^(error|err|exception)$/i.test(argument.text)
        );
        if (errorArgument && ts.isIdentifier(errorArgument)) {
          addEdit(
            node.getStart(sourceFile),
            node.getEnd(),
            `logUnexpectedActionError(${JSON.stringify(label)}, ${errorArgument.text});`,
          );
          safeLogCalls += 1;
          importNames.add("logUnexpectedActionError");
        }
      }
    }
    ts.forEachChild(node, visitRawConsoleLogs);
  }
  visitRawConsoleLogs(sourceFile);

  if (edits.length === 0) return { changed: false, sourceText, unsafeMessages, safeLogCalls };

  const alreadyImported = sourceFile.statements.some((statement) =>
    ts.isImportDeclaration(statement)
    && ts.isStringLiteral(statement.moduleSpecifier)
    && statement.moduleSpecifier.text === safeImport
  );
  if (!alreadyImported && importNames.size > 0) {
    const firstImport = sourceFile.statements.find(ts.isImportDeclaration);
    const insertAt = firstImport ? firstImport.getStart(sourceFile) : sourceFile.statements[0]?.getEnd() ?? 0;
    const importText = `import { ${[...importNames].sort().join(", ")} } from "${safeImport}";\n`;
    addEdit(insertAt, insertAt, importText);
  } else if (alreadyImported && importNames.size > 0) {
    // Don't silently leave a partially imported helper; make this script idempotent for
    // the intended one-time application and tell the developer to inspect manual changes.
    const importedNames = new Set();
    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || statement.moduleSpecifier.text !== safeImport) continue;
      const clause = statement.importClause;
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        clause.namedBindings.elements.forEach((element) => importedNames.add(element.name.text));
      }
    }
    const missing = [...importNames].filter((name) => !importedNames.has(name));
    if (missing.length > 0) {
      const importDecl = sourceFile.statements.find((statement) =>
        ts.isImportDeclaration(statement)
        && ts.isStringLiteral(statement.moduleSpecifier)
        && statement.moduleSpecifier.text === safeImport
      );
      if (importDecl?.importClause?.namedBindings && ts.isNamedImports(importDecl.importClause.namedBindings)) {
        const bindings = importDecl.importClause.namedBindings;
        const existingText = sourceText.slice(bindings.getStart(sourceFile), bindings.getEnd());
        const replacement = existingText.replace(/}\s*$/, `, ${missing.sort().join(", ")} }`);
        addEdit(bindings.getStart(sourceFile), bindings.getEnd(), replacement);
      } else {
        console.error(`Cannot automatically extend helper import in ${label}; inspect this file manually.`);
        return { changed: false, sourceText, unsafeMessages, safeLogCalls };
      }
    }
  }

  // Apply edits from right to left to preserve original source positions and leave
  // permission checks/role logic untouched.
  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let result = sourceText;
  for (const edit of edits) result = result.slice(0, edit.start) + edit.replacement + result.slice(edit.end);
  return { changed: true, sourceText: result, unsafeMessages, safeLogCalls };
}

const files = await walk(appRoot);
let changedCount = 0;
for (const filePath of files) {
  const sourceText = await fs.readFile(filePath, "utf8");
  const result = transformFile(filePath, sourceText);
  if (!result.changed) continue;
  changedCount += 1;
  patchedSummary.push({
    file: actionLabel(filePath),
    rawMessagesSanitized: result.unsafeMessages,
    errorLogsSanitized: result.safeLogCalls,
  });
  if (!dryRun) await fs.writeFile(filePath, result.sourceText, "utf8");
}

if (dryRun) {
  console.log("DRY RUN — no files changed.");
}
console.log(`${dryRun ? "Would update" : "Updated"} ${changedCount} server-action file(s).`);
for (const item of patchedSummary) {
  console.log(`- ${item.file}: ${item.rawMessagesSanitized} client message(s), ${item.errorLogsSanitized} raw error log(s)`);
}
if (changedCount === 0) console.log("No raw error message returns or raw console.error(error) patterns were found by this script.");
