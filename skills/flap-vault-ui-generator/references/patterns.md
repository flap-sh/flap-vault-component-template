# Vault UI Patterns

Pick the closest pattern before coding.

## taxinfo shell / token header frame

Use for every custom Vault preview or submitted Vault component.

Shell-owned behavior:

- Flap header and wallet connect
- token breadcrumb, image, symbol/name, CA, copy, explorer link
- close control
- `Vault Information` heading
- `sm:max-w-[768px]` content width
- invalid token unavailable state
- any standard shared summary/header block already rendered by the host surface
- Portal/helper/VaultPortal reads, registry factory + CA binding, fee mode detection, and render-surface selection exposed through `context.host`

Vault component behavior:

- render only the Vault-specific UI below `Vault Information`
- do not duplicate token header, page shell, navbar, wallet connect, or language provider
- do not add a duplicate top summary/hero block when the host surface already provides one
- do not call private backend APIs or rebuild type / fee-mode mapping; use `context.host`

## schema-driven dashboard

Use for simple read/write method dashboards.

Reference implementation in this template:

- `src/vaults/example`
- `src/vaults/dex-listed-example` for a focused listed-only approve/write flow
- `src/vaults/action-gallery-example` for a richer multi-button action-state gallery

Expected structure:

- summary metrics
- user position
- action panel
- tx status
- fallback/error state

## action availability stage

Use for every custom Vault UI before coding actions.

Pick one:

- `internal-market`: actions work before DEX listing / during pre-listed or bonding-curve trading.
- `dex-listed`: actions require DEX-listed liquidity or listed-only contract state.
- `both`: some actions work before listing and some after listing.
- `read-only`: the Vault has no user write path.

Do not silently hide supported actions. If a stage blocks an action, render the section with a disabled state and clear copy.

Reference implementation in this template:

- `src/vaults/dex-listed-example`
- `src/vaults/action-gallery-example`

## simple reward / claim dashboard

Use for claimable reward, total deposited, and user stats.

Must include:

- `myInfo` or equivalent user read
- claim action
- refetch after claim
- empty claim state

## recipient / distribution dashboard

Use for split recipients, share-based distribution, fund-recipient display, or claim-by-recipient flows.

Must include:

- recipient rows
- allocation / accumulated / claimed values
- current-user claim eligibility when applicable
- read-only fallback when the user is not the recipient
- clear risk / verification notice when recipient routing is externally configured

## oracle-signed action

Use for reserve oracle, price oracle, proof-based action, or signed params.

Avoid this pattern unless on-chain reads or Flap SDK methods cannot satisfy the workflow. Oracle config is not declared in `manifest.json`; `vault:check` reports `sdk.readOracle(...)` usage so the Flap Artifact Workbench/runtime can review and provision the oracle id.

Must include:

- response schema
- signature / expiry
- chain/token/vault/pool binding
- failure behavior
- action disabled state when oracle is unavailable

## NFT dashboard / NFT action

Use for NFT mint/sell/claim/ownership UI.

Must include:

- owned NFT read
- NFT approval flow if needed
- media policy
- approved media handling or no image
- fallback when tokenURI/media fails
- no developer-declared media in manifest; media must use Flap-controlled runtime policy

## submission / gallery flow

Use for text submission, public entries, paginated lists, random item selection, or recent result galleries.

Must include:

- input length validation
- current user status
- pagination or tab state
- empty list state
- submit/write state and refetch after tx

## countdown / game-like flow

Use for epoch, reward window, fast burn, order queue, or delayed reward.

Must include:

- explicit time source
- countdown UI
- action effects
- refetch after tx success

## lending / staking / repay flow

Use for stake/borrow/repay/confirm flows.

Must include:

- paused/inactive state
- user position reads
- min/max validation
- approve where needed
- clear repay/confirm state

## prize / multi-action staking flow

Use for prize pool, winner candidate, timed staking, lock-period reward, or multiple claim paths.

Must include:

- prize pool / round metrics
- countdown or lock window
- separate claim states for each claim path
- zero-prize or no-reward warnings
- stake/unstake availability and refetch after each tx

## bonding curve / dual token action

Use for quote, estimate, mint/sell, or two-token approvals.

Must include:

- quote read
- slippage/estimate display if applicable
- token A/B balance and allowance
- simulate before write
- clear error states
