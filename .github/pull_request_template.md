## Summary

Describe the Vault UI, target project, and user workflow.

## Binding Intent

- match.bindings:
- vaultAddresses (required exactly once for no-factory mode; optional reference list for factory mode):
- tokenAddresses (optional per-binding list; preview/runtime uses it for binding matching when present):
- enforced CA policy: configured in flap.sh registry rules, not in this UI manifest

## Contracts and Actions

- contracts:
- read methods:
- write methods:
- approve spender:
- native value:

## Oracle / Endpoint Policy

- default: avoid external endpoints/resources
- endpoints:
- external media/resources:
- response schema:
- signature / expiry:
- failure behavior:
- review note: declared endpoints/resources require Flap review and approval before publish; undeclared endpoints/resources are rejected

## Validation

- [ ] `yarn vault:check <folder-name>`
- [ ] `yarn vault:package <folder-name>`
- [ ] `yarn vault:verify-package dist/<folder-name>.zip`
- [ ] `yarn ci` for repo-level changes when live BNB smoke access is available
- [ ] If `yarn ci` was skipped or failed only because live BNB/RPC access was unavailable: document that and run the equivalent local validation minus `yarn preview:smoke:real`
- [ ] local preview checked
- [ ] mobile preview checked

## Notes

Call out assumptions, missing inputs, and fallback behavior.
