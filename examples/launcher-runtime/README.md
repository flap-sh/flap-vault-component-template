# Pool Launch UI developer guide

[简体中文](README.zh-CN.md)

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

Confirm the Launcher Factory, any companion Vault Factory, and the receiving host's supported configuration and actions. The host reviews the factory pair and interprets the draft using a configuration contract that matches the Launcher Factory. The component receives read-only context, sends structured draft values through `onChange`, and uses the host's metadata upload resource when available.

The detail component reads the host snapshot and calls `host.requestAction` to open review for an available action. The host prepares transactions and verifies receipts. Users confirm transactions in their wallets. A different Launcher mechanism may need different draft fields, state and actions.

Self-service custom UI for arbitrary factories is still under development. The example's configuration contract and host adapter support its reviewed factory pair. For another pair, confirm the matching host configuration and action support with the operator.

### Check your Launcher source

From the Template repository root, set `launcher_source_dir` to your source directory and pass it explicitly.

~~~sh
yarn launcher:check-source "$launcher_source_dir"
~~~

This read-only command checks the three source files `Component.tsx`, `manifest.json` and `i18n.json`. It checks the manifest shape, TSX syntax, the named `LauncherConfig` and `Launcher` function exports, and matching non-empty translation dictionaries for `en`, `zh` and `ko`.

The check accepts any project with the required source structure and reports its declared `chainId`, `factoryAddress` and `configContract`. The receiving host and Workbench independently verify the actual factory and its compatibility.

## Preview and publish

Give the operator the Launcher source, the verified Vault source package for a companion Vault, and the reviewed chain and factory addresses. The operator builds the pair in Workbench. Use its versioned preview to test the published Launcher and Vault artifacts on an enabled host. Normal routing uses the authorized factory mappings.

Follow the testnet example for the source files, fixture bindings, commands, host props and end-to-end acceptance steps. [BSC Testnet example](testnet-example.md)
