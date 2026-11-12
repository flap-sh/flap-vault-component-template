# Pool Launch UI developer guide

[Developer handoff (简体中文)](developer-testnet-onboarding.zh-CN.md) · [简体中文](README.zh-CN.md)

## UI

Pool Launch contracts provide the data for the default UI. At creation, the Portal attempts to read the Launcher's `description()` JSON for the creation event. The Launcher Factory's `launcherDataSchema()` describes its creation inputs. A Vault Factory supplies `vaultDataSchema()` for its configuration, and a Vault supplies `vaultUISchema()` for its user-facing reads and actions. [Build on the Pool Launch protocol](https://docs.utter.cash/en/flap/v2/developers/pool-launch/build-on-pool-launch#2-ui)

A custom Launcher UI has two exports. `LauncherConfig` collects the creation draft. `Launcher` renders verified instance state and requests host review for supported actions. A companion Vault UI is a separate component that uses the Vault SDK. The factories remain separate contracts and each artifact has its own binding.

## Develop a Vault UI

Choose a source folder name and set `vault_folder` to that name. For a factory-scoped Vault UI, set `chain_id` and `vault_factory` to the deployed factory's chain and address. Set `test_token` to a real acceptance token on the same chain. The scaffold generates a source folder and registers its local preview. [Vault UI development guide](../../docs/from-zero-vault-ui.md)

~~~sh
yarn vault:scaffold "$vault_folder" \
  --chain "$chain_id" \
  --factory "$vault_factory" \
  --token "$test_token"
~~~

For an existing four-file Vault UI, put `Component.tsx`, `manifest.json`, `VaultABI.ts` and `i18n.json` together under `src/vaults/<folder>`. Run the commands from the Template repository root. Formal validation requires an official stable checkout that satisfies Template freshness and SDK provenance.

~~~sh
yarn vault:register "$vault_folder"
yarn vault:check "$vault_folder"
~~~

The folder argument selects the source to work on. `vault:register` adds its local preview route. `vault:check` validates the source package, including its manifest and declared acceptance token.

For factory-scoped UI, `manifest.json` declares `chainId` and `factoryAddress` in `match.bindings[]`. Keep `VaultABI.ts` aligned with the deployed methods the component uses, and read target addresses from the SDK context. Reusing a component with another factory requires compatible contract methods and business logic. The production artifact mapping is a separate step.

## Integrate a Launcher UI

Confirm the Launcher Factory, any companion Vault Factory, and the receiving host's supported configuration and actions. The host interprets the draft using the configuration contract for the Launcher Factory. The component receives read-only context, sends structured draft values through `onChange`, and uses the host's metadata upload resource when available.

The detail component reads the host snapshot and calls `host.requestAction` to open review for an available action. The host prepares transactions and verifies receipts. Users confirm transactions in their wallets. A different Launcher mechanism may need different draft fields, state and actions.

The current BSC Testnet preview supports the demo Launcher Factory and `crowd-native-create/v1`. For another factory, confirm the host configuration and action support with Flap.

### Redirect from Launcher details

On a compatible host, the `Launcher` detail component can call the optional `host.redirect(path: string): boolean` after resolving a destination from the current Launcher. The host accepts paths on its own origin and replaces the Launcher history entry. A `true` return means it accepted the navigation. Keep the normal detail UI available when the function is absent or returns `false`. The call does not depend on wallet connection or `host.available`, which controls transaction actions.

In this Demo, the Mini App uses `/apps/<app-slug>/mint/<CA>` to open a project using the reserved token address, even before issuance. Replace the app slug, chain ID and factory address with your own values. Use the route and query parameters that your Mini App accepts. Import `useEffect` from React and add the following inside your `Launcher` component.

```tsx
const appSlug = "<app-slug>";
const demoChainId = 97;
const demoFactory = "<factory-address>".toLowerCase();
const redirect = host?.redirect;
const ca = context?.snapshot?.expectedToken?.toLowerCase();
const launcher = context?.launcherAddress?.toLowerCase();
const factory = context?.identity?.factoryAddress?.toLowerCase();
const address = /^0x(?!0{40}$)[0-9a-f]{40}$/;
const path = context?.identity?.chainId === demoChainId
  && factory === demoFactory && address.test(factory)
  && ca && launcher && address.test(ca) && address.test(launcher)
  ? `/apps/${appSlug}/mint/${ca}?mint=${launcher}&factory=${factory}`
  : null;

useEffect(() => {
  if (path) redirect?.(path);
}, [path, redirect]);
```

The host carries the Launcher URL's `ref` and `lang` to the destination and preserves other destination parameters, such as `chain`. It omits `ref` when the Launcher URL has none and uses the current site language when there is no supported `lang`. Supported Launchers use the same detail behavior for links from Launch Pages, creation results, shares and bots.

Browser Back returns to the page before Launcher. Each visit can redirect once. If the destination is another Launcher, it opens its detail directly. To open details explicitly from a destination page, add `view=launcher` to the Launcher URL. Workbench requires no route registration.

The read-only `launcher-local` Demo opens the host's `/apps` directory. Set the destination to your deployed Mini App subroute when integrating it. The paired testnet Demo covers creation and fundraising. [Redirect Demo source](../launcher-local/launcher-redirect-demo/) · [Animated flow](launcher-redirect-demo.svg) · [Local checks and handoff](developer-testnet-onboarding.zh-CN.md#launcher-跳转-demo)

### Check your Launcher source

From the Template repository root, set `launcher_source_dir` to your source directory and pass it explicitly.

~~~sh
yarn launcher:check-source "$launcher_source_dir"
~~~

This read-only command checks the three source files `Component.tsx`, `manifest.json` and `i18n.json`. It checks the manifest shape, TSX syntax, the named `LauncherConfig` and `Launcher` function exports, and matching non-empty translation dictionaries for `en`, `zh` and `ko`.

The check accepts any project with the required source structure and reports its declared `chainId`, `factoryAddress` and `configContract`. The receiving host and Workbench independently verify the actual factory and its compatibility.

## Preview and publish

Every Pool Launch UI submission includes a Launcher. The custom Vault UI is optional.

| Submission | What to send Flap |
| --- | --- |
| Launcher only | ZIP with `Component.tsx`, `manifest.json` and `i18n.json` at its root, plus the testnet Launcher Factory address and test details. |
| Launcher and custom Vault UI | One handoff ZIP with both source directories, both testnet factory addresses and the Vault acceptance token. Include an existing verified Vault source package if available. |

Workbench builds and publishes the Launcher-only artifact for the supported testnet factory. The main-site preview link uses `artifactPath` to select the version. When the handoff includes a custom Vault UI, Flap prepares the combined source package and shares the Launcher preview with the companion Vault artifact. The selected package determines which UIs Workbench builds. The factory's contract logic determines whether it deploys a Vault on-chain.

Standalone Mini Apps and ordinary Vault UIs follow their own source-package workflows. [Testnet onboarding (中文)](developer-testnet-onboarding.zh-CN.md) · [Mini App guide](../../docs/from-zero-mini-app.md) · [Vault source packages](../../docs/artifact-intake.md)

Follow the testnet example for the source files, fixture bindings, commands, host props and end-to-end acceptance steps. [BSC Testnet example](testnet-example.md)
