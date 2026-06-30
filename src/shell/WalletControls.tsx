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
import { Ui20FlapMarkIcon, Ui20WalletIcon } from "./Ui20Icons";

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
          "flex shrink-0 items-center justify-center rounded-[6px] border border-[#303236] bg-black font-mono text-white transition-colors hover:border-[#D0FF00]",
          compact ? "h-9 w-[62px] gap-1 px-2" : "h-10 min-w-[112px] gap-2 px-3",
        )}
        aria-label={`Current chain: ${currentChain.name}`}
        onClick={() => setOpen((value) => !value)}
        disabled={isPending}
      >
        <Image src={currentChain.logo} alt={currentChain.name} width={20} height={20} className="h-5 w-5 shrink-0" unoptimized />
        <span className={cn("font-normal leading-[1.4] uppercase", compact ? "hidden" : "hidden text-[14px] md:inline")}>{currentChain.name}</span>
        <ChevronDown className={cn("text-white", compact ? "block h-3.5 w-3.5" : "hidden h-3 w-3 md:block")} />
      </button>
      {open ? (
        <div className="absolute right-0 top-11 z-50 min-w-[220px] border border-[#303236] bg-[#070808] p-0 font-mono text-white shadow-none">
          {chains.map((chain) => {
            const isActive = chain.id === currentChain.id;
            return (
              <button
                key={chain.name}
                type="button"
                className={cn(
                  "group relative flex h-[60px] w-full items-center gap-3 border-b border-[#303236] px-4 text-left text-[14px] uppercase transition-colors last:border-b-0 hover:bg-[#131516] hover:text-[#D0FF00]",
                  isActive ? "text-[#D0FF00]" : "text-white",
                )}
                disabled={isActive || isPending}
                onClick={() => {
                  switchChain({ chainId: chain.id });
                  setOpen(false);
                }}
              >
                <span className={cn("absolute left-0 top-0 hidden h-full w-0.5 bg-[#D0FF00] group-hover:block", isActive && "block")} />
                <Image src={chain.logo} alt={chain.name} width={20} height={20} className="h-5 w-5 shrink-0" unoptimized />
                <span className="font-normal">{chain.name}</span>
                {isActive ? <span className="ml-auto text-xs text-[#D0FF00]">{lang.nav.current}</span> : null}
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
              className="ui20-connect-chamfer flex h-10 shrink-0 items-center justify-center gap-2 border border-[#D0FF00] bg-black px-4 font-mono text-[12px] font-bold leading-[17px] text-[#D0FF00] transition-colors [--ui20-chamfer-bg:#000000] [--ui20-chamfer-border:#D0FF00] hover:bg-[#D0FF00] hover:text-black hover:[--ui20-chamfer-bg:#D0FF00] max-sm:h-9 max-sm:w-9 max-sm:px-0"
              onClick={openConnectModal}
            >
              <Ui20WalletIcon className="h-[15px] w-[15px] max-sm:hidden" />
              <Ui20FlapMarkIcon className="hidden h-4 w-[17.33px] max-sm:block" />
              <span className="max-sm:hidden">{lang.nav.connect}</span>
            </button>
          );
        }

        if (chain.unsupported) {
          return (
            <button
              type="button"
              className="ui20-connect-chamfer flex h-10 shrink-0 items-center justify-center border border-[#FF4A55] bg-black px-4 font-mono text-[12px] font-bold leading-[17px] text-[#FF4A55] transition-colors [--ui20-chamfer-bg:#000000] [--ui20-chamfer-border:#FF4A55] hover:bg-[#FF4A55] hover:text-black hover:[--ui20-chamfer-bg:#FF4A55] max-sm:h-9 max-sm:w-9 max-sm:px-0"
              onClick={openChainModal}
            >
              {lang.nav.wrongNetwork}
            </button>
          );
        }

        return (
          <button
            type="button"
            className="ui20-connect-chamfer flex h-10 shrink-0 items-center justify-center border border-[#303236] bg-black px-4 font-mono text-[12px] font-bold leading-[17px] text-white transition-colors [--ui20-chamfer-bg:#000000] [--ui20-chamfer-border:#303236] hover:text-[#D0FF00] hover:[--ui20-chamfer-border:#D0FF00] max-sm:h-9 max-sm:w-9 max-sm:px-0"
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
              <Ui20FlapMarkIcon className="hidden h-4 w-[17.33px] text-[#D0FF00] max-sm:block" />
            </div>
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
