# Reference Workflow

Use references before coding. Do not rely on memory when the user asks to match an existing page or Vault.

## Required Review Order

1. Identify the target workflow:
   - token/vault shell only
   - read dashboard
   - approve/write action
   - oracle-signed action
   - NFT/voucher dashboard
   - countdown/game/round flow
   - dual-token/bonding-curve flow
2. Select the closest pattern from `patterns.md`.
3. Inspect any reference URL, screenshot, or file path provided by the user.
4. If an internal Flap frontend checkout is available, inspect the closest existing Vault from `existing-vaults.md`.
5. Implement with this template's SDK/UI primitives, not by copying private source.
6. Keep the selected references in your implementation notes or PR description; do not create a generation report file in this template.

## URL or Live Page References

When the user provides a URL:

- Open the page if browser tooling is available.
- Capture the visible structure, not only the text.
- Record layout constraints, sections, actions, disabled states, and error/fallback states.
- Do not treat live data values as constants.
- Do not scrape or copy private payloads, credentials, or project secrets.

Use live pages as visual and workflow references only. Prefer local source references when exact behavior matters.

Do not add an external endpoint, external resource, or fixed extra contract target just because the reference page appears to use one. Prefer Flap SDK methods and on-chain reads against runtime token/Vault/factory addresses. If a special non-oracle endpoint is truly required, declare it in the manifest for Flap review as a single absolute HTTPS URL string without username/password credentials or an array of those strings; direct `fetch(...)` must use a static absolute HTTPS string covered by that declaration. If a fixed non-token/non-Vault/non-factory contract target is truly required, declare it under `match.bindings[].externalContracts` with `address` and `label`. Oracle usage is reported by `vault:check` and provisioned by the Flap Artifact Workbench/runtime. Declaration does not guarantee approval, and undeclared usage is rejected. Do not replace a copied endpoint with a host-relative, dynamic, HTTP, credentialed, aliased, destructured, or computed browser-global fetch; those are also blocked.

## Screenshot References

When the user provides a screenshot:

- Identify shell-owned elements versus Vault-owned elements.
- Keep shell-owned pieces out of `src/vaults/{folder-name}/Component.tsx`.
- Extract reusable layout rules: width, spacing, card hierarchy, status placement, button grouping.
- Add missing states to the implementation when the screenshot implies them, such as invalid token, unavailable oracle, no wallet, no owned NFT, no claimable balance, or paused flow.

## Existing Code References

When reading existing Flap code:

- Use it to understand behavior, section order, state handling, and interaction flow.
- Prefer equivalent SDK methods and template UI primitives.
- Do not import from the private frontend repo.
- Do not copy private constants, exact oracle URLs, private addresses, or unreleased business logic.
- Do not copy reference endpoint URLs or fixed extra contract addresses into the template. Re-declare only reviewed endpoint or external-contract intent when the new Vault truly needs it.
- Keep Vault ABI fragments minimal and local to `src/vaults/{folder-name}/VaultABI.ts`.
- Use `erc20Abi` from `@/src/sdk` for standard ERC20 reads/approvals. Add token ABI fragments only for custom non-standard token methods.

## Reference Notes

Implementation notes should state the selected pattern, references inspected, what was reused conceptually, and any unresolved assumptions. Keep those notes outside the Vault package unless the user explicitly asks for a separate document.
