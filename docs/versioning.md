# Versioning

This template has four compatibility surfaces:

1. `agent-contract.json` for AI agent workflow and machine-readable rules.
2. `schemas/manifest.schema.json` for developer manifest validation.
3. `flap-vault-package.json` package format for Flap Artifact Workbench intake.
4. `dist/vault-runtime/runtime-contract.json` for the shared runtime package extraction contract.

## Agent Contract Version

Increment `agent-contract.json.version` when an Agent must change behavior to keep generating valid packages.

Examples:

- New required command in the done criteria.
- New required input field.
- New blocking package rule.
- Changed folder name, `artifactId`, preview registration, or action-stage workflow.

Do not increment it for copy-only docs edits or non-breaking extra examples.

## Manifest Schema

The manifest schema is developer-facing. Add fields only when they are safe for public package authors to declare.

Rules:

- Keep `additionalProperties: false`.
- Keep runtime-only fields out of the schema.
- Keep oracle, media, action registry, and runtime version policy out of developer manifests unless Flap intentionally changes the product boundary.
- If a new field is required, update `vault:scaffold`, `vault:check`, `agent-contract.json`, and docs in the same change.

## Package Format Version

Increment `PACKAGE_FORMAT_VERSION` in `scripts/vault-package.mjs` and `scripts/vault-verify-package.mjs` when the zip acceptance contract changes.

Examples:

- Marker file shape changes.
- Required packaged files change.
- Hash policy changes.
- Package kind changes.
- Workbench needs a new required metadata field.

The Flap Artifact Workbench should reject unsupported future versions and should explicitly decide whether to keep accepting older versions. Do not silently accept unknown package kinds or unknown format versions.

## Runtime Contract Version

Increment `runtimeContractVersion` in `scripts/build-runtime-package.mjs` when the shared runtime package contract changes in a way Workbench or `flap.sh` must understand.

Examples:

- Runtime package subpath exports change.
- `stableAuthoringAliases` changes.
- `componentFacingEntrypoints` or `hostFacingEntrypoints` changes.
- Required runtime externals change.
- The generated `component.mjs` host/export contract changes.

Do not increment it for internal implementation-only changes that preserve the generated `runtime-contract.json` shape and semantics.

## Validation Rule

Any versioning change should run:

```bash
yarn ci
```

At minimum, run:

```bash
yarn vault:check:selftest
yarn vault:check example
yarn vault:package example
yarn vault:verify-package dist/example.zip
yarn runtime:package
yarn runtime:verify-package
```
