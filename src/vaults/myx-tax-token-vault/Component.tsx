"use client";

import { useCallback, useRef, useState } from "react";
import { encodeAbiParameters } from "viem";
import type { Address, VaultComponentProps } from "@/src/sdk";
import { handleTxError, isActionAvailableForPhase, readTaxVaultHostContext, useFlapSdk } from "@/src/sdk";
import { AddressLink, Alert, Card, CardContent, CardTitle, StatusBadge } from "@/src/ui";
import type { TxButtonState } from "@/src/ui";
import { factoryAbi } from "./VaultABI";

const USDT_MAINNET = "0x55d398326f99059ff775485246999027b3197955" as Address;
const USDC_MAINNET = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d" as Address;

type QuoteOption = { label: string; address: Address };

function getQuoteOptions(chainId: number): QuoteOption[] {
  if (chainId === 56) return [
    { label: "USDT", address: USDT_MAINNET },
    { label: "USDC", address: USDC_MAINNET },
  ];
  return [];
}

export default function MyxTaxTokenVault(_props: VaultComponentProps) {
  const sdk = useFlapSdk();
  const { context, i18n } = sdk;
  const t = i18n.t;
  const host = readTaxVaultHostContext(context.host);

  const riskLevel = host.vaultInfo?.riskLevel ?? host.taxInfo?.vaultInfo?.riskLevel ?? null;
  const riskTone =
    riskLevel === null || riskLevel === 0 || riskLevel >= 4 ? "danger" :
    riskLevel >= 3 ? "warning" : "success";
  const riskLabel =
    riskLevel === 1 ? t("states.riskLow") :
    riskLevel === 2 ? t("states.riskLowMedium") :
    riskLevel === 3 ? t("states.riskMedium") :
    riskLevel === 4 ? t("states.riskHigh") :
    riskLevel === 0 ? t("states.riskUnverified") :
    t("states.riskMissing");

  const writesAvailable = isActionAvailableForPhase("both", host.marketPhase);
  const quoteOptions = getQuoteOptions(context.chainId);

  const [selected, setSelected] = useState<QuoteOption | null>(quoteOptions[0] ?? null);
  const [error, setError] = useState<string | null>(null);
  const [txState, setTxState] = useState<TxButtonState>("idle");
  const [createdVault, setCreatedVault] = useState<Address | null>(null);
  const resetTimer = useRef<number | null>(null);

  const scheduleReset = useCallback(() => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => { resetTimer.current = null; setTxState("idle"); }, 3000);
  }, []);

  async function handleCreate() {
    setError(null);
    if (!context.userAddress) { setError(t("errors.connectWallet")); return; }
    if (sdk.wallet.isWrongNetwork) { setError(t("errors.switchNetwork", undefined, { chain: sdk.wallet.requiredChainLabel })); return; }
    if (!writesAvailable) { setError(t("errors.stageUnavailable")); return; }
    if (!selected) { setError(t("errors.selectToken")); return; }

    const encodedData = encodeAbiParameters([{ type: "address", name: "quoteToken" }], [selected.address]);
    try {
      setTxState("simulating");
      const sim = await sdk.simulateContract({
        contract: "vault",
        address: context.factoryAddress,
        abi: factoryAbi,
        functionName: "newVault",
        args: [context.tokenAddress, selected.address, context.userAddress, encodedData],
      });
      const predictedVault = sim.result as Address;
      setTxState("writing");
      const hash = await sdk.writeContract(sim.request);
      setTxState("confirming");
      await sdk.waitForTx(hash);
      sdk.notify.success(t("messages.createSuccess"));
      setCreatedVault(predictedVault);
      setTxState("success");
    } catch (err) {
      setError(handleTxError(err, { reverted: t("errors.txFailed"), unknown: t("errors.txFailed") }));
      setTxState("failed");
      scheduleReset();
    }
  }

  return (
    <div className="w-full rounded-lg border border-[#1f2937] bg-[#05070f] p-3 text-[#e5e7eb] shadow-[0_18px_60px_-42px_rgba(0,0,0,0.9)] sm:p-4">
      <Card className="overflow-hidden border-[#243044] bg-[#0b1220] text-[#e5e7eb]">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1.5">
              <CardTitle className="text-base text-[#f8fafc] sm:text-lg">{t("title")}</CardTitle>
              <p className="truncate text-sm text-[#94a3b8]">{t("subtitle")}</p>
            </div>
            <StatusBadge tone={riskTone}>{riskLabel}</StatusBadge>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {(["rules.1", "rules.2", "rules.3", "rules.4"] as const).map((key) => (
              <div key={key} className="flex items-center gap-1.5 rounded-md border border-[#1e2800] bg-[#0d1200] px-2 py-1.5">
                <span className="h-1 w-1 shrink-0 rounded-full bg-[#d0ff00]" />
                <span className="text-xs leading-4 text-[#94a3b8]">{t(key)}</span>
              </div>
            ))}
          </div>
          {riskLevel === null ? <Alert tone="danger">{t("notices.riskMissing")}</Alert> : null}

          {createdVault ? (
            <div className="space-y-3">
              <Alert tone="success">{t("messages.createSuccess")}</Alert>
              <AddressRow label={t("labels.newVault")} value={<AddressLink address={createdVault} explorerBaseUrl={context.explorerBaseUrl} />} />
            </div>
          ) : (
            <div className="space-y-4">
              {error ? <Alert tone="danger">{error}</Alert> : null}
              <div className="space-y-2">
                <p className="text-sm font-semibold text-[#cbd5e1]">{t("labels.selectQuoteToken")}</p>
                <p className="text-sm text-[#94a3b8]">{t("labels.quoteTokenHint")}</p>
                {quoteOptions.length > 0 ? (
                  <div className="flex flex-col gap-2 pt-1">
                    {quoteOptions.map((opt) => {
                      const isSelected = selected?.label === opt.label;
                      return (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() => setSelected(opt)}
                          className={`flex w-full items-center justify-between rounded-xl border px-4 py-4 text-left transition-all ${
                            isSelected
                              ? "border-[#d0ff00]/60 bg-[#0d1200]"
                              : "border-[#243044] bg-[#0d1525] hover:border-[#334155] hover:bg-[#111827]"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <TokenIcon label={opt.label} />
                            <span className="text-sm font-bold text-[#f1f5f9]">{opt.label}</span>
                          </div>
                          <div className="flex items-center gap-2.5">
                            <span className="font-mono text-xs text-[#475569]">
                              {opt.address.slice(0, 6)}…{opt.address.slice(-4)}
                            </span>
                            <span className={`flex h-3 w-3 shrink-0 items-center justify-center rounded-full border transition-colors ${
                              isSelected ? "border-[#d0ff00] bg-[#d0ff00]" : "border-[#334155]"
                            }`}>
                              {isSelected && <span className="h-1 w-1 rounded-full bg-[#0a0f00]" />}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <Alert tone="warning">{t("errors.noQuoteTokens")}</Alert>
                )}
              </div>
              <CreateButton
                state={txState}
                label={t("actions.create")}
                onClick={() => void handleCreate()}
                disabled={!context.userAddress || sdk.wallet.isWrongNetwork || !writesAvailable || !selected}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CreateButton({ state, label, onClick, disabled }: {
  state: TxButtonState;
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  const isLoading = state === "simulating" || state === "writing" || state === "confirming";
  const stateLabel =
    state === "simulating" ? "Simulating…" :
    state === "writing" ? "Confirm in wallet…" :
    state === "confirming" ? "Confirming…" :
    state === "success" ? "✓ Success" :
    state === "failed" ? "Failed" :
    label;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isLoading}
      className="relative w-full overflow-hidden rounded-xl bg-[#d0ff00] px-6 py-3.5 text-sm font-bold text-[#0a0f00] shadow-[0_4px_20px_-4px_rgba(208,255,0,0.4)] transition-all hover:bg-[#e4ff4d] hover:shadow-[0_4px_24px_-4px_rgba(208,255,0,0.6)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="flex items-center justify-center gap-2">
        {isLoading && (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
        )}
        {stateLabel}
      </span>
    </button>
  );
}

function TokenIcon({ label }: { label: string }) {
  if (label === "USDC") {
    return (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="16" fill="#2775CA"/>
        <path d="M21 12.5C19.6 11 17.9 10 16 10C12.1 10 9 13.1 9 17C9 20.9 12.1 24 16 24C17.9 24 19.6 23 21 21.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
        <rect x="15" y="7" width="2" height="4" rx="1" fill="white"/>
        <rect x="15" y="21" width="2" height="4" rx="1" fill="white"/>
      </svg>
    );
  }
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="#26A17B"/>
      <rect x="8" y="9" width="16" height="2.5" rx="1.25" fill="white"/>
      <rect x="14.75" y="10" width="2.5" height="13" rx="1.25" fill="white"/>
      <rect x="10.5" y="16.5" width="11" height="2" rx="1" fill="white"/>
    </svg>
  );
}

function AddressRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-md border border-[#243044] bg-[#111827] p-3">
      <span className="text-xs font-bold text-[#64748b]">{label}</span>
      <div className="min-w-0 break-words text-sm font-semibold text-[#dbeafe]">{value}</div>
    </div>
  );
}
