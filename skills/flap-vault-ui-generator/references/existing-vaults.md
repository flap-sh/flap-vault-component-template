# Existing Vault UI Pattern Reference

This file maps known Vault UI workflow categories to the closest public-safe implementation patterns in this template.

Use it to select the right starting point from `docs/ui-pattern-snippets.md` when a user describes an existing Vault or provides a reference.

Do not store or publish private repository paths, private component names, factory addresses, private constants, or copied private source code in this file.

---

## How To Use This File

1. Identify the user's Vault category from the table below.
2. Find the matching pattern in `docs/ui-pattern-snippets.md`.
3. Read `skills/flap-vault-ui-generator/references/patterns.md` for additional implementation requirements per pattern. Use `src/vaults/example` for reward/oracle structure, `src/vaults/dex-listed-example` for listed-only approve/write structure, and `src/vaults/action-gallery-example` for multi-button action-state structure.
4. If the user provides a screenshot, URL, or live page reference, also read `skills/flap-vault-ui-generator/references/reference-workflow.md`.

---

## Pattern Selection Table

| User Describes | Closest Template Pattern | Key Implementation Requirements |
| --- | --- | --- |
| Read-only status display, informational Vault, no user writes | Dashboard frame + Read loader + Empty/error states | No TxButton; read-only copy; clear "no action available" state |
| Claimable reward, dividend, yield, single-action withdraw | Claim-only reward panel | hasClaimable guard; empty claim state; loadData refetch after claim |
| Deposit/stake/buy with token approval, then write | Approve then write flow | needsApproval derived state; approve → wait → refetch → simulate → write → wait → refetch |
| Sell, repay, swap, or percentage-based input | Quote and percentage panel | Quick-percent buttons; quote read; balance display; quoteError state |
| Buy and sell between two tokens, LP reward, bonding curve | Dual-token action panel | mode state (buy/sell); separate allowance per token; quote for each direction |
| NFT mint, voucher, owned item, sell-to-vault, return | NFT or inventory panel | Owned ID read; no developer-declared media; media via Flap runtime policy |
| Split recipients, fund routing, share-based distribution | Distribution or recipient panel | Recipient rows; accumulated/claimed values; current-user eligibility check |
| Stake collateral, borrow, confirm off-chain action, repay | Lending or staged confirmation flow | paused/inactive state; position reads; approve-then-stake; confirm state; repay path |
| Epoch, reward window, time-locked action, delayed settlement | Countdown or delayed action | actionOpensAt / actionEndsAt from contract; disabled state while not open |
| Prize pool, ranked candidates, timed staking, lock period | Prize or staking panel | prizePool metrics; lock/unlock countdown; separate claim states per path |
| Text submission, social feed, public entries, gallery | Submission and gallery panel | input length validation; paginated/tabbed list; empty list state; refetch after tx |
| Signed quote, reserve oracle, proof-based action | Oracle-signed or proof-based action | proofExpired guard; refreshProof flow; disabled when unavailable |
| Generated read/write method dashboard, dynamic ABI | Schema method dashboard + Dangerous write gate | read/write separation; countdown gate before dangerous writes |
| Unknown, fallback, unverified, or high-risk Vault | Risk and verification banner + Dangerous write gate | visible risk banner near top; expand + countdown before revealing write methods |
| Vault with both pre-listing and post-listing actions | Dashboard frame + Action availability stage pattern | Both stage gates; statusBadge for current phase; clear copy for unavailable stage |

---

## Built-In Public Fixtures

- `src/vaults/example`: reward/oracle pattern with approve, simulate, write, claim, and refetch.
- `src/vaults/dex-listed-example`: listed-only action gate using `context.host.marketPhase`, with approve -> write after listing.
- `src/vaults/action-gallery-example`: multi-action gallery with internal-market, DEX-listed, both-stage, and read-only controls.

All fixtures use placeholder factory addresses and must not be described as endorsements of any Store factory, token, Vault, or project. For local testing with a real reviewed factory, pass it through preview URL params instead of committing it into this public reference file.

---

## Shell vs Vault Component Boundary

The template preview shell owns the following. Do not reimplement these inside `Component.tsx`:

- Token breadcrumb, image, name, symbol, CA, copy button, explorer link
- Close control
- "Vault Information" heading
- Wallet connect and account modal
- Chain selector
- Language selector
- Invalid / unavailable token page state
- `sm:max-w-[768px]` content width constraint
- Any standard shared summary/header block already rendered by the host surface
- Portal/helper/VaultPortal reads, registry factory + CA binding, fee mode detection, and render-surface selection

Vault components render only the business UI below "Vault Information". Do not treat a component-owned top summary banner as the default; add one only when the target host surface truly lacks a shared summary/header block.

---

## Action Availability Stage Checklist

For every Vault with write actions, confirm the stage before coding:

| Stage | Token must be | Show action before listing? | Show action after listing? |
| --- | --- | --- | --- |
| `internal-market` | Pre-listed | Yes — enabled | Yes — disabled with clear copy |
| `dex-listed` | DEX-listed | Yes — disabled with clear copy | Yes — enabled |
| `both` | Either | Stage-dependent | Stage-dependent |
| `read-only` | Either | N/A | N/A |

Never silently hide a supported action. Render it with a disabled state and copy explaining the condition.

---

## Common Patterns For Private Reference Extraction

When the user provides access to a private Flap frontend checkout or a specific reference implementation, extract only:

- Section order and card hierarchy
- State transitions (idle → approving → writing → confirming → done / failed)
- Empty and error state placement
- Which context values drive which UI elements
- Action gating conditions

Do not extract or copy:

- Private component names, file paths, or import paths
- Internal factory addresses, token addresses, fixed extra contract addresses, or endpoint URLs
- Private business constants or unreleased mechanics
- Private oracle IDs or backend API shapes

Rebuild the behavior using this template's SDK and UI primitives. Record the selected pattern and reference category in your implementation notes or PR description.
