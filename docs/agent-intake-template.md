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

- Complete factory-scoped example: `97` for the testnet proof token plus `56` for the final mainnet factory binding.
- Single-chain examples: `56` only for mainnet-only Vault-scoped UI, or `97` only for testnet-only development that will not publish to mainnet yet.
- Must be integers.
- Each entry will be paired with a factory address or one Vault address depending on the core binding mode. Include a real deployed `7777`-suffix test token, plus the final real mainnet factory binding when mainnet launch is planned.

### Q4: Binding mode and target addresses

> Is each binding factory-scoped or Vault-scoped without a factory?

- For factory mode, provide one real non-zero factory address per chain. If mainnet launch is planned, collect the final real mainnet factory address now so the production binding does not need repeated edits.
- For no-factory Vault-scoped mode, omit `factoryAddress` and provide exactly one real non-zero Vault address per chain.
- Complete factory binding set: chain 97 -> testnet factory + real `7777`-suffix test token for package proof, and chain 56 -> final mainnet factory with no production CA restriction implied.
- Example no-factory binding: chain 56 -> Vault `0xVault...`, test token `0xToken...`.
- Do not invent fake factory addresses. A zero factory address is invalid; use no-factory mode instead.
- Every manifest must include at least one binding-scoped `tokenAddresses` entry for Workbench/E2E testing. It must be a real deployed ERC20 address ending in `7777`.

### Q5: Vault addresses

> Does any factory-scoped binding also need Vault references?

- Factory mode: usually omit; provide binding-scoped Vault references only for review/deployment context.
- No-factory Vault-scoped mode: required exactly once and already collected in Q4. Token-scoped mode may omit it.
- Store all Vault addresses under `match.bindings[].vaultAddresses`, never as a top-level field.

### Q6: Production CA restriction mode

> Should production routing restrict this UI to specific token CAs?

| Mode | Meaning | Where it is configured |
| --- | --- | --- |
| `none` | Production does not restrict CA; route by factory or Vault. A test token is still required for package proof. | Workbench/registry records `none`; manifest keeps only test token(s). |
| `reserved` | A future CA is locked early but not verified. It must not publish or route yet. | Workbench/registry reservation only. |
| `verified` | CA is deployed, ERC20 validation passes, and factory/Vault/token relationship is verified. | Workbench/registry production binding only. |

- Do not add `restrictTokenAddresses`, `caPolicy`, or global `tokenAddresses` to `manifest.json`.
- In factory mode, `match.bindings[].tokenAddresses` is a manifest test-token source, not the production CA restriction.

### Q7: Test token addresses

> Which real ERC20 token(s) should package checks and E2E use?

- Use a real deployed `7777`-suffix test token and place that binding first when using `vault:scaffold`.
- Store test tokens under `match.bindings[].tokenAddresses`, never as a top-level field.
- If `caRestrictionMode` is `none`, this test token still exists and still does not restrict production CA.
- If production CA restriction is `verified`, collect `productionRestrictedTokenAddresses` for Workbench/registry separately; do not use manifest fields for that production policy.

---

## Step 3 — Localization

### Q8: Locales

> Which languages should this UI support?

- Options: `en` (English), `zh` (Chinese), or both `[en, zh]`.
- `vault:check` validates exactly the locales you declare. Single-locale Vaults are valid, and every locale string must be at least two characters.

---

## Step 4 — Action Availability Stage

### Q9: Action stage

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

### Q10: Vault ABI fragments

> What are the Vault contract methods this UI needs to read or write?

- Provide minimal ABI fragments: only the methods the component actually uses.
- Do not include standard ERC20 methods (`balanceOf`, `allowance`, `approve`, etc.); those come from `erc20Abi` in `@/src/sdk`.
- Include custom token methods only if the token has non-standard mechanics.

### Q11: UI workflow

Confirm each:

- **Primary reads**: What vault/token data does the UI display? (e.g., `vaultInfo()`, `myInfoOf(userAddress)`, `balanceOf`)
- **Primary writes**: What actions does the user take? (e.g., `deposit(amount)`, `claim()`, `stake(amount)`)
- **Approval spender**: If a write requires token approval, what is the spender? (Usually `context.vaultAddress`)
- **Native value**: Does any write send native token (BNB/ETH)? If so, which method and how is the amount calculated?
- **Refetch points**: After which transactions should data reload? (Usually: after approve, after each write)

### Q12: Empty and error states

What states must the UI handle explicitly?

- [ ] No wallet connected
- [ ] Wrong chain
- [ ] No user position / no claimable balance
- [ ] Action unavailable for current market phase
- [ ] Oracle/proof unavailable (if oracle flow)
- [ ] Contract paused or inactive
- [ ] Transaction simulation failure
- [ ] Transaction submitted but not confirmed

### Q13: Risk posture

> How should this Vault be presented to users?

| Posture | Use When |
| --- | --- |
| `verified` | Flap-reviewed and confirmed safe. |
| `review-required` | Pending review; functional but not yet verified. |
| `unverified` | Not reviewed; user must acknowledge risk. |
| `high-risk` | Irreversible, dangerous, or AI-generated actions. Show explicit risk gate. |

Also confirm how the UI will render current contract risk status from host `riskLevel`. Every onboarded Vault UI must display `host.vaultInfo?.riskLevel ?? host.taxInfo?.vaultInfo?.riskLevel` within the first three visible Vault-specific business rows/blocks and before any preview, hero, banner, showcase, media, chart, or large visual block, and show a prominent warning/danger message if that value is unavailable. The UI must not add manual `Low risk` / `低风险` labels; low-risk copy is allowed only when selected from host `riskLevel === 1`.

---

## Step 6 — Oracle and Endpoints (Optional)

### Q14: Oracle usage

> Does this UI need data from an oracle (signed quotes, proofs, reserve prices)?

- If yes, which oracle ID and what response schema is expected?
- Oracle config is not declared in `manifest.json`. `vault:check` will report usage for Flap Artifact Workbench review.
- Oracle unavailable state must be handled in the UI.

### Q15: External endpoints (optional)

> Does this UI need to call any external HTTPS API that is not an oracle?

- Default: no. Prefer Flap SDK methods and on-chain reads.
- If unavoidable: provide either one full HTTPS endpoint URL without username/password credentials or a list of those URLs. These are declared in `manifest.endpoints` and enter Flap review; declaration does not guarantee approval. Any direct `fetch(...)` must use a static absolute HTTPS string covered by that declaration.
- Host-relative URLs (`/api/...`), dynamic fetch targets, credentialed URLs, non-HTTPS, `ipfs://` / gateway image URLs, Arweave, WebSocket, browser storage/navigation/worker/permission APIs, and direct browser network/media APIs are always blocked. Immutable Vault-specific images must use `IpfsImage` with a static image CID instead of an image URL.

### Q16: External chart frames (optional)

> Does this UI need to embed a display-only TradingView, DexScreener, or CoinGecko Terminal chart?

- Default: no. Prefer Flap SDK methods, on-chain reads, and `sdk.readOracle(...)` for business data.
- If unavoidable: provide `id`, provider (`tradingview`, `dexscreener`, or `coingecko-terminal`), full static HTTPS `src` with fixed query params, accessibility title, and why the frame is display-only.
- At most one is allowed. It must be declared in `manifest.externalFrames` and rendered through one `ReviewedFrame`; declaration does not guarantee approval. Raw iframe, multiple `ReviewedFrame` instances, `srcDoc`, dynamic `src`, postMessage, wallet/transaction flows, and frame-driven quote/risk/settlement logic are blocked.

### Q17: Fixed external contracts (optional)

> Does this UI need to call a fixed contract address that is not the runtime token, Vault, factory, or binding-scoped token/Vault reference?

- Default: no. Prefer runtime `context.tokenAddress`, `context.vaultAddress`, `context.factoryAddress`, and Vault-derived token/NFT addresses.
- If unavoidable: provide the chain/factory binding, contract address, label, purpose, read/write methods, and fallback behavior. These are declared in `match.bindings[].externalContracts` and enter Flap review; declaration does not guarantee approval.
- Undeclared fixed contract targets are blocking `vault:check` issues.

---

## Step 7 — Preview Addresses (Recommended)

### Q18: Preview addresses

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
| Chain / binding targets | Complete factory case: `[{chainId: 97, factoryAddress: "0xTestnetFactory", tokenAddresses: ["0xReal7777TestToken"]}, {chainId: 56, factoryAddress: "0xMainnetFactory"}]`; or no-factory: `[{chainId: N, vaultAddresses: ["0x..."], tokenAddresses: ["0x..."]}]` |
| CA restriction mode | `{none | reserved | verified}` |
| Test token addresses | Real deployed `7777`-suffix token(s), stored in `match.bindings[].tokenAddresses` |
| Production factory address | Final real mainnet factory, if mainnet factory-scoped launch is planned |
| Production restricted token addresses | Workbench/registry only when mode is `verified`; never as manifest top-level fields |
| Locales | `{locales}` |
| Action stage | `{actionAvailabilityStage}` |
| Risk posture | `{riskPosture}` |

Once confirmed, run (repeat `--chain` with the matching `--factory` or `--vault` for each deployment target):

```bash
# Complete factory case: testnet token for proof plus final mainnet factory binding
yarn vault:scaffold {folder-name} \
  --name "{name}" \
  --chain 97 --factory 0xTestnetFactory --token 0xReal7777TestToken \
  --chain 56 --factory 0xMainnetFactory \
  --locales {locales}

# Single Vault without factory
yarn vault:scaffold {folder-name} \
  --name "{name}" \
  --chain 56 --vault 0xVaultAddress --token 0xTokenAddress \
  --locales {locales}

# Testnet-only development, not a mainnet-ready manifest
yarn vault:scaffold {folder-name} \
  --name "{name}" \
  --chain 97 --factory 0xTestnetFactory --token 0xReal7777TestToken \
  --locales {locales}
```

Then implement `Component.tsx`, `VaultABI.ts`, and `i18n.json` based on the confirmed workflow.
