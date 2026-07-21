# Robinhood Testnet package proof

Robinhood Testnet is accepted as a Vault UI preview and E2E proof chain with:

- chain ID: `46630`
- flap.sh slug: `robinhood-testnet`
- RPC: `https://rpc.testnet.chain.robinhood.com/rpc`
- explorer: `https://explorer.testnet.chain.robinhood.com`
- E2E token policy: `robinhood-testnet`

The local wallet chain selector exposes both Robinhood mainnet and Robinhood Testnet. Both entries use the same `public/robinhood.png` chain logo copied from flap.sh; the Flap application mark in `public/logo.png` is not a chain logo.

Starting with `@flapsdk/vault-runtime@0.1.23`, chain `46630` is a full host-runtime chain: it resolves the Robinhood Testnet explorer and network label, uses the `robinhood-testnet` flap.sh presentation slug, and reads live token lifecycle/tax state through the deployed Portal, tax helper, and VaultPortal contracts. The standard E2E token remains a separate proof requirement and must use one of the deployed Robinhood proof tokens below.

## Standard proof tokens

| Chain | Token type | Address |
| --- | --- | --- |
| Robinhood mainnet `4663` | tax / default Vault UI | `0xdb1b738d084dc482eb94f3697dd452862e6c7777` |
| Robinhood mainnet `4663` | non-tax / Mini App | `0x10b90dd1d5a999c2ff9c034d13be55a7ba788888` |
| Robinhood Testnet `46630` | tax / default Vault UI | `0x15ce0f69e0323aba1de95ff0c53a1a3ccf2d7777` |
| Robinhood Testnet `46630` | non-tax / Mini App | `0xbd2e243911c9cded8b2637f90439cb5777988888` |

Robinhood packages have two valid proof paths:

1. Token scope on Robinhood mainnet (`4663`): declare the real deployed `7777`/`8888` token under `match.bindings[].tokenAddresses`. It is both the runtime binding and the E2E proof token.
2. Robinhood Testnet proof (`46630`): declare a real deployed `7777`/`8888` token on chain `46630`, optionally alongside its real factory or Vault target.

Do not put `0x000...`, a valid-looking placeholder, or a local-only `vault:e2e --token` override into a publishable manifest. If a developer supplies a different token, it must still be a deployed ERC20 on the declared chain and end in `7777` or `8888`.

Example token-scoped shape:

```json
{
  "chainId": 46630,
  "tokenAddresses": ["0x15ce0f69e0323aba1de95ff0c53a1a3ccf2d7777"]
}
```

Use the matching `8888` token instead for Mini App mode.
