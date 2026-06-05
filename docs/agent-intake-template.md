# Agent Intake Template

Use this guide to collect all required inputs from the user before generating a new Vault UI.

Do not begin implementation until every required input is confirmed. Optional inputs should be asked but may be skipped if the user has no preference.

The full input schema is also machine-readable in `agent-contract.json` under `requiredInputs`.

---

## Step 1 — Vault Identity

Ask these in order. Each answer gates the next.

### Q1: Vault folder name

> What should the Vault folder be called?

- Must be 3–64 characters of lowercase kebab-case: letters and numbers separated by single hyphens.
- Valid examples: `my-vault`, `nft-claim-vault`, `prize-pool-v2`
- Invalid: `MyVault`, `my_vault`, `vault`, `a`, spaces, trailing hyphens
- This becomes both `src/vaults/{folder-name}` and the preview route `/{folder-name}`.

### Q2: Human-readable name

> What is the display name for this Vault UI? (shown in the Artifact Workbench)

- Example: `"NFT Claim Vault"`, `"Prize Pool UI"`

---

## Step 2 — Registry Binding

### Q3: Chain IDs

> Which deployment target(s) should this UI declare?

- Example: `56` (BNB Chain mainnet only), `56` and `97` (mainnet + testnet)
- Must be integers.
- Each entry will be paired with a factory address or one Vault address depending on the core binding mode. The same chain can appear more than once when multiple targets share the same UI logic.

### Q4: Binding mode and target addresses

> Is each binding factory-scoped or Vault-scoped without a factory?

- For factory mode, provide one real non-zero factory address per chain.
- For no-factory Vault-scoped mode, omit `factoryAddress` and provide exactly one real non-zero Vault address per chain.
- Example factory binding: chain 56 -> factory `0xAbcMainnet...`.
- Example no-factory binding: chain 56 -> Vault `0xVault...`, optional token `0xToken...`.
- Do not invent fake factory addresses. A zero factory address is invalid; use no-factory mode instead.

### Q5: Vault addresses

> Does any factory-scoped binding also need Vault references?

- Factory mode: usually omit; provide binding-scoped Vault references only for review/deployment context.
- No-factory Vault-scoped mode: required exactly once and already collected in Q4. Token-scoped mode may omit it.
- Store all Vault addresses under `match.bindings[].vaultAddresses`, never as a top-level field.

### Q6: Token address list (optional)

> Does any binding need a reference token CA allowlist for this UI?

- Usually: omit for factory-scoped shared UI unless the binding is intentionally token-specific.
- In no-factory mode, this may contain multiple token addresses when Flap review/runtime supplies that mapping; the core scaffold path still starts from a Vault address.
- Store token addresses under `match.bindings[].tokenAddresses`, never as a top-level field.

---

## Step 3 — Localization

### Q7: Locales

> Which languages should this UI support?

- Options: `en` (English), `zh` (Chinese), or both `[en, zh]`.
- `vault:check` validates exactly the locales you declare. Single-locale Vaults are valid, and every locale string must be at least two characters.

---

## Step 4 — Action Availability Stage

### Q8: Action stage

> When can users interact with this Vault?

| Stage | Meaning |
| --- | --- |
| `internal-market` | Actions available before DEX listing (bonding-curve / pre-listed phase). |
| `dex-listed` | Actions require DEX liquidity or post-listing contract state. |
| `both` | Some actions are available before listing, others after. |
| `read-only` | No user write path. UI shows data only. |

- This must be decided before implementing `Component.tsx`.
- If `dex-listed` or `both`: the UI must show unavailable actions with clear copy when the token is in the wrong phase. Do not silently hide them.

---

## Step 5 — Contract Interface

### Q9: Vault ABI fragments

> What are the Vault contract methods this UI needs to read or write?

- Provide minimal ABI fragments: only the methods the component actually uses.
- Do not include standard ERC20 methods (`balanceOf`, `allowance`, `approve`, etc.); those come from `erc20Abi` in `@/src/sdk`.
- Include custom token methods only if the token has non-standard mechanics.

### Q10: UI workflow

Confirm each:

- **Primary reads**: What vault/token data does the UI display? (e.g., `vaultInfo()`, `myInfoOf(userAddress)`, `balanceOf`)
- **Primary writes**: What actions does the user take? (e.g., `deposit(amount)`, `claim()`, `stake(amount)`)
- **Approval spender**: If a write requires token approval, what is the spender? (Usually `context.vaultAddress`)
- **Native value**: Does any write send native token (BNB/ETH)? If so, which method and how is the amount calculated?
- **Refetch points**: After which transactions should data reload? (Usually: after approve, after each write)

### Q11: Empty and error states

What states must the UI handle explicitly?

- [ ] No wallet connected
- [ ] Wrong chain
- [ ] No user position / no claimable balance
- [ ] Action unavailable for current market phase
- [ ] Oracle/proof unavailable (if oracle flow)
- [ ] Contract paused or inactive
- [ ] Transaction simulation failure
- [ ] Transaction submitted but not confirmed

### Q12: Risk posture

> How should this Vault be presented to users?

| Posture | Use When |
| --- | --- |
| `verified` | Flap-reviewed and confirmed safe. |
| `review-required` | Pending review; functional but not yet verified. |
| `unverified` | Not reviewed; user must acknowledge risk. |
| `high-risk` | Irreversible, dangerous, or AI-generated actions. Show explicit risk gate. |

Also confirm how the UI will render current contract risk status from host `riskLevel`. Every onboarded Vault UI must display `host.vaultInfo?.riskLevel ?? host.taxInfo?.vaultInfo?.riskLevel` in the first or second row of the Vault-specific business UI and show a prominent warning/danger message if that value is unavailable. The UI must not add manual `Low risk` / `低风险` labels; low-risk copy is allowed only when selected from host `riskLevel === 1`.

---

## Step 6 — Oracle and Endpoints (Optional)

### Q13: Oracle usage

> Does this UI need data from an oracle (signed quotes, proofs, reserve prices)?

- If yes, which oracle ID and what response schema is expected?
- Oracle config is not declared in `manifest.json`. `vault:check` will report usage for Flap Artifact Workbench review.
- Oracle unavailable state must be handled in the UI.

### Q14: External endpoints (optional)

> Does this UI need to call any external HTTPS API that is not an oracle?

- Default: no. Prefer Flap SDK methods and on-chain reads.
- If unavoidable: provide either one full HTTPS endpoint URL without username/password credentials or a list of those URLs. These are declared in `manifest.endpoints` and enter Flap review; declaration does not guarantee approval. Any direct `fetch(...)` must use a static absolute HTTPS string covered by that declaration.
- Host-relative URLs (`/api/...`), dynamic fetch targets, credentialed URLs, non-HTTPS, IPFS/Arweave, WebSocket, browser storage/navigation/worker/permission APIs, and direct browser network/media APIs are always blocked.

### Q15: External chart frames (optional)

> Does this UI need to embed a display-only TradingView, DexScreener, or CoinGecko Terminal chart?

- Default: no. Prefer Flap SDK methods, on-chain reads, and `sdk.readOracle(...)` for business data.
- If unavoidable: provide `id`, provider (`tradingview`, `dexscreener`, or `coingecko-terminal`), full static HTTPS `src` with fixed query params, accessibility title, and why the frame is display-only.
- At most one is allowed. It must be declared in `manifest.externalFrames` and rendered through one `ReviewedFrame`; declaration does not guarantee approval. Raw iframe, multiple `ReviewedFrame` instances, `srcDoc`, dynamic `src`, postMessage, wallet/transaction flows, and frame-driven quote/risk/settlement logic are blocked.

### Q16: Fixed external contracts (optional)

> Does this UI need to call a fixed contract address that is not the runtime token, Vault, factory, or binding-scoped token/Vault reference?

- Default: no. Prefer runtime `context.tokenAddress`, `context.vaultAddress`, `context.factoryAddress`, and Vault-derived token/NFT addresses.
- If unavoidable: provide the chain/factory binding, contract address, label, purpose, read/write methods, and fallback behavior. These are declared in `match.bindings[].externalContracts` and enter Flap review; declaration does not guarantee approval.
- Undeclared fixed contract targets are blocking `vault:check` issues.

---

## Step 7 — Preview Addresses (Recommended)

### Q16: Preview addresses

> Do you have real contract addresses for local preview and testing?

- `chainId`: e.g., `56`
- `tokenAddress`: a real token CA on that chain
- `vaultAddress`: the Vault contract address
- `factoryAddress`: the factory contract address, if this UI has a factory

These are used for `yarn dev` preview only and are not packaged. If unavailable, the preview can still render with the template's neutral preview defaults, but real addresses are needed before treating read/write behavior as validated.

---

## Intake Confirmation

Before running `yarn vault:scaffold`, confirm:

| Input | Value |
| --- | --- |
| Folder name | `{folder-name}` |
| Display name | `{name}` |
| Chain / binding targets | `[{chainId: N, factoryAddress: "0x..."}]` or `[{chainId: N, vaultAddresses: ["0x..."], tokenAddresses: ["0x..."]}]` |
| Locales | `{locales}` |
| Action stage | `{actionAvailabilityStage}` |
| Risk posture | `{riskPosture}` |

Once confirmed, run (repeat `--chain` with the matching `--factory` or `--vault` for each deployment target):

```bash
# Single chain
yarn vault:scaffold {folder-name} \
  --name "{name}" \
  --chain 56 --factory 0xMainnetFactory \
  --locales {locales}

# Single Vault without factory
yarn vault:scaffold {folder-name} \
  --name "{name}" \
  --chain 56 --vault 0xVaultAddress --token 0xTokenAddress \
  --locales {locales}

# Mainnet + testnet
yarn vault:scaffold {folder-name} \
  --name "{name}" \
  --chain 56 --factory 0xMainnetFactory \
  --chain 97 --factory 0xTestnetFactory \
  --locales {locales}
```

Then implement `Component.tsx`, `VaultABI.ts`, and `i18n.json` based on the confirmed workflow.
