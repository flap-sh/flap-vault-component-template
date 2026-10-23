import ts from "typescript";
import { isStandaloneApp } from "./standalone-app.mjs";
import { parseAppWalletContracts } from "../src/sdk/appWalletPolicy.mjs";
export function checkStandaloneWalletManifest(manifest) {
  const chains = manifest?.walletChains; const contracts = manifest?.walletContracts;
  if (chains === undefined && contracts === undefined) return [];
  if (!isStandaloneApp(manifest) || !Array.isArray(chains) || !chains.length || chains.length > 8 || chains.some((id) => !Number.isSafeInteger(id) || id <= 0) || new Set(chains).size !== chains.length) return [{ severity: "blocking", ruleId: "standalone-wallet/invalid-chains", message: "walletChains is a standalone-only list of 1-8 unique positive chain IDs." }];
  try {
    const parsed = parseAppWalletContracts(contracts);
    if (parsed.some((p) => !chains.includes(p.definition.chainId))) throw new Error("Contract chain must be declared in walletChains.");
    return parsed.map((p) => ({ severity: "warning", ruleId: "manual-review/standalone-wallet", ...p.definition, message: "Review this App's fixed contract, exact signatures, resolver provenance, spender/approval caps and native-value cap. Rendering fixtures do not authorize transactions or prove business behavior." }));
  } catch (error) { return [{ severity: "blocking", ruleId: "standalone-wallet/invalid-contracts", message: error.message }]; }
}
export function checkStandaloneWalletSource(content, file, manifest) {
  if (!isStandaloneApp(manifest)) return [];
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const issues = []; const hooks = new Set(); const handles = new Set(); let hasWrites = false;
  const add = (ruleId, message, node) => issues.push({ severity: "blocking", ruleId, message, file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
  for (const node of source.statements) if (ts.isImportDeclaration(node) && node.moduleSpecifier.text === "@/src/sdk" && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) for (const item of node.importClause.namedBindings.elements) if ((item.propertyName ?? item.name).text === "useFlapSdk") hooks.add(item.name.text);
  function visit(node) {
    if (ts.isIdentifier(node) && ["writeContract", "simulateContract", "sendTransaction"].includes(node.text)) hasWrites = true;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isAwaitExpression(node.initializer) && ts.isCallExpression(node.initializer.expression) && ts.isPropertyAccessExpression(node.initializer.expression.expression) && node.initializer.expression.expression.name.text === "resolveContract") handles.add(node.name.text);
    if (ts.isCallExpression(node)) {
      if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "resolveContract") {
        const id = node.arguments[0]; const declared = (manifest.walletContracts ?? []).flatMap((c) => c.resolvedContracts ?? []);
        if (!id || !ts.isStringLiteral(id) || !declared.some((c) => c.id === id.text)) add("standalone-wallet/undeclared-resolver", "resolveContract requires a declared literal resolver ID.", node);
      }
      if (ts.isIdentifier(node.expression) && hooks.has(node.expression.text)) {
        const arg = node.arguments[0];
        if (!arg || !ts.isObjectLiteralExpression(arg) || !arg.properties.some((p) => ts.isPropertyAssignment(p) && p.name.getText(source).replace(/["']/g, "") === "chainId")) add("standalone-wallet/explicit-chain", "Independent Apps use the shared useFlapSdk({ chainId }) hook.", node);
      }
      if (ts.isPropertyAccessExpression(node.expression) && ["writeContract", "simulateContract", "sendTransaction"].includes(node.expression.name.text)) {
        const arg = node.arguments[0];
        if (arg && ts.isObjectLiteralExpression(arg)) {
          const get = (key) => arg.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText(source).replace(/["']/g, "") === key)?.initializer;
          const target = get("address") ?? get("to"); const contract = get("contract");
          if (contract && ts.isIdentifier(contract) && handles.has(contract.text)) { if (target) add("standalone-wallet/handle-address-override", "Use the genuine resolved handle without an address override.", node); }
          else if (target && !(ts.isStringLiteral(target) || ts.isIdentifier(target))) add("standalone-wallet/dynamic-target", "Dynamic write targets require a reviewed resolveContract handle.", target);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (hasWrites && (!manifest.walletChains?.length || !manifest.walletContracts?.length)) issues.push({ severity: "blocking", ruleId: "standalone-wallet/missing-contracts", message: "Declare walletChains and walletContracts before wallet actions.", file });
  return issues;
}
