import ts from "typescript";
import { parseResolvedContract } from "../src/sdk/resolvedContractPolicy.mjs";

export function checkResolvedContractDeclarations(value, field, binding) {
  const bad = (message) => ({ severity: "blocking", ruleId: "resolved-contract/invalid-declaration", message, field });
  if (!binding.factoryAddress || !Array.isArray(value) || value.length < 1 || value.length > 8) return [bad("Use 1-8 resolvers on a factory binding.")];
  const issues = []; const ids = new Set();
  for (const definition of value) {
    try {
      const parsed = parseResolvedContract(definition);
      if (ids.has(parsed.definition.id)) throw new Error("Duplicate resolver id.");
      ids.add(parsed.definition.id);
      issues.push({ severity: "warning", ruleId: "manual-review/resolved-contract", message: "Review resolver provenance, method semantics and arguments, upgrade authority, value cap, code constraints and fixed checks. The reviewed Vault is trusted; re-resolution is not atomic with mining.", chainId: binding.chainId, factoryAddress: binding.factoryAddress, field, ...parsed.definition });
    } catch (error) { issues.push(bad(error.message)); }
  }
  return issues;
}
export function collectResolvedContractReview(issues) { return issues.filter((x) => x.ruleId === "manual-review/resolved-contract"); }
export function collectResolvedHandles(content, file) {
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const handles = new Map();
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isAwaitExpression(node.initializer)) {
      const init = node.initializer.expression;
      if (ts.isCallExpression(init) && ts.isPropertyAccessExpression(init.expression) && init.expression.name.text === "resolveContract" && ts.isStringLiteral(init.arguments[0])) handles.set(node.name.text, init.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source); return handles;
}
export function checkResolvedContractSource(content, file, bindings) {
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const handles = collectResolvedHandles(content, file);
  const definitions = bindings.flatMap((b) => b.resolvedContracts ?? []);
  const issues = [];
  const bad = (node, message) => issues.push({ severity: "blocking", ruleId: "resolved-contract/invalid-call", message, file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      if (method === "resolveContract" && (!node.arguments[0] || !ts.isStringLiteral(node.arguments[0]) || !definitions.some((d) => d.id === node.arguments[0].text))) bad(node, "resolveContract requires a declared literal id.");
      if (["readContract", "simulateContract", "writeContract"].includes(method) && node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])) {
        const props = node.arguments[0].properties;
        const prop = (key) => props.find((p) => ts.isPropertyAssignment(p) && p.name.getText(source).replace(/["']/g, "") === key)?.initializer;
        const contract = prop("contract");
        if (contract && ts.isIdentifier(contract)) {
          const id = handles.get(contract.text);
          if (!id) bad(node, "Handle must trace to await sdk.resolveContract with a literal id.");
          else {
            if (prop("address")) bad(node, "Do not pass address with a resolved handle.");
            const name = prop("functionName");
            if (!name || !ts.isStringLiteral(name)) bad(node, "Handle calls require a literal functionName.");
            else if (!definitions.filter((d) => d.id === id).some((d) => {
              try { const p = parseResolvedContract(d); const entries = method === "readContract" ? p.reads : p.writes; return entries === "any" || entries.some((f) => f.name === name.text); } catch { return false; }
            })) bad(node, "Function is outside this resolver's declared allow/read list.");
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source); return issues;
}
