# Safety Boundaries

Custom Vault UI is controlled business UI, not an arbitrary app surface.

## Blocking

- Direct wallet API access.
- Hidden transaction target.
- Hardcoded EVM addresses in Vault source.
- Undeclared endpoint, image URL, IPFS gateway, or other external resource.
- Host-relative endpoint calls such as `fetch("/api/...")`.
- Embedded data URL media.
- Runtime remote import.
- iframe or script injection.
- Unapproved dependencies.
- Additional SDK packages or SDK-like wrappers beyond the shared `@/src/sdk` and `@/src/ui` surfaces.
- Missing i18n.
- Remote image inside Vault source.
- Arbitrary external navigation or hardcoded off-site jumps that are not the current chain explorer.
- Contract reads/writes to unrelated contracts such as routers, bridges, aggregators, or other app contracts outside the Vault/token/NFT boundary.
- Binding by unreliable type fields.
- Reimplementing Flap host preflight for taxinfo/feeinfo type mapping, fee mode detection, or deployment binding inside a submitted Vault component.
- Extra files, folders, local utility modules, or local component modules inside the Vault package.
- Local relative imports other than `./VaultABI`.

## Allowed

- Local React state.
- Small pure functions inside `Component.tsx`.
- Local small components inside `Component.tsx`.
- Flap SDK contract reads/writes.
- Reading Flap-provided `context.host` values for token info, parsed tax info, VaultPortal info, fee mode, render surface, and registry-selected Vault type.
- `sdk.readOracle(...)` only when the Flap Artifact Workbench/runtime can review and provision the oracle id.
- SDK contract writes using runtime context addresses such as `context.vaultAddress` and `context.tokenAddress`, plus token/NFT addresses derived from runtime context or Vault reads.
- Explorer links through `context.explorerBaseUrl`, `AddressLink`, or `sdk.openExplorerTx(...)`.
- Token logo and NFT media only through Flap-controlled host/runtime media policy.

Declared non-oracle endpoints are review candidates, not automatic approvals. Avoid them by default. If a special non-oracle endpoint is unavoidable, it must be declared in the manifest and reviewed by Flap before publish. Oracle usage is detected by `vault:check` and provisioned outside the manifest. Anything not declared or provisioned is rejected.
Endpoint declarations must be a single HTTPS URL string or an array of HTTPS URL strings.
If an NFT metadata base URL or another reviewed non-oracle host must be fetched directly, declare that base URL in `manifest.endpoints` and keep the use to data fetches only. Do not turn declared endpoints into user-facing off-site navigation. Internal Oracle endpoints should normally arrive through `sdk.readOracle(...)`; if review needs a raw URL exception, allowlist it out of band for checker/runtime review rather than hardcoding private host policy into the public template.

## Media

Default: no custom third-party images or external media resources.

Allowed only through Flap-controlled runtime/media policy:

- token logo from Flap metadata
- NFT metadata image through approved media handling
- Flap official static asset
- reviewed IPFS/gateway resource
