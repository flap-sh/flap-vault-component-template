# Shared CopyButton

Vault UI and Mini App v2 share one host-owned copy component. Import it from the public UI barrel; copying requires neither a wallet connection nor a selected chain.

```tsx
import { CopyButton } from "@/src/ui";

<CopyButton value={tokenAddress} />
<CopyButton value={tokenAddress} label={i18n.t("copyAddress")} />
<CopyButton value={skillsMarkdown} label={i18n.t("copySkills")} />
```

`value` is copied exactly as supplied, including spaces and line breaks. Empty/whitespace-only values, NUL characters and values longer than 1,048,576 UTF-16 code units (`value.length` in JavaScript) are disabled. `label` is optional localized visible text; without it the button is icon-only. `disabled` and `className` are also supported. There are no custom event handlers, refs, children or imperative clipboard methods. Spaces and line breaks count toward the limit; emoji may use more than one code unit. Long Markdown such as `skills.md` is copied in full without truncation. For addresses, keep the full address visibly readable next to the button.

A real mouse, touch or keyboard click triggers the action. Synthetic/programmatic clicks do nothing. The shared runtime writes to the clipboard, uses a temporary selection fallback when necessary (inside the active fullscreen element), restores focus/selection, and reports success only after copying succeeds. Pending clicks are deduplicated. Failures retain the manual select-and-copy path. No clipboard read is exposed.

Default labels, feedback and accessibility announcements follow the host locale in English, Chinese and Korean. Apps can override `flap.copy.copy`, `flap.copy.copying`, `flap.copy.copied`, `flap.copy.failed` in their i18n.json. This component consumes the same Vault/App providers as the existing shared UI hooks; do not create a second provider.

Direct `navigator.clipboard`, `ClipboardItem` and `document.execCommand("copy")` calls in artifact source remain blocked. A manifest endpoint or permission declaration is not needed for CopyButton.

## Coordinated rollout

`@flapsdk/vault-runtime@0.1.40-next.0` is published on npm `next` (2026-10-23), with npm `gitHead` `0d21863aa19bde5ad6712d760d3badea6a28e3a4`. It raises the shared Vault UI / Mini App v2 CopyButton limit to 1,048,576 UTF-16 code units. The main host and testing Workbench pin this exact package in `package.json` and `yarn.lock`; Workbench also records this identity in its validation contract. Deploy both updated consumers before accepting newly packaged copy-capable apps. Existing built artifacts continue to load. Workbench records `requiredUiExports` in new artifact metadata so an older host reports a missing runtime component before rendering. npm `latest` remains `0.1.37`; this release does not change the stable channel.

Run `yarn test:copy-button`, `yarn test:copy-button-policy`, the checker regressions and runtime package verification in the template. Each consumer also has `yarn test:copy-button` to verify its installed package and shared provider. A private local canary is suitable for joint tests, never for uploaded source ZIP provenance. Developers should update the official template/runtime and regenerate check, E2E and package proofs after the coordinated release.

The planned shared stable replacement is **`0.1.38` on latest, not yet published**. After release, historical next versions will be deprecated with downloads retained. For source checkout, host upgrade steps and current ZIP readiness, see [main integration status](main-migration.md).
