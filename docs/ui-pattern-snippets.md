# UI Pattern Snippets

Use this file when an Agent needs to match the Flap Vault UI style without copying private Flap frontend code.

These snippets are sanitized implementation patterns. They intentionally omit private project names, component names, factory addresses, token addresses, endpoint URLs, internal file paths, and unreleased business rules.

They are not complete Vault packages. Adapt the snippets inside `src/vaults/{folder-name}/Component.tsx`, keep all visible copy in `i18n.json`, and run `yarn vault:check <folder-name>`.

## Style Baseline

Vault components should feel like compact business panels inside the Flap preview shell:

- Use `w-full space-y-4` as the outer component layout.
- Start at the first Vault-specific business section below the shell-owned `Vault Information` frame.
- Use `VaultBanner` only when the target host surface does not already provide a standard shared summary/header block. Do not treat a component-owned top banner as the default.
- Use the current Flap Vault visual system: dark neutral business surfaces, white low-opacity borders, compact status pills, dense metric strips, and one clear primary action panel.
- Default new UIs should feel closer to a polished embedded tool than to a sample dashboard: one mechanism summary, a small metric grid, one primary action area, and runtime details pushed lower or kept compact.
- The default first screen must be one compact business card, not a stack of dashboard cards. Keep the first card to a mechanism/status header, at most one small metric strip, one primary action panel, and compact runtime facts lower in the card.
- If a Vault needs custom visualization, treat `<canvas>` as a compact chart or diagram area inside a card, not as a page-level whiteboard or shell replacement.
- Use `Card`, `CardHeader`, `CardTitle`, and `CardContent` for major sections, but override density when useful with `rounded-[14px]`, `rounded-[18px]`, `border-white/10`, `bg-black/25`, `bg-white/[0.03]`, and restrained accent borders.
- Use `Metric` for top-level stats and `DetailTile` for compact action/runtime facts; reserve `DataRow` only for rare audit-style logs where row separation is the main value.
- Use `Metric` and `DetailTile` sparingly. Do not turn every contract read into its own large tile; group secondary reads into compact strips or lower runtime detail rows.
- Use `Alert` for notices, warnings, errors, and empty states.
- Use `StatusBadge` for ready, paused, unavailable, and review states.
- Use `TxButton` for approve/write flows with transaction state labels.
- Keep transaction feedback layered: show concise actionable errors inside the current panel, and use transient toast-style notifications for confirmations or lightweight status pings.
- Keep action sections compact and repeatable: input, derived quote, warning/error, primary action, secondary action.
- Prefer CSS/HTML drawing and `lucide-react` icons for visual details. Search the official Lucide icon library first: `https://lucide.dev/icons/` (main site: `https://lucide.dev/`). Use handwritten inline SVG JSX only for small static pure graphic marks with no scripts, events, external URLs, media nodes, `use`, or CSS imports/URL resources.
- Let the preview shell own token header, breadcrumb, close control, `Vault Information` frame, wallet header, language selector, invalid-token page state, page width, and any host-provided shared summary/header block.

Avoid:

- Marketing hero sections, large decorative banners, or sample-dashboard filler.
- Duplicating host-owned intro banners, token summaries, or top hero cards inside `Component.tsx`.
- Treating `example` or `action-gallery-example` as the visual default. They are behavior references; the scaffold default and this document define the preferred default visual direction.
- Row-heavy dashboard layouts with multiple sibling `Card` sections before the primary action. If a generated UI starts with overview cards, dividend cards, staking cards, and action cards, it has copied the old sample-dashboard shape.
- Third-party images or external media. If a Vault-specific immutable image is unavoidable, use `IpfsImage` from `@/src/ui` with a static image CID that `vault:check` can verify.
- Ad hoc SVG when CSS/HTML or a `lucide-react` icon can express the same mark. If inline SVG is necessary, keep it to safe static pure shape nodes and local fragment refs only.
- Turning `<canvas>` into a full-screen whiteboard, background scene, or shell replacement.
- Hardcoded addresses or private endpoints.
- Raw iframe, `srcDoc`, or dynamic chart URLs. If a display-only market chart is approved, use `ReviewedFrame` with a static `manifest.externalFrames` URL only.
- Copying old Flap component names, constants, exact private flows, or legacy row-heavy layouts.

When using an external visual reference such as 涅槃, extract only section hierarchy, density, spacing, and interaction emphasis. Rebuild it with the scaffold default surface and this template's SDK/UI primitives; do not copy private code, private constants, addresses, endpoints, or project-specific assets.

## Coverage Matrix

The public-safe snippets in this document cover the historical custom Vault UI shapes as reusable behavior categories:

| Historical UI Shape | Public-Safe Pattern To Use |
| --- | --- |
| Read-only status or informational Vault | dashboard frame, read loader, runtime details, empty/error states |
| Recipient split, native-token share, or fund-recipient display | distribution / recipient panel |
| External reward, dividend, yield, or withdraw-only Vault | claim-only reward panel |
| Stake, borrow, repay, confirm, or lending-style Vault | lending / staged confirmation flow |
| Buy, sell, quote, swap, burn, or bonding-curve-style Vault | quote and percentage panel, dual-token action panel |
| Dual token, LP reward, or paired token mechanics | dual-token action panel |
| NFT, voucher, owned item, mint, return, or sell-to-vault flow | NFT or inventory panel |
| Epoch, round, countdown, scheduled action, or delayed settlement | countdown or delayed action |
| Text submission, social feed, random item, gallery, or paginated list | submission and gallery panel |
| Relay, prize pool, time-window staking, or multi-action game flow | prize / staking panel, countdown panel |
| Schema-generated read/write dashboard | schema method dashboard, dangerous write gate |
| Oracle, proof, signed quote, or reserve-based action | oracle-signed or proof-based action |
| Unknown, fallback, high-risk, or unverified Vault | risk and verification banner, fallback recipient panel, dangerous write gate |

If a new Vault does not clearly fit one row, combine patterns. For example, a prize Vault can use dashboard frame + countdown + quote panel + claim-only panel.

## Required UI Decisions

Before writing `Component.tsx`, decide and document these in implementation notes, PR text, or the Agent response:

- `selectedPattern`: one or more rows from the coverage matrix.
- `actionAvailabilityStage`: `internal-market`, `dex-listed`, `both`, or `read-only`.
- `primaryReads`: Vault reads and token reads needed for the UI.
- `primaryWrites`: write methods, approval spender, native value requirement, and refetch points.
- `emptyStates`: no wallet, no user position, no claimable balance, unavailable oracle/proof, paused flow.
- `riskPosture`: verified, review-required, unverified, or high-risk.
- `riskStatusHandling`: read current contract risk status from host Vault/TaxInfo context and show a prominent missing-risk warning if unavailable.

Do not hide actions only because the token is not DEX-listed. If the Vault is intended to work before listing, show the controls and disable them only when the contract state or missing inputs make the action unavailable.

## Canvas Surface

Use `<canvas>` only when the Vault needs a custom local visualization that CSS/HTML, shared UI primitives, or safe inline SVG cannot express cleanly.

- Keep canvas inside a standard Vault card or panel below the shell-owned `Vault Information` frame.
- Render host risk status before the canvas block. `vault:check` treats `<canvas>` as a large visual surface.
- Use `useRef<HTMLCanvasElement | null>(null)` plus `canvasRef.current?.getContext("2d")`; do not query the DOM with `document.*`.
- Drive drawing from React state, `@/src/sdk` reads, and `context.host` data only.
- Set explicit `width` and `height` attributes, then use CSS classes for responsive layout.
- Keep visible text, legends, warnings, and action labels in DOM/i18n when practical instead of painting all copy into pixels.
- Avoid workerized canvas, `new Image()`, direct browser network/media APIs, external assets, and whiteboard-style multi-tool editing flows.

Pattern:

```tsx
const canvasRef = useRef<HTMLCanvasElement | null>(null);

useEffect(() => {
  const canvas = canvasRef.current;
  if (!canvas) return;

  const context2d = canvas.getContext("2d");
  if (!context2d) return;

  context2d.clearRect(0, 0, canvas.width, canvas.height);
  // Draw only from local state and SDK/host-derived values.
}, [derivedData]);

return (
  <Card>
    <CardHeader>
      <div className="flex flex-wrap items-center gap-2">
        <CardTitle>{t("sections.visualization")}</CardTitle>
        <StatusBadge tone={riskTone}>{riskLabel}</StatusBadge>
      </div>
    </CardHeader>
    <CardContent className="space-y-3">
      {riskLevel === null ? <Alert tone="danger">{t("risk.missing.description")}</Alert> : null}
      <canvas
        ref={canvasRef}
        width={640}
        height={320}
        className="w-full rounded-[14px] border border-white/10 bg-black/25"
      />
    </CardContent>
  </Card>
);
```

## Action Availability Stage

Use `context.host?.marketPhase` as the runtime source of truth for internal-market vs DEX-listed state. The current template preview panel provides this API for local self-test; production Flap host injects equivalent context. The host derives it from token status: existing tokens with `status < 2` are `internal-market`, existing tokens with `status >= 2` are `dex-listed`, and missing token info is `unknown`. In preview, `tokenAddress` alone is metadata-only; pass `marketPhase`, `isListed`, `status`, or `tokenStatusCode` when action-stage behavior matters.

Reference implementations: `src/vaults/dex-listed-example` shows a focused listed-only action section, while `src/vaults/action-gallery-example` shows multiple internal-market, DEX-listed, both-stage, and read-only controls in one Vault. Use them for behavior and state coverage, not as the default visual style.

Custom Vault actions must state when users can interact:

| Stage | Use When | UI Rule |
| --- | --- | --- |
| `internal-market` | The Vault is usable before DEX listing or during bonding-curve / pre-listed trading. | Show action panels in preview. Disable only for missing wallet, wrong chain, missing quote/proof, paused state, zero amount, or contract-read unavailable state. |
| `dex-listed` | The Vault action requires an external DEX pool, post-listing liquidity, or listed-only mechanics. | Show the action panel with a visible unavailable state before listing; do not silently remove it. |
| `both` | The Vault supports different actions before and after listing. | Use status badges and section-level disabled states to explain which action is currently available. |
| `read-only` | The Vault has no user write path. | Use clear read-only copy and avoid disabled buttons that imply a missing implementation. |

Pattern:

```tsx
import type { ActionAvailabilityStage } from "@/src/sdk";
import { isActionAvailableForPhase, useFlapSdk } from "@/src/sdk";

const actionStage: ActionAvailabilityStage = "both";
const { context } = useFlapSdk();
const marketPhase = context.host?.marketPhase ?? "unknown";
const primaryActionAvailable = isActionAvailableForPhase(actionStage, marketPhase);
const actionUnavailableReason = !context.userAddress
  ? t("states.connectWallet")
  : !primaryActionAvailable
    ? actionStage === "dex-listed"
      ? t("states.actionWaitsForListing")
      : t("states.actionOnlyInternalMarket")
    : null;

return (
  <Card>
    <CardHeader>
      <div className="flex flex-wrap items-center gap-2">
        <CardTitle>{t("sections.actions")}</CardTitle>
        <StatusBadge tone={primaryActionAvailable ? "success" : "warning"}>
          {primaryActionAvailable ? t("states.actionsAvailable") : t("states.actionsUnavailable")}
        </StatusBadge>
      </div>
    </CardHeader>
    <CardContent className="space-y-3">
      <Alert tone="info">{t(`states.marketPhase.${marketPhase}`)}</Alert>
      {actionUnavailableReason ? <Alert tone="warning">{actionUnavailableReason}</Alert> : null}
      <TxButton idleLabel={t("actions.submit")} state={txState} onClick={() => void submit()} disabled={!primaryActionAvailable || !context.userAddress} />
    </CardContent>
  </Card>
);
```

Suggested i18n keys:

```json
{
  "states.marketPhase.internal-market": "Internal-market phase: bonding-curve / pre-listed actions may be available.",
  "states.marketPhase.dex-listed": "DEX-listed phase: post-listing actions may be available.",
  "states.marketPhase.unknown": "Market phase is not available yet.",
  "states.actionOnlyInternalMarket": "This action is only available before DEX listing.",
  "states.actionWaitsForListing": "This action becomes available after DEX listing."
}
```

## Risk And Verification Banner

Use for current contract risk status, unverified, high-risk, fallback, AI-generated, or schema-generated Vaults. Every onboarded Vault UI must read `riskLevel` from host context and visibly render it within the first three visible Vault-specific business rows/blocks, before any preview, hero, banner, showcase, media, chart, or large visual block; this is a strict package check. Low-risk copy must only be selected from the host-derived `riskLevel === 1` branch; do not add separate manual `Low risk` / `低风险` badges or reassuring copy.

```tsx
const riskLevel = host.vaultInfo?.riskLevel ?? host.taxInfo?.vaultInfo?.riskLevel ?? null;
const riskLabel =
  riskLevel === 1
    ? t("risk.low.title")
    : riskLevel === 2
      ? t("risk.lowMedium.title")
      : riskLevel === 3
        ? t("risk.medium.title")
        : riskLevel === 4
          ? t("risk.high.title")
          : riskLevel === 0
            ? t("risk.unverified.title")
            : t("risk.missing.title");
const riskTone = riskLevel === null || riskLevel === 0 || riskLevel >= 4 ? "danger" : riskLevel >= 3 ? "warning" : "success";

return (
  <>
    <StatusBadge tone={riskTone}>{riskLabel}</StatusBadge>
    {riskLevel === null ? <Alert tone="danger">{t("risk.missing.description")}</Alert> : null}
  </>
);
```

If the UI also needs an additional review posture banner, keep it separate from the host risk status so users can distinguish "the host risk level is missing" from "this UI needs review".

```tsx
type RiskPosture = "verified" | "review-required" | "unverified" | "high-risk";

const riskTone = riskPosture === "verified" ? "success" : riskPosture === "high-risk" ? "danger" : "warning";

return (
  <Alert tone={riskTone}>
    <div className="space-y-1">
      <div className="font-semibold">{t(`risk.${riskPosture}.title`)}</div>
      <div>{t(`risk.${riskPosture}.description`)}</div>
    </div>
  </Alert>
);
```

## Compact Embedded Surface

Use compact density when the Vault component is nested under a host token/tax information frame. In this template, the preview shell already constrains width; avoid duplicating the shell.

```tsx
return (
  <div className="w-full space-y-3">
    <div className="grid grid-cols-2 gap-2">
      <Metric className="p-3" label={t("labels.total")} value={formatTokenAmount(total, decimals)} />
      <Metric className="p-3" label={t("labels.mine")} value={formatTokenAmount(mine, decimals)} />
    </div>

    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <DetailTile label={t("labels.status")} value={statusLabel} />
          <DetailTile label={t("labels.updated")} value={<Countdown targetTimeMs={nextUpdateAt} />} />
        </div>
      </CardContent>
    </Card>
  </div>
);
```

## Default Scaffold Surface

Use this as the preferred starting shape for new custom Vault UIs. It avoids the older sample-dashboard look by keeping everything inside one compact business card: mechanism summary, a small status metric strip, compact runtime targets, and one primary action slot. Built-in examples stay secondary behavior references; this section wins for visual structure.

```tsx
return (
  <div className="w-full space-y-3 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[length:34px_34px] sm:space-y-4">
    <Card className="overflow-hidden rounded-[18px] border-white/10 bg-gradient-to-b from-[#0e141d] to-[#070b11] shadow-[0_20px_70px_-38px_rgba(76,141,255,0.65)]">
      <CardHeader className="p-4 pb-3 sm:p-5 sm:pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#4c8dff] shadow-[0_0_12px_rgba(76,141,255,0.85)]" />
              <CardTitle className="text-base sm:text-lg">{t("title")}</CardTitle>
            </div>
            <p className="max-w-2xl text-sm font-medium leading-6 text-[#7c8899]">{t("subtitle")}</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <StatusBadge tone={riskTone}>{riskLabel}</StatusBadge>
            <StatusBadge tone="neutral">{marketPhaseLabel}</StatusBadge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 p-4 pt-0 sm:space-y-4 sm:p-5 sm:pt-0">
        <div className="grid gap-3 lg:grid-cols-[1.15fr_0.85fr] lg:gap-4">
          <div className="rounded-[14px] border border-white/10 bg-black/25 p-3 sm:rounded-[16px] sm:p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-[#eaf1f8]">{t("sections.mechanism")}</span>
              <span className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-xs font-semibold text-[#7c8899]">
                {t("badges.defaultShell")}
              </span>
            </div>
            <p className="mt-3 text-xs font-semibold leading-5 text-[#7c8899] sm:mt-4 sm:text-sm sm:leading-6">
              {t("flow.description")}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1 lg:gap-3">
            <Metric label={t("labels.chain")} value={String(context.chainId)} tone="primary" />
            <Metric label={t("labels.marketPhase")} value={marketPhaseLabel} />
            <Metric label={t("labels.riskStatus")} value={riskLabel} tone={riskTone === "success" ? "success" : "warning"} />
          </div>
        </div>

        {riskLevel === null ? <Alert tone="danger">{t("notices.riskMissing")}</Alert> : null}

        <div className="grid grid-cols-2 overflow-hidden rounded-[14px] border border-white/10 sm:rounded-[16px] lg:grid-cols-4">
          {/* runtime targets and compact facts */}
        </div>

        <div className="rounded-[14px] border border-white/10 bg-black/30 p-3 sm:rounded-[16px] sm:p-4">
          {/* one primary action flow: input, quote, warnings, approve/write button */}
        </div>
      </CardContent>
    </Card>
  </div>
);
```

Use accent colors by function rather than by project branding:

| Function | Accent |
| --- | --- |
| Primary action / active route | `#4c8dff` |
| Success / verified / claimable | `#2bd18f` |
| Warning / waiting / missing review | `#f0b90b` |
| Danger / high risk / failed write | `#ff6b6b` |
| Neutral text and dividers | `#7c8899`, `#5a6678`, `border-white/10` |

Keep the accent small: a dot, badge, border, or button state is enough. Do not turn the whole component into one color theme.

## Dashboard Frame

Use for most Vault UIs: status, title, summary metrics, action panel, runtime details.

```tsx
return (
  <div className="w-full space-y-4">
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="min-w-0">
          <CardTitle>{t("sections.status")}</CardTitle>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-[#a8b5c7]">{t("sections.statusDescription")}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <StatusBadge tone={isReady ? "success" : "warning"}>{isReady ? t("states.ready") : t("states.unavailable")}</StatusBadge>
          <Button variant="outline" size="sm" onClick={() => void loadData()}>
            {t("actions.refresh")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-[#3d4f68] bg-[#121b2b] p-5 text-center">
          <div className="text-xs font-bold uppercase tracking-[0.32em] text-[#9facbf]">{t("labels.primaryState")}</div>
          <div className="mt-4 break-words text-4xl font-semibold leading-none text-white">{primaryStateText}</div>
          <p className="mx-auto mt-4 max-w-2xl text-sm font-medium leading-6 text-[#9facbf]">{t("notices.statusHint")}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label={t("labels.total")} value={formatTokenAmount(vaultInfo?.total, decimals)} hint={context.tokenSymbol} />
          <Metric label={t("labels.mine")} value={formatTokenAmount(myInfo?.amount, decimals)} hint={context.tokenSymbol} />
          <Metric label={t("labels.claimable")} value={formatTokenAmount(myInfo?.claimable, decimals)} hint={context.tokenSymbol} tone="success" />
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>{t("actions.primary")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* action controls go here */}
      </CardContent>
    </Card>
  </div>
);
```

## Contract Read Loader

Use one `loadData` callback that reads global state first, then wallet-dependent state. Poll no faster than 5 seconds unless Flap approves the need.

```tsx
type VaultInfoTuple = readonly [total: bigint, updatedAt: bigint];
type MyInfoTuple = readonly [amount: bigint, claimable: bigint];

function toVaultInfo(tuple: VaultInfoTuple): VaultInfo {
  return {
    total: tuple[0],
    updatedAt: Number(tuple[1]),
  };
}

function toMyInfo(tuple: MyInfoTuple): MyInfo {
  return {
    amount: tuple[0],
    claimable: tuple[1],
  };
}

const loadData = useCallback(async () => {
  const [nextVaultInfo, nextOracle] = await Promise.all([
    sdk.readContract<VaultInfoTuple>({
      contract: "vault",
      address: context.vaultAddress,
      abi: vaultAbi,
      functionName: "vaultInfo",
    }),
    sdk.readOracle<OraclePayload>("generic-oracle-id").catch(() => null),
  ]);

  setVaultInfo(toVaultInfo(nextVaultInfo));
  setOracle(nextOracle);

  if (!context.userAddress) {
    setMyInfo(null);
    setBalance(0n);
    setAllowance(0n);
    return;
  }

  const [nextMyInfo, nextBalance, nextAllowance] = await Promise.all([
    sdk.readContract<MyInfoTuple>({
      contract: "vault",
      address: context.vaultAddress,
      abi: vaultAbi,
      functionName: "myInfoOf",
      args: [context.userAddress],
    }),
    sdk.readContract<bigint>({
      contract: "token",
      address: context.tokenAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [context.userAddress],
    }),
    sdk.readContract<bigint>({
      contract: "token",
      address: context.tokenAddress,
      abi: erc20Abi,
      functionName: "allowance",
      args: [context.userAddress, context.vaultAddress],
    }),
  ]);

  setMyInfo(toMyInfo(nextMyInfo));
  setBalance(nextBalance);
  setAllowance(nextAllowance);
}, [context.tokenAddress, context.userAddress, context.vaultAddress, sdk]);
```

The tuple mapping is required when the ABI method uses multiple return values, such as `returns (uint256 total, uint256 updatedAt)`. Named outputs in a human-readable ABI still decode to a tuple array. A single returned Solidity `tuple` / struct output declared as one ABI output with `components` may still be read as an object.

## Approve Then Write Flow

Use this when the user spends the token before a Vault write. Keep `approve`, `simulate`, `write`, `wait`, and `refetch` explicit.

```tsx
const needsApproval = parsedAmount > 0n && allowance < parsedAmount;

async function approve() {
  setError(null);
  setTxState("approving");

  try {
    const hash = await sdk.writeContract({
      contract: "token",
      address: context.tokenAddress,
      abi: erc20Abi,
      functionName: "approve",
      args: [context.vaultAddress, parsedAmount],
    });

    setTxState("approval_confirming");
    await sdk.waitForTx(hash);
    sdk.notify.success(t("messages.approveSuccess"));
    await loadData();
    setTxState("idle");
  } catch (nextError) {
    setError(handleTxError(nextError));
    setTxState("failed");
  }
}

async function submit() {
  setError(null);

  if (parsedAmount <= 0n) {
    setError(t("errors.amountRequired"));
    setTxState("failed");
    return;
  }

  if (needsApproval) {
    await approve();
    return;
  }

  try {
    setTxState("simulating");
    const simulation = await sdk.simulateContract({
      contract: "vault",
      address: context.vaultAddress,
      abi: vaultAbi,
      functionName: "deposit",
      args: [parsedAmount],
    });

    setTxState("writing");
    const hash = await sdk.writeContract(simulation.request);
    setTxState("confirming");
    await sdk.waitForTx(hash);
    sdk.notify.success(t("messages.submitSuccess"));
    await loadData();
    setTxState("idle");
  } catch (nextError) {
    setError(handleTxError(nextError) || t("errors.txFailed"));
    setTxState("failed");
  }
}
```

Action section:

```tsx
<CardContent className="space-y-4">
  <label className="block space-y-2">
    <span className="text-sm text-white/56">{t("labels.amount")}</span>
    <Input value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} />
  </label>

  {needsApproval ? <Alert tone="warning">{t("states.approvalNeeded")}</Alert> : null}
  {error ? <Alert tone="danger">{error}</Alert> : null}

  <TxButton
    idleLabel={needsApproval ? t("actions.approve") : t("actions.submit")}
    state={txState}
    onClick={() => void submit()}
    disabled={!context.userAddress}
  />
</CardContent>
```

## Claim-Only Reward Panel

Use for compact reward, dividend, withdraw, or single-action Vaults.

```tsx
const hasClaimable = Boolean(myInfo?.claimable && myInfo.claimable > 0n);

async function claim() {
  setError(null);
  setClaiming(true);

  try {
    const simulation = await sdk.simulateContract({
      contract: "vault",
      address: context.vaultAddress,
      abi: vaultAbi,
      functionName: "claim",
      args: [],
    });

    const hash = await sdk.writeContract(simulation.request);
    await sdk.waitForTx(hash);
    sdk.notify.success(t("messages.claimSuccess"));
    await loadData();
  } catch (nextError) {
    setError(handleTxError(nextError) || t("errors.txFailed"));
  } finally {
    setClaiming(false);
  }
}

return (
  <Card>
    <CardHeader>
      <CardTitle>{t("sections.rewards")}</CardTitle>
    </CardHeader>
    <CardContent className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Metric label={t("labels.share")} value={formatPercentBps(myInfo?.shareBps)} />
        <Metric label={t("labels.claimable")} value={formatTokenAmount(myInfo?.claimable, decimals)} hint={context.tokenSymbol} />
      </div>

      <Button className="w-full" loading={claiming} onClick={() => void claim()} disabled={!context.userAddress || !hasClaimable}>
        {t("actions.claim")}
      </Button>

      {!hasClaimable && context.userAddress ? <Alert>{t("states.noClaimable")}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </CardContent>
  </Card>
);
```

## Quote And Percentage Panel

Use for sell, repay, swap, mint, or dual-token flows where a typed amount produces an estimate.

```tsx
const quickPercents = [25, 50, 75, 100];

function setPercent(percent: number) {
  if (!balance) return;
  const next = (balance * BigInt(percent)) / 100n;
  setAmount(formatTokenAmount(next, decimals, 6));
}

return (
  <CardContent className="space-y-4">
    <label className="block space-y-2">
      <span className="text-sm text-white/56">{t("labels.amount")}</span>
      <Input value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} />
    </label>

    <div className="grid grid-cols-4 gap-2">
      {quickPercents.map((percent) => (
        <Button key={percent} variant="outline" size="sm" onClick={() => setPercent(percent)} disabled={!context.userAddress}>
          {percent}%
        </Button>
      ))}
    </div>

    <div className="rounded-md border border-white/10 bg-black/18 p-3">
      <DataRow label={t("labels.expectedReturn")} value={formatTokenAmount(quote?.amountOut, quoteDecimals)} detail={quoteSymbol} />
      <DataRow label={t("labels.balance")} value={formatTokenAmount(balance, decimals)} detail={context.tokenSymbol} />
    </div>

    {quoteError ? <Alert tone="danger">{quoteError}</Alert> : null}
  </CardContent>
);
```

## Dual-Token Action Panel

Use when the user can buy/sell between two Vault-related tokens, spend one token to mint another, or claim LP-like rewards.

```tsx
const [mode, setMode] = useState<"buy" | "sell">("buy");
const spendToken = mode === "buy" ? tokenA : tokenB;
const receiveToken = mode === "buy" ? tokenB : tokenA;
const quote = mode === "buy" ? buyQuote : sellQuote;
const needsApproval = amountRaw > 0n && allowance < amountRaw;

return (
  <Card>
    <CardHeader>
      <CardTitle>{t("sections.trade")}</CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Button variant={mode === "buy" ? "default" : "outline"} onClick={() => setMode("buy")}>
          {t("actions.buy")}
        </Button>
        <Button variant={mode === "sell" ? "default" : "outline"} onClick={() => setMode("sell")}>
          {t("actions.sell")}
        </Button>
      </div>

      <label className="block space-y-2">
        <span className="text-sm text-white/56">{t("labels.spendAmount")}</span>
        <Input value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} />
      </label>

      <div className="rounded-md border border-white/10 bg-black/18 p-3">
        <DataRow label={t("labels.spendToken")} value={spendToken.symbol} />
        <DataRow label={t("labels.receiveToken")} value={receiveToken.symbol} />
        <DataRow label={t("labels.estimatedReceive")} value={formatTokenAmount(quote?.amountOut, receiveToken.decimals)} detail={receiveToken.symbol} />
      </div>

      {needsApproval ? <Alert tone="warning">{t("states.approvalNeeded")}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <TxButton idleLabel={needsApproval ? t("actions.approve") : t(`actions.${mode}`)} state={txState} onClick={() => void submitTrade()} disabled={!context.userAddress || amountRaw <= 0n} />
    </CardContent>
  </Card>
);
```

## NFT Or Inventory Panel

Use for owned items, voucher cards, mint/sell/claim flows, or item inventory. Do not add third-party media. If media is required, it must be controlled by the Flap Artifact Workbench/runtime policy.

```tsx
const ownedIds = useMemo(() => ownedItems ?? [], [ownedItems]);
const hasInventory = ownedIds.length > 0;

return (
  <Card>
    <CardHeader>
      <CardTitle>{t("sections.inventory")}</CardTitle>
      <p className="text-sm leading-6 text-white/56">{t("sections.inventoryHint")}</p>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label={t("labels.totalMinted")} value={String(vaultInfo?.minted ?? "-")} />
        <Metric label={t("labels.available")} value={String(vaultInfo?.available ?? "-")} />
        <Metric label={t("labels.mine")} value={String(ownedIds.length)} />
      </div>

      {hasInventory ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {ownedIds.slice(0, 6).map((id) => (
            <div key={String(id)} className="rounded-md border border-white/10 bg-black/18 p-3">
              <div className="text-sm font-semibold text-white">{t("labels.item")} #{String(id)}</div>
              <div className="mt-1 text-xs text-white/45">{t("states.itemOwned")}</div>
            </div>
          ))}
        </div>
      ) : (
        <Alert>{context.userAddress ? t("states.emptyInventory") : t("states.connectWallet")}</Alert>
      )}
    </CardContent>
  </Card>
);
```

## Distribution Or Recipient Panel

Use for split, share, fund-recipient, or donation-like Vaults. Keep recipient data read-only unless the current user can claim.

```tsx
return (
  <Card>
    <CardHeader>
      <CardTitle>{t("sections.distribution")}</CardTitle>
      <p className="text-sm leading-6 text-white/56">{t("sections.distributionHint")}</p>
    </CardHeader>
    <CardContent className="space-y-3">
      {recipients.length ? (
        recipients.map((recipient) => {
          const unclaimed = recipient.accumulated - recipient.claimed;
          const canClaim = context.userAddress?.toLowerCase() === recipient.account.toLowerCase() && unclaimed > 0n;

          return (
            <div key={recipient.account} className="rounded-md border border-white/10 bg-black/18 p-3">
              <DataRow label={t("labels.recipient")} value={<AddressLink address={recipient.account} explorerBaseUrl={context.explorerBaseUrl} />} />
              <DataRow label={t("labels.allocated")} value={formatTokenAmount(recipient.accumulated, decimals)} detail={context.tokenSymbol} />
              <DataRow label={t("labels.claimed")} value={formatTokenAmount(recipient.claimed, decimals)} detail={context.tokenSymbol} />
              {canClaim ? (
                <Button className="mt-3 w-full" loading={claimingRecipient === recipient.account} onClick={() => void claimRecipient(recipient.account)}>
                  {t("actions.claim")}
                </Button>
              ) : null}
            </div>
          );
        })
      ) : (
        <Alert>{t("states.noRecipients")}</Alert>
      )}
    </CardContent>
  </Card>
);
```

## Lending Or Staged Confirmation Flow

Use when the user stakes collateral, borrows, confirms an off-chain or on-chain action, then repays or unstakes.

```tsx
return (
  <Card>
    <CardHeader>
      <CardTitle>{t("sections.position")}</CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label={t("labels.staked")} value={formatTokenAmount(position?.staked, decimals)} hint={context.tokenSymbol} />
        <Metric label={t("labels.borrowed")} value={formatTokenAmount(position?.borrowed, nativeDecimals)} hint={context.nativeSymbol} />
        <Metric label={t("labels.required")} value={formatTokenAmount(position?.required, decimals)} hint={context.tokenSymbol} />
      </div>

      {!active ? <Alert tone="warning">{t("states.inactive")}</Alert> : null}
      {position?.needsConfirm ? <Alert tone="warning">{t("states.confirmRequired")}</Alert> : null}

      <div className="grid gap-2 sm:grid-cols-3">
        <TxButton idleLabel={needsApproval ? t("actions.approve") : t("actions.stakeAndBorrow")} state={stakeState} onClick={() => void stakeAndBorrow()} disabled={!context.userAddress || !active} />
        <TxButton idleLabel={t("actions.confirm")} state={confirmState} onClick={() => void confirm()} disabled={!position?.needsConfirm} />
        <TxButton idleLabel={t("actions.repay")} state={repayState} onClick={() => void repay()} disabled={!position?.borrowed} />
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}
    </CardContent>
  </Card>
);
```

## Countdown Or Delayed Action

Use for epochs, reward windows, delayed settlement, game-like actions, or safety-gated writes.

```tsx
const actionOpen = Boolean(vaultInfo?.actionOpensAt && Date.now() >= vaultInfo.actionOpensAt);

return (
  <Card>
    <CardHeader>
      <CardTitle>{t("sections.window")}</CardTitle>
    </CardHeader>
    <CardContent className="space-y-3">
      <DataRow label={t("labels.opensIn")} value={<Countdown targetTimeMs={vaultInfo?.actionOpensAt} />} />
      <DataRow label={t("labels.endsIn")} value={<Countdown targetTimeMs={vaultInfo?.actionEndsAt} />} />

      {!actionOpen ? <Alert tone="warning">{t("states.waitForWindow")}</Alert> : null}

      <TxButton idleLabel={t("actions.execute")} state={txState} onClick={() => void execute()} disabled={!context.userAddress || !actionOpen} />
    </CardContent>
  </Card>
);
```

## Prize Or Staking Panel

Use for prize pools, time-boxed staking, lock periods, winner candidates, and multiple claim paths.

```tsx
return (
  <Card>
    <CardHeader>
      <CardTitle>{t("sections.prizeAndStake")}</CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label={t("labels.prizePool")} value={formatTokenAmount(vaultInfo?.prizePool, nativeDecimals)} hint={context.nativeSymbol} />
        <Metric label={t("labels.timeLeft")} value={<Countdown targetTimeMs={vaultInfo?.roundEndsAt} />} />
        <Metric label={t("labels.myStake")} value={formatTokenAmount(myStake?.amount, decimals)} hint={context.tokenSymbol} />
      </div>

      {vaultInfo?.prizePool === 0n ? <Alert tone="warning">{t("states.emptyPrizePool")}</Alert> : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <TxButton idleLabel={t("actions.claimPrize")} state={claimPrizeState} onClick={() => void claimPrize()} disabled={!myPrize?.claimable} />
        <TxButton idleLabel={t("actions.claimReward")} state={claimRewardState} onClick={() => void claimReward()} disabled={!myStake?.reward} />
      </div>

      <div className="rounded-md border border-white/10 bg-black/18 p-3">
        <DataRow label={t("labels.lockedUntil")} value={<Countdown targetTimeMs={myStake?.unlockAt} />} />
        <DataRow label={t("labels.pendingReward")} value={formatTokenAmount(myStake?.reward, decimals)} detail={context.tokenSymbol} />
      </div>
    </CardContent>
  </Card>
);
```

## Submission And Gallery Panel

Use for text submission, public entries, paginated lists, random item previews, or recent fulfilled results.

```tsx
return (
  <Card>
    <CardHeader>
      <CardTitle>{t("sections.entries")}</CardTitle>
      <p className="text-sm leading-6 text-white/56">{t("sections.entriesHint")}</p>
    </CardHeader>
    <CardContent className="space-y-4">
      <label className="block space-y-2">
        <span className="text-sm text-white/56">{t("labels.entryContent")}</span>
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          maxLength={280}
          className="min-h-24 w-full rounded-md border border-white/10 bg-black/24 px-3 py-2 text-sm text-white outline-none focus:border-primary/60"
        />
      </label>

      <TxButton idleLabel={t("actions.submitEntry")} state={submitState} onClick={() => void submitEntry()} disabled={!context.userAddress || content.trim().length === 0} />

      <div className="flex flex-wrap gap-2">
        <Button variant={activeTab === "recent" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("recent")}>{t("tabs.recent")}</Button>
        <Button variant={activeTab === "all" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("all")}>{t("tabs.all")}</Button>
        <Button variant={activeTab === "random" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("random")}>{t("tabs.random")}</Button>
      </div>

      {entries.length ? (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.id} className="rounded-md border border-white/10 bg-black/18 p-3">
              <div className="text-sm text-white">{entry.content}</div>
              <div className="mt-2 text-xs text-white/42">{entry.meta}</div>
            </div>
          ))}
        </div>
      ) : (
        <Alert>{t("states.noEntries")}</Alert>
      )}
    </CardContent>
  </Card>
);
```

## Oracle-Signed Or Proof-Based Action

Use this only when SDK/on-chain reads cannot satisfy the workflow. Do not declare oracle config in `manifest.json`; `vault:check` reports `sdk.readOracle(...)` usage for Flap Artifact Workbench/runtime review.

```tsx
interface ProofPayload {
  amount: string;
  expiresAt: number;
  signature: `0x${string}`;
}

const [proof, setProof] = useState<ProofPayload | null>(null);
const proofExpired = proof ? Date.now() > proof.expiresAt * 1000 : true;

async function refreshProof() {
  setError(null);
  try {
    const nextProof = await sdk.readOracle<ProofPayload>("generic-proof-oracle", {
      chainId: String(context.chainId),
      token: context.tokenAddress,
      vault: context.vaultAddress,
    });
    setProof(nextProof);
  } catch (nextError) {
    setProof(null);
    setError(handleTxError(nextError) || t("errors.oracleUnavailable"));
  }
}

return (
  <Card>
    <CardHeader>
      <CardTitle>{t("sections.proof")}</CardTitle>
    </CardHeader>
    <CardContent className="space-y-3">
      <StatusBadge tone={proof && !proofExpired ? "success" : "warning"}>
        {proof && !proofExpired ? t("states.proofReady") : t("states.proofUnavailable")}
      </StatusBadge>

      <DataRow label={t("labels.proofExpires")} value={proof ? <Countdown targetTimeMs={proof.expiresAt * 1000} /> : "-"} />

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={() => void refreshProof()}>
          {t("actions.refreshProof")}
        </Button>
        <TxButton idleLabel={t("actions.submit")} state={txState} onClick={() => void submitWithProof()} disabled={!proof || proofExpired} />
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}
    </CardContent>
  </Card>
);
```

## Schema Method Dashboard

Use for schema-generated read/write dashboards only when a Vault intentionally exposes method metadata. Keep generated writes behind review and risk gates.

```tsx
const readMethods = schema.methods.filter((method) => !method.isWrite && method.inputs.length === 0);
const writeMethods = schema.methods.filter((method) => method.isWrite);

return (
  <div className="space-y-4">
    <Alert tone={schema.reviewed ? "info" : "warning"}>
      {schema.reviewed ? t("notices.schemaReviewed") : t("notices.schemaUnreviewed")}
    </Alert>

    {readMethods.map((method) => (
      <Card key={method.name}>
        <CardHeader>
          <CardTitle>{method.label}</CardTitle>
        </CardHeader>
        <CardContent>
          {method.outputs.map((output) => (
            <DataRow key={output.key} label={output.label} value={formatSchemaValue(output.value, output.type)} />
          ))}
        </CardContent>
      </Card>
    ))}

    {writeMethods.length ? <DangerousWriteGate>{/* generated write panels */}</DangerousWriteGate> : null}
  </div>
);
```

## Dangerous Or Unverified Write Gate

Use for generated write-method dashboards or risky irreversible actions. The user must explicitly expand and wait before methods appear.

```tsx
const [expanded, setExpanded] = useState(false);
const [countdown, setCountdown] = useState<number | null>(null);
const canShowActions = expanded && countdown === 0;

useEffect(() => {
  if (countdown === null || countdown <= 0) return;
  const timer = window.setTimeout(() => setCountdown((value) => (value ?? 1) - 1), 1000);
  return () => window.clearTimeout(timer);
}, [countdown]);

function toggleRiskPanel() {
  if (expanded) {
    setExpanded(false);
    setCountdown(null);
    return;
  }
  setExpanded(true);
  setCountdown(5);
}

return (
  <Card className="border-red-400/30">
    <CardHeader>
      <button type="button" className="flex w-full items-center justify-between text-left" onClick={toggleRiskPanel}>
        <CardTitle className="text-red-200">{t("sections.riskyActions")}</CardTitle>
        <span className="text-xs text-white/42">{expanded ? t("actions.collapse") : t("actions.expand")}</span>
      </button>
    </CardHeader>
    {expanded ? (
      <CardContent className="space-y-3">
        <Alert tone="danger">{t("notices.riskyActions")}</Alert>
        {countdown && countdown > 0 ? <div className="py-3 text-center text-sm text-red-200">{t("states.showingIn")} {countdown}s</div> : null}
        {canShowActions ? <div className="space-y-3">{/* write method panels */}</div> : null}
      </CardContent>
    ) : null}
  </Card>
);
```

## Empty, Loading, And Error States

Every generated Vault UI should explicitly handle:

- no wallet connected
- wrong chain, if the host cannot switch automatically
- action hidden by stage policy
- read loading
- no claimable balance
- paused or unavailable action
- oracle/proof unavailable
- transaction simulation failure
- transaction submitted but not confirmed

```tsx
{loading ? <Alert>{t("states.loading")}</Alert> : null}
{!context.userAddress ? <Alert>{t("states.connectWallet")}</Alert> : null}
{paused ? <Alert tone="warning">{t("states.paused")}</Alert> : null}
{error ? <Alert tone="danger">{error}</Alert> : null}
```

## Agent Checklist

Before coding, pick one primary pattern:

- dashboard frame
- claim-only reward
- approve then write
- quote and percentage
- dual-token action
- distribution / recipient
- lending / staged confirmation
- NFT or inventory
- countdown or delayed action
- prize / staking
- submission and gallery
- oracle-signed or proof-based action
- schema method dashboard
- dangerous or unverified write gate

Then map the contract workflow to:

- action availability stage
- reads
- derived state
- actions
- transaction states
- refetch points
- disabled states
- i18n keys

Do not paste private reference code into the component. Rebuild the UI with this template's SDK and UI primitives.
