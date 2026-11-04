function renderOwner(element, ts) {
  let current = ts.isJsxOpeningElement(element) ? element.parent : element;
  while (current.parent) {
    const parent = current.parent;
    if (ts.isArrowFunction(parent) && parent.body === current) return parent;
    if (ts.isReturnStatement(parent) && parent.expression === current) {
      let owner = parent.parent;
      while (owner && !ts.isFunctionLike(owner)) owner = owner.parent;
      return owner;
    }
    // Keep the element in the returned render tree. In particular, JSX passed
    // to a call, assigned to a variable, or placed in another component's props
    // can expose the element's value prop to application code.
    if (ts.isParenthesizedExpression(parent)
      || (ts.isConditionalExpression(parent) && (parent.whenTrue === current || parent.whenFalse === current))
      || (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && parent.right === current)
      || (ts.isJsxExpression(parent) && !parent.dotDotDotToken)
      || (ts.isJsxFragment(parent) && parent.children.includes(current))
      || (ts.isJsxElement(parent) && parent.children.includes(current)
        && ts.isIdentifier(parent.openingElement.tagName) && /^[a-z][a-z0-9]*$/.test(parent.openingElement.tagName.text))) {
      current = parent;
      continue;
    }
    return undefined;
  }
  return undefined;
}

function createLocalTypeChecker(sourceFile, ts) {
  // Bind the actual lexical scope without loading any module, library, or config.
  const program = ts.createProgram([sourceFile.fileName], { noLib: true, noResolve: true }, {
    getSourceFile: (fileName) => fileName === sourceFile.fileName ? sourceFile : undefined,
    getDefaultLibFileName: () => "",
    getCurrentDirectory: () => "",
    getCanonicalFileName: (fileName) => fileName,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    fileExists: (fileName) => fileName === sourceFile.fileName,
    readFile: (fileName) => fileName === sourceFile.fileName ? sourceFile.text : undefined,
    writeFile: () => {},
  });
  return program.getTypeChecker();
}

function unwrapParentheses(node, ts) {
  while (node && ts.isParenthesizedExpression(node)) node = node.expression;
  return node;
}

function copyTextLiterals(node, ts) {
  const value = unwrapParentheses(node, ts);
  if (!value) return null;
  if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)
    || (ts.isTemplateExpression(value) && value.templateSpans.every(({ expression }) => ts.isIdentifier(expression)))) return [value];
  if (!ts.isConditionalExpression(value)) return null;
  const whenTrue = copyTextLiterals(value.whenTrue, ts);
  const whenFalse = copyTextLiterals(value.whenFalse, ts);
  return whenTrue && whenFalse ? [...whenTrue, ...whenFalse] : null;
}

export function collectCopyTextSourceRanges(sourceFile, ts) {
  const ranges = [];
  const templateStarts = new Set();
  // Per-file JSX settings can redirect element creation away from React.
  if (!sourceFile.text.includes("CopyButton") || sourceFile.parseDiagnostics.length
    || /@jsx(?:Runtime|ImportSource|Frag)?\b/i.test(sourceFile.text)) return { ranges, templateStarts };

  const copyImports = new Set();
  const roots = [];
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)) {
      roots.push(statement);
    }
    if (ts.isExportAssignment(statement) && !statement.isExportEquals
      && (ts.isArrowFunction(statement.expression) || ts.isFunctionExpression(statement.expression))) {
      roots.push(statement.expression);
    }
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)
      || statement.moduleSpecifier.text !== "@/src/ui") continue;
    const clause = statement.importClause;
    if (!clause || clause.isTypeOnly || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) continue;
    for (const specifier of clause.namedBindings.elements) {
      if (!specifier.isTypeOnly && (specifier.propertyName ?? specifier.name).text === "CopyButton") copyImports.add(specifier);
    }
  }
  if (!copyImports.size || roots.length !== 1) return { ranges, templateStarts };

  const checker = createLocalTypeChecker(sourceFile, ts);
  if (sourceFile.bindDiagnostics.length) return { ranges, templateStarts };
  const [root] = roots;
  const copyElements = [];
  const identifiers = [];
  let rootIsReferenced = false;
  function visit(node) {
    // Reject any other use of the default export's local name. This also
    // covers shorthand object properties, whose symbols are property symbols.
    if (ts.isIdentifier(node)) {
      if (root.name && node !== root.name && node.text === root.name.text) rootIsReferenced = true;
      identifiers.push(node);
    }
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ts.isIdentifier(node.tagName)
      && renderOwner(node, ts) === root) {
      const declarations = checker.getSymbolAtLocation(node.tagName)?.declarations;
      if (declarations?.length === 1 && copyImports.has(declarations[0])) copyElements.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  // Even an ordinary call to the root can expose the returned element's props.
  if (rootIsReferenced) return { ranges, templateStarts };

  function addLiteral(value) {
    function addRange(node, suffixLength) {
      const start = node.getStart(sourceFile) + 1;
      const end = node.end - suffixLength;
      if (start < end) ranges.push([start, end]);
    }
    if (!ts.isTemplateExpression(value)) {
      addRange(value, 1);
      return;
    }
    templateStarts.add(value.getStart(sourceFile));
    addRange(value.head, 2);
    for (const { literal } of value.templateSpans) addRange(literal, ts.isTemplateTail(literal) ? 1 : 2);
  }

  const localCopyBindings = new Map();
  for (const element of copyElements) {
    const properties = element.attributes.properties;
    if (properties.some(ts.isJsxSpreadAttribute)) continue;
    const values = properties.filter((prop) => ts.isJsxAttribute(prop) && ts.isIdentifier(prop.name) && prop.name.text === "value");
    if (values.length !== 1) continue;
    const initializer = values[0].initializer;
    if (!initializer) continue;
    const value = unwrapParentheses(ts.isJsxExpression(initializer) ? initializer.expression : initializer, ts);
    if (!value) continue;
    if (!ts.isIdentifier(value)) {
      for (const literal of copyTextLiterals(value, ts) ?? []) addLiteral(literal);
      continue;
    }
    const symbol = checker.getSymbolAtLocation(value);
    if (localCopyBindings.has(symbol)) {
      localCopyBindings.get(symbol).allowed.add(value);
      continue;
    }
    const declarations = symbol?.declarations;
    if (declarations?.length !== 1) continue;
    const [declaration] = declarations;
    if (!ts.isVariableDeclaration(declaration) || !ts.isIdentifier(declaration.name)
      || !ts.isVariableDeclarationList(declaration.parent) || !(declaration.parent.flags & ts.NodeFlags.Const)
      || !ts.isVariableStatement(declaration.parent.parent) || declaration.parent.parent.parent !== root.body) continue;
    const literals = copyTextLiterals(declaration.initializer, ts);
    if (literals) localCopyBindings.set(symbol, { literals, allowed: new Set([declaration.name, value]) });
  }

  // The shared button keeps its input out of the DOM. Rendering that same text
  // elsewhere would allow app code to recover it without reading this binding.
  const bindingNames = new Set([...localCopyBindings.keys()].map((symbol) => symbol.name));
  for (const identifier of identifiers) {
    if (!bindingNames.has(identifier.text)) continue;
    // A shorthand property has its own property symbol and still reads the
    // local variable, which would let the text escape the render sinks.
    const symbol = ts.isShorthandPropertyAssignment(identifier.parent) && identifier.parent.name === identifier
      ? checker.getShorthandAssignmentValueSymbol(identifier.parent)
      : checker.getSymbolAtLocation(identifier);
    const binding = localCopyBindings.get(symbol);
    if (binding && !binding.allowed.has(identifier)) localCopyBindings.delete(symbol);
  }
  for (const { literals } of localCopyBindings.values()) for (const literal of literals) addLiteral(literal);
  return { ranges: ranges.sort(([left], [right]) => left - right), templateStarts };
}

export function collectDataPropertySchemeOffsets(sourceFile, ts) {
  const offsets = new Set();
  function visit(node) {
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
      const end = node.name.end;
      const offset = end - 4;
      if (offset >= node.name.getStart(sourceFile) && sourceFile.text.slice(offset, end + 1).toLowerCase() === "data:") {
        offsets.add(offset);
      }
    }
    ts.forEachChild(node, visit);
  }
  if (!sourceFile.parseDiagnostics.length) visit(sourceFile);
  return offsets;
}

// Recognize object fields in verified copy text, such as `{ data: item.input }`.
// Keep URI forms with a media type, base64 marker, or empty header detectable.
export function isCopyTextDataProperty(text, index) {
  let start = index;
  while (start > 0 && /[$\w]/.test(text[start - 1])) start--;
  while (start > 0 && /\s/.test(text[start - 1])) start--;
  if (text[start - 1] !== "{" && text[start - 1] !== ",") return false;

  const value = /\s*[$A-Z_a-z][$\w]*(?:\.[$A-Z_a-z][$\w]*)*\s*[(,}]/y;
  value.lastIndex = index + 5;
  return value.test(text);
}
