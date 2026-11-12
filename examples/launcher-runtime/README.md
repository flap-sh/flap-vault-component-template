# Pool Launch UI developer guide

[Developer handoff (简体中文)](developer-testnet-onboarding.zh-CN.md) · [简体中文](README.zh-CN.md)

## UI

Pool Launch contracts provide the data for the default UI. At creation, the Portal attempts to read the Launcher's `description()` JSON for the creation event. The Launcher Factory's `launcherDataSchema()` describes its creation inputs. A Vault Factory supplies `vaultDataSchema()` for its configuration, and a Vault supplies `vaultUISchema()` for its user-facing reads and actions. [Build on the Pool Launch protocol](https://docs.utter.cash/en/flap/v2/developers/pool-launch/build-on-pool-launch#2-ui)

A custom Launcher UI can provide creation and detail together, or just the detail page. `LauncherConfig` collects the creation draft for a factory with a supported creation adapter. `Launcher` renders the instance state and can request host review for supported actions when the adapter provides them. A companion Vault UI is a separate component that uses the Vault SDK. The factories remain separate contracts and each artifact has its own binding.

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

For a UI that handles creation, confirm the Launcher Factory, any companion Vault Factory, and the receiving host's supported configuration and actions. The host interprets the draft using the configuration contract for the Launcher Factory. The component receives read-only context, sends structured draft values through `onChange`, and uses the host's metadata upload resource when available.

The detail component reads the host snapshot and calls `host.requestAction` to open review for an available action. The host prepares transactions and verifies receipts. Users confirm transactions in their wallets. A different Launcher mechanism may need different draft fields, state and actions.

`configContract` identifies a Flap host adapter. Its version is independent of the factory's on-chain interface version. The BSC Testnet preview supports the demo Launcher Factory with `crowd-native-create/v1`. Confirm the host's adapter and supported actions with Flap before adding creation or transaction actions for another factory. [Creation and detail demo](testnet-example.md)

### Build a read-only Launcher detail

Use `launcher-detail/v1` to display contract data or redirect to a same-site Mini App. Set `chainId` to `97` for BSC Testnet or `56` for BNB Chain mainnet, and set `factoryAddress` to your deployed Launcher Factory on that chain. In `manifest.json`, use `schemaVersion: 2`, `kind: "launcher-ui"`, `entry: "Component.tsx"`, `configContract: "launcher-detail/v1"` and `surfaces: ["launcher-ui"]`. Export one named `Launcher({ context, messages, host })` function in `Component.tsx`. Put messages in `i18n.json` with matching `en`, `zh` and `ko` keys. [Detail demo source](launcher-detail-demo/)

The optional manifest `reads` object maps up to eight keys to no-argument getters on the Launcher instance. For example, `"reads": { "expectedToken": { "functionName": "expectedToken", "returns": "address" } }` puts the reserved token address in `context.snapshot.expectedToken` when that getter succeeds. Use a lowercase letter at the start of each key and letters or digits after it. Each getter can return a single `address`, `bool` or `uint256`. The host supplies addresses as lowercase strings, booleans as booleans and `uint256` values as decimal strings. A failing getter or zero address yields `null` for that field.

The host verifies the Launcher belongs to the manifest's factory before reading it. The artifact-only preview can open without an instance. Render a fallback when `context.launcherAddress` or `context.snapshot` is `null`. This mode provides `host.available: false` and optional `host.redirect`. Use the creation and detail flow above when the Launcher needs native creation or transaction actions.

The demo displays the amount raised, issuance status and the issued token address from a BSC Testnet Launcher. It also shows how to call `host.redirect` from a button that opens `/apps`. When a project uses the reserved token address for automatic routing, declare the getter the project implements and use the redirect example below.

### Preview a creation form and detail

Use `launcher-config-preview/v1` to deliver a custom creation form and Launcher detail in one ZIP. Follow the detail manifest format and set `configContract: "launcher-config-preview/v1"` and `surfaces: ["launcher-config", "launcher-ui"]`. Use the Flap preview protocol identifier in `configContract`. An on-chain interface version triggers `launcher-runtime/unsupported-config-contract`. Set `factoryAddress` to your deployed Launcher Factory on the selected chain and declare detail `reads` as needed.

Export `LauncherConfig({ context, messages, onChange })` and `Launcher({ context, messages, host })` as named functions in `Component.tsx`. The creation preview supplies `context.previewOnly: true` and discards drafts sent through `onChange`. You can display locked values or demonstrate form interactions. To enable live creation, confirm the host flow with Flap, verify the configuration encoding and factory checks, and simulate the transaction.

Use named React imports and inline JSX styles. Workbench rejects `<style>` tags, `window.location`, `new URL()` and `new Intl.DateTimeFormat()`. Use `host.redirect()` from the detail component for same-site navigation. You can inspect the UI with `artifactPath` alone. To verify automatic redirects, provide a real Launcher from the declared chain and factory and resolve the destination from verified data.

Send Flap the three-file ZIP. Once Flap builds and publishes it in Workbench, the job provides separate creation and detail preview links. [Source checks and ZIP handoff](#check-your-launcher-source)

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

Before creating the ZIP, run the default check on the three source files `Component.tsx`, `manifest.json` and `i18n.json`. Each file can contain up to 256,000 bytes and the three files can contain up to 512,000 bytes total, measured before compression. The command checks manifest structure, TSX syntax, named exports and matching non-empty translation dictionaries for `en`, `zh` and `ko`.

The manifest must use BNB Chain (`56`) or BSC Testnet (`97`) with an adapter supported on that chain. Native adapters require the exact factory address for that adapter and chain. The generic `launcher-detail/v1` adapter accepts your deployed nonzero Launcher Factory address, validates any declared `reads` and expects only `Launcher`.

For `launcher-config-preview/v1`, the checker accepts a custom factory on the same two chains and requires both surfaces, both named exports and valid optional `reads`.

Use `--local` for the separate `launcher-local` source format. Workbench runs its full package and source policy checks during intake, and the host verifies the deployed factory and its compatibility.

## Preview and publish

Every Pool Launch UI submission includes a Launcher. The custom Vault UI is optional.

| Submission | What to send Flap |
| --- | --- |
| Launcher only | ZIP with `Component.tsx`, `manifest.json` and `i18n.json` at its root, plus the chain, Launcher Factory address and test details. |
| Factory pair demo Launcher and Vault UI | One handoff ZIP with both source directories, both testnet factory addresses and the Vault acceptance token. Include an existing verified Vault source package if available. |

For `launcher-detail/v1`, run `yarn launcher:check-source examples/launcher-runtime/launcher-detail-demo` from the template root to check the demo. After checking your own source, run this command from its directory with a new output filename to put the three files at the ZIP root.

```sh
zip -X -j ../launcher-ui.zip Component.tsx manifest.json i18n.json
```

Send the ZIP to Flap for upload, build and publication in Workbench Preview. The main-site detail preview uses `artifactPath` to select the version. Include an existing Launcher address if available so Flap can verify live reads and redirects. On the BSC Testnet preview host, open `/launcher/<launcher-address>?chain=bnb-testnet&kind=launcher-detail&artifactPath=<encoded-artifact-path>` for that same factory. The mainnet chain slug is `bnb`.

Submit any Vault UI that accompanies `launcher-detail/v1` or `launcher-config-preview/v1` through the ordinary Vault UI workflow as a separate source package. Flap prepares the combined source package for the factory pair demo. The factory's contract logic determines whether it deploys a Vault on-chain.

Standalone Mini Apps and ordinary Vault UIs follow their own source-package workflows. [Testnet onboarding (中文)](developer-testnet-onboarding.zh-CN.md) · [Mini App guide](../../docs/from-zero-mini-app.md) · [Vault source packages](../../docs/artifact-intake.md)

Follow the testnet example for the source files, fixture bindings, commands, host props and end-to-end acceptance steps. [BSC Testnet example](testnet-example.md)
