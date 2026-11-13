# Pool Launch UI developer guide

[Developer handoff (简体中文)](developer-testnet-onboarding.zh-CN.md) · [简体中文](README.zh-CN.md)

## Choose a creation flow

Decide where users will participate and who creates the Launcher.

| Integration | What to build |
| --- | --- |
| **Standalone Mini App v2** | Implement the applicable creation, participation, claim, and refund flows at `/apps/<slug>` or an app subroute. To accept traffic from Flap Launch Pages, shared links, or other Launcher entries, also submit a lightweight `Launcher` detail component. It can display launch status or automatically redirect once it resolves the project in the Mini App. Users complete the actions in the app. [Mini App guide](../../docs/from-zero-mini-app.md) · [Automatic redirect](#redirect-from-launcher-details) |
| **Reusable Launcher Factory for users** | If users will enter the factory address on Flap to configure and create their own Launchers, build `LauncherConfig` and `Launcher`. The creation component handles inputs, review, and confirmation. The detail component shows progress and issuance and provides the participation actions supported by the contract. Add a companion Vault UI if the token needs a custom Vault panel for revenue, claims, or other Vault operations. [Creation and detail](#preview-a-creation-form-and-detail) · [Vault UI](#develop-a-vault-ui) |
| **One-off Launcher created by the project** | Use the project's authorized wallet to run a script that encodes the factory configuration and calls `Portal.newLauncher` on testnet. The user-facing entry only needs the `Launcher` detail component. Implement participation or minting, post-launch claims, and refunds as supported by the deployed contract. If an existing Mini App handles these actions, the detail component can send users there. [Detail integration](#build-a-read-only-launcher-detail) · [Test detail actions](#test-creation-and-participation-with-a-wallet) |

A Vault UI renders Vault data and operations on the token's tax-info page. Use the Vault UI workflow when building just that panel. Package the Mini App and its optional Launcher entry separately. Test transactions initiated from Launcher pages in a BSC Testnet Preview that supports the wallet bridge.

After creating a Launcher by script, share the chain, Launcher Factory address, and real testnet Launcher address with Flap so it can verify detail, redirects, and participation.

## UI

Pool Launch contracts provide the data for the default UI. At creation, the Portal attempts to read the Launcher's `description()` JSON for the creation event. The Launcher Factory's `launcherDataSchema()` describes its creation inputs. A Vault Factory supplies `vaultDataSchema()` for its configuration, and a Vault supplies `vaultUISchema()` for its user-facing reads and actions. [Build on the Pool Launch protocol](https://docs.utter.cash/en/flap/v2/developers/pool-launch/build-on-pool-launch#2-ui)

A custom Launcher UI can provide creation and detail together, or just the detail page. `LauncherConfig` renders the project's creation form and review. `Launcher` renders the instance state. A companion Vault UI is a separate component that uses the Vault SDK. The factories remain separate contracts and each artifact has its own binding.

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

For a custom creation form, confirm the Launcher Factory and any companion Vault Factory. Implement the form and review inside your component. The paired testnet demo uses the `crowd-native-create/v1` adapter with its own metadata upload and transaction preparation flow.

The paired demo's detail component reads the host snapshot and calls `host.requestAction` for a supported action. The adapter prepares transactions and verifies receipts. Users confirm transactions in their wallets.

`configContract` identifies the Flap integration protocol. Its version is independent of the factory's on-chain interface version. [Paired creation and detail demo](testnet-example.md)

### Build a read-only Launcher detail

Use `launcher-detail/v1` to display contract data or redirect to a same-site Mini App. Set `chainId` to `97` for BSC Testnet or `56` for BNB Chain mainnet, and set `factoryAddress` to your deployed Launcher Factory on that chain. In `manifest.json`, use `schemaVersion: 2`, `kind: "launcher-ui"`, `entry: "Component.tsx"`, `configContract: "launcher-detail/v1"` and `surfaces: ["launcher-ui"]`. Export one named `Launcher({ context, messages, host })` function in `Component.tsx`. Put messages in `i18n.json` with matching `en`, `zh` and `ko` keys. [Detail demo source](launcher-detail-demo/)

The optional manifest `reads` object maps up to eight keys to no-argument getters on the Launcher instance. For example, `"reads": { "expectedToken": { "functionName": "expectedToken", "returns": "address" } }` puts the reserved token address in `context.snapshot.expectedToken` when that getter succeeds. Use a lowercase letter at the start of each key and letters or digits after it. Each getter can return a single `address`, `bool` or `uint256`. The host supplies addresses as lowercase strings, booleans as booleans and `uint256` values as decimal strings. A failing getter or zero address yields `null` for that field.

The host verifies the Launcher belongs to the manifest's factory before reading it. The artifact-only preview can open without an instance. Render a fallback when `context.launcherAddress` or `context.snapshot` is `null`. With no transaction declaration, the detail provides `host.available: false` and optional `host.redirect`.

The demo displays the amount raised, issuance status and the issued token address from a BSC Testnet Launcher. It also shows how to call `host.redirect` from a button that opens `/apps`. When a project uses the reserved token address for automatic routing, declare the getter the project implements and use the redirect example below.

### Preview a creation form and detail

Use `launcher-config-preview/v1` to deliver a custom creation form and Launcher detail in one ZIP. Follow the detail manifest format and set `configContract: "launcher-config-preview/v1"` and `surfaces: ["launcher-config", "launcher-ui"]`. Use the Flap preview protocol identifier in `configContract`. An on-chain interface version triggers `launcher-runtime/unsupported-config-contract`. Set `factoryAddress` to your deployed Launcher Factory on the selected chain and declare detail `reads` as needed.

Export `LauncherConfig({ context, messages, host })` and `Launcher({ context, messages, host })` as named functions in `Component.tsx`. At `/create/launcher`, the Flap host renders `LauncherConfig` and supplies read-only context. `context.previewOnly` is true for a published artifact preview and false for a registered factory. Implement the **Review creation** button and review screen in your component. The host provides a no-op `onChange` callback for compatibility with existing packages.

For a project with a deployed Mini App, call the optional `host?.redirect?.("/apps/<app-slug>/create")` from your continuation button after review. Use the project's actual same-site route. Browser Back returns to the Launcher creation page after this button-driven handoff. A `true` return means the host accepted the navigation. Show a fallback when the callback is absent or returns `false`. In the Mini App, implement your factory's validation, configuration encoding, transaction review and receipt handling. Use the Mini App wallet SDK for wallet connection and transaction submission. [Mini App developer guide](../../docs/from-zero-mini-app.md)

Use named React imports and inline JSX styles. Workbench rejects `<style>` tags, `window.location`, `new URL()` and `new Intl.DateTimeFormat()`. Both components can use `host.redirect()` for same-site navigation. You can inspect the UI with `artifactPath` alone. To verify automatic detail redirects, provide a real Launcher from the declared chain and factory and resolve the destination from verified data.

Send Flap the three-file ZIP. Once Flap builds and publishes it in Workbench, the job provides separate creation and detail preview links. [Source checks and ZIP handoff](#check-your-launcher-source)

### Test creation and participation with a wallet

The generic wallet bridge is available for approved artifacts on the Flap BSC Testnet Preview. Connect a wallet on chain `97` before confirming a transaction. Your components own the buttons, input validation, review and transaction states. Use the host's wallet bridge for signing and submission. Direct browser or wallet provider access is blocked.

Packages that use `transactions` or an account-scoped read (`reads.*.account: true`) require a Workbench Preview that accepts those declarations and a Flap Preview with the wallet bridge enabled. An older Workbench may return `launcher-runtime/manifest`. Retry the same ZIP on the updated Workbench Preview with its manifest declarations intact.

Declare the operations supported by the deployed contracts. A detail-only `launcher-detail/v1` package declares only `transactions.actions`, for example when the project creates the Launcher by script and the detail component handles participation. The following manifest fragment enables transactions on both surfaces.

```json
{
  "transactions": {
    "create": true,
    "actions": {
      "contribute": "payable",
      "claim": "nonpayable"
    }
  },
  "reads": {
    "shares": { "functionName": "shares", "returns": "uint256", "account": true }
  }
}
```

- `create: true` enables creation helpers on `launcher-config-preview/v1`. Use `host.quote()` to read the factory's creation fee and `host.findSalt()` if your configuration uses a salt for a tax token address. Use `host.encode` with your factory's actual ABI parameter definitions and values, including tuple components where needed. From the user's confirmation click, call `host.submit({ kind: "create", configuration, valueWei })`. The host wraps the encoded configuration in the Portal call for the manifest's factory.
- `actions` supports up to eight exact zero-argument method names on a verified Launcher instance. Declare each as `payable` or `nonpayable` to match the deployed contract. From the user's confirmation click, call `host.submit({ kind: "action", action, valueWei })` with a declared method name. Amounts are in wei. Omit `valueWei` when sending no native currency.
- `account: true` declares a getter with one `address` input. The host supplies the connected wallet address. Read the result from `context.snapshot`. Account reads are `null` when the wallet is disconnected or the read fails. A transaction-enabled manifest can declare up to sixteen reads.

The submission returns a transaction hash and a status of `success`, `pending`, `reverted` or `unverified`. Keep the hash and use `host.checkReceipt(hash)` to recheck a pending or unverified result. After creation succeeds with a verified `launcherAddress`, use `host.openLauncher(launcherAddress)`. Test participation on a detail page opened with a real testnet Launcher address from the declared factory. [Testnet wallet example source](green-presale-launcher/)

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

For `launcher-config-preview/v1`, the checker accepts a custom factory on the same two chains and requires both surfaces, both named exports and valid optional `reads` and `transactions`. A package that omits `transactions` retains read-only behavior.

Use `--local` for the separate `launcher-local` source format. Workbench runs its full package and source policy checks during intake, and the host verifies the deployed factory and its compatibility.

## Preview and publish

Every Launcher UI handoff includes a Launcher component. A companion custom Vault UI is optional. A standalone Mini App uses its own handoff.

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
