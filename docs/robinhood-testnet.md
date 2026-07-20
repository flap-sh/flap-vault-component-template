# Robinhood Testnet package proof

Robinhood Testnet is accepted as a Vault UI preview and E2E proof chain with:

- chain ID: `46630`
- RPC: `https://rpc.testnet.chain.robinhood.com/rpc`
- explorer: `https://explorer.testnet.chain.robinhood.com`
- E2E token policy: `robinhood-testnet`

Robinhood packages have two valid proof paths:

1. Token scope on Robinhood mainnet (`4663`): declare the real deployed `7777`/`8888` token under `match.bindings[].tokenAddresses`. It is both the runtime binding and the E2E proof token.
2. Robinhood Testnet proof (`46630`): declare a real deployed `7777`/`8888` token on chain `46630`, optionally alongside its real factory or Vault target.

The standard Robinhood Testnet E2E token address is not assigned yet. Keep it as a tracked open item. Do not put `0x000...`, a valid-looking placeholder, or a local-only `vault:e2e --token` override into a publishable manifest. Until a real address is supplied and ERC20 validation passes, `vault:check`, package proof, and Workbench intake remain blocked by design.

Example token-scoped shape after the real token is known:

```json
{
  "chainId": 46630,
  "tokenAddresses": ["0xRealDeployedTokenEnding7777Or8888"]
}
```

The example value is intentionally non-runnable documentation text. Replace it with the real deployed address before scaffold, check, E2E, or upload.
