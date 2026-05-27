"use client";

import Image from "next/image";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useState } from "react";
import { useChainId, useSwitchChain } from "wagmi";
import { bsc, bscTestnet } from "wagmi/chains";
import { ChevronDown } from "lucide-react";
import { useLang } from "@/src/i18n/useLang";
import { useVaultContext } from "@/src/sdk";
import { cn } from "@/src/ui/utils";

function shortenAddress(address?: string) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function ChainSelectorButton({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const { lang } = useLang();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();
  const chains = [
    { id: bsc.id, name: lang.nav.bnbChain, logo: "/bnb.svg" },
    { id: bscTestnet.id, name: lang.nav.bnbTestnet, logo: "/bnb.svg" },
  ];
  const currentChain = chains.find((chain) => chain.id === chainId) ?? chains[0];

  return (
    <div className="relative">
      <button
        type="button"
        className={cn(
          "flex shrink-0 items-center justify-center rounded-[12px] text-white transition-colors hover:bg-[#333333]",
          compact ? "h-8 w-[52px] gap-1.5 bg-[#262626] px-2" : "h-8 min-w-[112px] gap-2 bg-[#262626] px-3",
        )}
        aria-label={`Current chain: ${currentChain.name}`}
        onClick={() => setOpen((value) => !value)}
        disabled={isPending}
      >
        <Image src={currentChain.logo} alt={currentChain.name} width={20} height={20} className={cn("shrink-0", compact ? "h-4 w-4" : "h-5 w-5")} unoptimized />
        <span className={cn("font-bold leading-[1.4] uppercase", compact ? "hidden" : "hidden text-sm md:inline")}>{currentChain.name}</span>
        <ChevronDown className={cn("text-white/70", compact ? "block h-3 w-3" : "hidden h-4 w-4 md:block")} />
      </button>
      {open ? (
        <div className="absolute right-0 top-10 z-50 min-w-[180px] rounded-[12px] border border-[#262626] bg-[#171717] p-1.5 text-white shadow-[0_12px_32px_rgba(0,0,0,0.35)]">
          {chains.map((chain) => {
            const isActive = chain.id === currentChain.id;
            return (
              <button
                key={chain.name}
                type="button"
                className={cn("flex h-10 w-full items-center gap-3 rounded-[8px] px-3 text-left text-sm transition-colors", isActive ? "text-white/70" : "hover:bg-[#262626]")}
                disabled={isActive || isPending}
                onClick={() => {
                  switchChain({ chainId: chain.id });
                  setOpen(false);
                }}
              >
                <Image src={chain.logo} alt={chain.name} width={20} height={20} className="h-5 w-5 shrink-0" unoptimized />
                <span className="font-medium">{chain.name}</span>
                {isActive ? <span className="ml-auto text-xs text-white/50">{lang.nav.current}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function WalletButton() {
  const context = useVaultContext();
  const { lang } = useLang();
  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, openAccountModal, openChainModal, openConnectModal }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        if (!connected) {
          return (
            <button
              type="button"
              className="flex h-8 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#262626] px-4 text-[12px] font-bold leading-[17px] text-white transition-colors hover:bg-white/10 max-sm:w-8 max-sm:px-0"
              onClick={openConnectModal}
            >
              <Image src="/wallet.svg" alt="wallet" width={16} height={16} unoptimized />
              <span className="max-sm:hidden">{lang.nav.connect}</span>
            </button>
          );
        }

        if (chain.unsupported) {
          return (
            <button
              type="button"
              className="flex h-8 shrink-0 items-center justify-center rounded-lg bg-red-600 px-4 text-[12px] font-bold leading-[17px] text-white transition-colors hover:bg-red-500"
              onClick={openChainModal}
            >
              {lang.nav.wrongNetwork}
            </button>
          );
        }

        return (
          <button
            type="button"
            className="flex h-8 shrink-0 items-center justify-center rounded-lg border-0 bg-[#262626] px-4 text-[12px] font-bold leading-[17px] text-white transition-colors hover:bg-white/10 max-sm:w-8 max-sm:px-0"
            onClick={openAccountModal}
          >
            <div className="flex flex-row items-center justify-center space-x-2 max-sm:space-x-0">
              {account.displayBalance ? (
                <div className="flex flex-row space-x-2 border-r border-white/20 pr-2 max-sm:hidden">
                  <Image src="/bnb.svg" alt={context.paymentToken?.symbol ?? "BNB"} width={18} height={18} />
                  <span>{account.displayBalance}</span>
                </div>
              ) : null}
              <span className="max-sm:hidden">{account.displayName || shortenAddress(account.address)}</span>
              <span className="hidden h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-black text-primary-foreground max-sm:flex">
                {account.address.slice(2, 3).toUpperCase()}
              </span>
            </div>
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
