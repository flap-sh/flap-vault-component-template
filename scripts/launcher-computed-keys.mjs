import ts from "typescript";

const maxDepth = 24;
const maxKeyLength = 128;
const numericOperators = new Set([
  ts.SyntaxKind.MinusToken, ts.SyntaxKind.AsteriskToken, ts.SyntaxKind.AsteriskAsteriskToken,
  ts.SyntaxKind.SlashToken, ts.SyntaxKind.PercentToken, ts.SyntaxKind.LessThanLessThanToken,
  ts.SyntaxKind.GreaterThanGreaterThanToken, ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken,
  ts.SyntaxKind.AmpersandToken, ts.SyntaxKind.BarToken, ts.SyntaxKind.CaretToken,
]);

export function launcherComputedKeys(source) {
  let checker;
  const staticValues = new WeakMap();
  const numericKeys = new WeakMap();
  // Bind the submitted file only. Types and imports cannot authorize runtime keys.
  function symbolFor(identifier) {
    checker ??= ts.createProgram([source.fileName], { noLib: true, noResolve: true }, {
      getSourceFile: name => name === source.fileName ? source : undefined,
      getDefaultLibFileName: () => "",
      getCurrentDirectory: () => "",
      getCanonicalFileName: name => name,
      getNewLine: () => "\n",
      useCaseSensitiveFileNames: () => true,
      fileExists: name => name === source.fileName,
      readFile: name => name === source.fileName ? source.text : undefined,
      writeFile() {},
    }).getTypeChecker();
    if (ts.isShorthandPropertyAssignment(identifier.parent) && identifier.parent.name === identifier) {
      return checker.getShorthandAssignmentValueSymbol(identifier.parent);
    }
    return checker.getSymbolAtLocation(identifier);
  }

  function followConst(expression, depth, evaluate) {
    if (!ts.isIdentifier(expression)) return undefined;
    const declaration = symbolFor(expression)?.valueDeclaration;
    if (declaration && ts.isVariableDeclaration(declaration) && ts.isVariableDeclarationList(declaration.parent)
      && (declaration.parent.flags & ts.NodeFlags.BlockScoped) === ts.NodeFlags.Const && declaration.initializer) {
      return evaluate(declaration.initializer, depth + 1);
    }
  }

  function value(node, depth = 0) {
    if (!node || depth > maxDepth) return undefined;
    return memoize(staticValues, ts.skipOuterExpressions(node), depth, evaluateStaticValue);
  }

  function memoize(cache, expression, depth, evaluate) {
    let values = cache.get(expression);
    if (!values) {
      values = new Map();
      cache.set(expression, values);
    }
    if (!values.has(depth)) values.set(depth, evaluate(expression, depth));
    return values.get(depth);
  }

  function evaluateStaticValue(expression, depth) {
    if (ts.isStringLiteralLike(expression) && expression.text.length <= maxKeyLength) return expression.text;
    if (ts.isNumericLiteral(expression)) return Number(expression.text);
    if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = value(expression.left, depth + 1);
      if (left === undefined) return undefined;
      const right = value(expression.right, depth + 1);
      if (right === undefined) return undefined;
      if (typeof left === "number" && typeof right === "number") return left + right;
      const text = String(left) + String(right);
      return text.length <= maxKeyLength ? text : undefined;
    }
    if (ts.isTemplateExpression(expression)) {
      let text = expression.head.text;
      for (const span of expression.templateSpans) {
        const part = value(span.expression, depth + 1);
        if (part === undefined) return undefined;
        text += String(part) + span.literal.text;
        if (text.length > maxKeyLength) return undefined;
      }
      return text;
    }
    return followConst(expression, depth, value);
  }

  function isNumeric(node, depth = 0) {
    if (!node || depth > maxDepth) return false;
    return memoize(numericKeys, ts.skipOuterExpressions(node), depth, evaluateNumericKey);
  }

  function evaluateNumericKey(expression, depth) {
    if (ts.isNumericLiteral(expression)) return true;
    if (ts.isPrefixUnaryExpression(expression)) {
      return expression.operator === ts.SyntaxKind.PlusToken || expression.operator === ts.SyntaxKind.TildeToken
        || expression.operator === ts.SyntaxKind.MinusToken;
    }
    if (ts.isBinaryExpression(expression)) {
      const operator = expression.operatorToken.kind;
      if (numericOperators.has(operator)) return true;
      if (operator === ts.SyntaxKind.PlusToken) {
        return isNumeric(expression.left, depth + 1) && isNumeric(expression.right, depth + 1);
      }
    }
    return followConst(expression, depth, isNumeric) ?? false;
  }

  function isUnresolvedAccess(node, depth = 0) {
    if (!node || depth > maxDepth) return false;
    const expression = ts.skipOuterExpressions(node);
    if (ts.isElementAccessExpression(expression)) {
      return value(expression.argumentExpression) === undefined && !isNumeric(expression.argumentExpression);
    }
    return followConst(expression, depth, isUnresolvedAccess) ?? false;
  }

  function isUnresolvedCallable(node, depth = 0) {
    if (!node || depth > maxDepth) return false;
    const expression = ts.skipOuterExpressions(node);
    if (isUnresolvedAccess(expression)) return true;
    if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
      const key = ts.isPropertyAccessExpression(expression) ? expression.name.text : value(expression.argumentExpression);
      return ["call", "apply", "bind"].includes(key) && isUnresolvedAccess(expression.expression);
    }
    return followConst(expression, depth, isUnresolvedCallable) ?? false;
  }

  return { value, isNumeric, isUnresolvedAccess, isUnresolvedCallable, symbolFor };
}
