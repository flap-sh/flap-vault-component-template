import ts from "typescript";
import { normalizeCardImageUrl } from "../src/ui/cardImageUrl.mjs";

const IMAGE_NAME = "CardImage";
const BITMAP_NAME = "useCardImageBitmap";
const IMPORT_NAMES = new Set([IMAGE_NAME, BITMAP_NAME]);
const IMAGE_PROPS = new Set(["src", "alt", "className", "fallback"]);

function localTypeChecker(sourceFile) {
  const fileName = sourceFile.fileName;
  return ts.createProgram([fileName], { noLib: true, noResolve: true }, {
    getSourceFile: (name) => name === fileName ? sourceFile : undefined,
    getDefaultLibFileName: () => "",
    getCurrentDirectory: () => "",
    getCanonicalFileName: (name) => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    fileExists: (name) => name === fileName,
    readFile: (name) => name === fileName ? sourceFile.text : undefined,
    writeFile: () => {},
  }).getTypeChecker();
}

function unwrap(expression) {
  while (expression && (
    ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) ||
    ts.isNonNullExpression(expression) || ts.isSatisfiesExpression(expression) ||
    ts.isTypeAssertionExpression(expression)
  )) {
    expression = expression.expression;
  }
  return expression;
}

function resolveString(node, checker, seen = new Set()) {
  const expression = unwrap(node);
  if (!expression) return undefined;
  if (ts.isStringLiteralLike(expression)) return expression.text;
  if (!ts.isIdentifier(expression)) return undefined;
  const declaration = checker.getSymbolAtLocation(expression)?.valueDeclaration;
  if (
    !declaration || !ts.isVariableDeclaration(declaration) ||
    !ts.isIdentifier(declaration.name) || !(declaration.parent.flags & ts.NodeFlags.Const) ||
    seen.has(declaration)
  ) {
    return undefined;
  }
  seen.add(declaration);
  return resolveString(declaration.initializer, checker, seen);
}

/** Classify only directly used named runtime imports and their inline URL arguments. */
export function collectCardImageMediaUsage(sourceFile, file, { allowBitmap = false } = {}) {
  const result = { issues: [], allowedUrlRanges: [], imageTagStarts: [], hasApprovedUsage: false };
  if (!/\b(?:CardImage|useCardImageBitmap)\b/.test(sourceFile.text)) return result;

  const checker = localTypeChecker(sourceFile);
  const importedNames = new Map([[IMAGE_NAME, IMAGE_NAME], [BITMAP_NAME, BITMAP_NAME]]);
  const trustedSymbols = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const clause = statement.importClause;
    if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) continue;
    for (const specifier of clause.namedBindings.elements) {
      const original = (specifier.propertyName ?? specifier.name).text;
      if (!IMPORT_NAMES.has(original)) continue;
      importedNames.set(specifier.name.text, original);
      if (statement.moduleSpecifier.text !== "@/src/ui" || clause.isTypeOnly || specifier.isTypeOnly) continue;
      const symbol = checker.getSymbolAtLocation(specifier.name);
      if (symbol) trustedSymbols.set(symbol, original);
    }
  }

  function report(node, ruleId, message) {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    result.issues.push({ severity: "blocking", ruleId, message, file, line });
  }

  function trustedImport(node) {
    return ts.isIdentifier(node) ? trustedSymbols.get(checker.getSymbolAtLocation(node)) : undefined;
  }

  function namedLike(node, name) {
    if (ts.isIdentifier(node)) return importedNames.get(node.text) === name;
    if (ts.isPropertyAccessExpression(node)) return node.name.text === name;
    return ts.isElementAccessExpression(node) &&
      ts.isStringLiteralLike(node.argumentExpression) && node.argumentExpression.text === name;
  }

  function approveSource(source, ruleId) {
    const staticValue = resolveString(source, checker);
    if (staticValue !== undefined && !normalizeCardImageUrl(staticValue)) {
      report(source, ruleId, "Card media requires an HTTPS image URL from the approved image directory.");
      return false;
    }
    const inline = unwrap(source);
    if (ts.isStringLiteralLike(inline)) {
      result.allowedUrlRanges.push([inline.getStart(sourceFile), inline.end]);
    }
    result.hasApprovedUsage = true;
    return true;
  }

  function inspectImage(node) {
    const ruleId = "media-policy/invalid-card-image";
    const props = new Map();
    let invalidProps = false;
    for (const attribute of node.attributes.properties) {
      if (!ts.isJsxAttribute(attribute) || !ts.isIdentifier(attribute.name)) {
        invalidProps = true;
        continue;
      }
      const name = attribute.name.text;
      const initializer = attribute.initializer;
      const value = initializer && ts.isJsxExpression(initializer) ? initializer.expression : initializer;
      if (!IMAGE_PROPS.has(name) || props.has(name) || !value) invalidProps = true;
      props.set(name, value);
    }
    const hasChildren = ts.isJsxOpeningElement(node) && node.parent.children.some(
      (child) => !ts.isJsxText(child) || child.text.trim(),
    );
    if (trustedImport(node.tagName) !== IMAGE_NAME || invalidProps || hasChildren || !props.get("src") || !props.get("alt")) {
      report(node, ruleId, "Import CardImage as a named value from @/src/ui and pass explicit src and alt props. Only className and fallback may be added.");
      return;
    }
    if (approveSource(props.get("src"), ruleId)) result.imageTagStarts.push(node.getStart(sourceFile));
  }

  function inspectBitmap(node, callee) {
    const ruleId = "media-policy/invalid-card-bitmap";
    if (trustedImport(callee) !== BITMAP_NAME || node.arguments.length !== 1 || ts.isSpreadElement(node.arguments[0])) {
      report(node, ruleId, "Import useCardImageBitmap as a named value from @/src/ui and call it directly with one image URL expression.");
      return;
    }
    if (!allowBitmap) {
      report(node, ruleId, "useCardImageBitmap requires the three-r3f-v1 capability.");
      return;
    }
    approveSource(node.arguments[0], ruleId);
  }

  function visit(node) {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      (trustedImport(node.tagName) === IMAGE_NAME || namedLike(node.tagName, IMAGE_NAME))
    ) {
      inspectImage(node);
    }
    if (ts.isCallExpression(node)) {
      const callee = unwrap(node.expression);
      if (trustedImport(callee) === BITMAP_NAME || namedLike(callee, BITMAP_NAME)) inspectBitmap(node, callee);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return result;
}
