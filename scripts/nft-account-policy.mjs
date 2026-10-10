import ts from "typescript";

export const NFT_ACCOUNT_PROFILE = "null-bag-withdraw-v1";
export const NFT_ACCOUNT_REVIEW_NOTICE = "NFT account withdrawal requires deployment-specific host approval. Review factory provenance, Vault/NFT beacon implementations, registry/salt/account bytecode, current holder, ERC20 behavior and SyncFailed handling. A manifest declaration grants no transaction permission.";

export function checkNftAccountDeclarations(value, field, binding) {
  const invalid = (message) => ({ severity: "blocking", ruleId: "nft-account/invalid-declaration", message, field });
  if (!binding.factoryAddress || !Array.isArray(value) || value.length < 1 || value.length > 8) return [invalid("Use 1-8 reviewed policy declarations on a factory binding only.")];
  const issues = [];
  const seen = new Set();
  value.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).some((key) => !["policyId", "profile"].includes(key)) || item.profile !== NFT_ACCOUNT_PROFILE || typeof item.policyId !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.policyId ?? "") || item.policyId.length > 64 || seen.has(item.policyId)) {
      issues.push(invalid(`Invalid or duplicate NFT account policy at ${field}[${index}]. Only policyId and profile are allowed.`));
      return;
    }
    seen.add(item.policyId);
    issues.push({ severity: "warning", ruleId: "manual-review/nft-account-withdrawal", message: NFT_ACCOUNT_REVIEW_NOTICE, chainId: binding.chainId, factoryAddress: binding.factoryAddress, policyId: item.policyId, profile: item.profile, field: `${field}[${index}]` });
  });
  return issues;
}

export function collectNftAccountReview(issues) {
  return issues.filter((item) => item.ruleId === "manual-review/nft-account-withdrawal").map(({ chainId, factoryAddress, policyId, profile, field, severity, ruleId }) => ({ chainId, factoryAddress, policyId, profile, field, severity, ruleId }));
}

// Provider props contain host authorization. They must not be available to an artifact.
export function checkNftAccountSource(content, file) {
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const issues = [];
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === "@/src/sdk") {
      const clause = ts.isImportDeclaration(node) ? node.importClause : undefined;
      const bindings = clause?.namedBindings ?? (ts.isExportDeclaration(node) ? node.exportClause : undefined);
      const unsafe = (bindings && ts.isNamedImports(bindings) && bindings.elements.some((item) => (item.propertyName ?? item.name).text === "VaultRuntimeProvider")) || (bindings && ts.isNamedExports(bindings) && bindings.elements.some((item) => (item.propertyName ?? item.name).text === "VaultRuntimeProvider"));
      if (unsafe) issues.push({ severity: "blocking", ruleId: "nft-account/host-only-provider", message: "Import named component-facing SDK APIs only. VaultRuntimeProvider is host-only and cannot expose host authorization and are not allowed in Vault source.", file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
    }
    if (ts.isPropertyAssignment(node) && node.name.getText(source).replace(/["']/g, "") === "functionName" && ts.isStringLiteral(node.initializer) && node.initializer.text === "execute") {
      issues.push({ severity: "warning", ruleId: "nft-account/use-restricted-entry", message: "Do not construct generic execute requests in Vault source. Use sdk.withdrawNftAccount with a declared and host-approved policy.", file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return issues;
}
