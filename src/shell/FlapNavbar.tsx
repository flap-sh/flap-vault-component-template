"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Brain, ChevronDown, Menu, Plus, Search, ShoppingCart, TrendingUp, User, X } from "lucide-react";
import type { VaultManifest } from "@/src/sdk";
import EN from "@/res/content.json";
import ZH from "@/res/content_zh.json";
import { useLang } from "@/src/i18n/useLang";
import { cn } from "@/src/ui/utils";

interface FlapNavbarProps {
  manifest: VaultManifest;
}

const ChainSelectorButton = dynamic(() => import("./WalletControls").then((module) => module.ChainSelectorButton), { ssr: false });
const WalletButton = dynamic(() => import("./WalletControls").then((module) => module.WalletButton), { ssr: false });

function SearchButton({ compact = false, manifest }: { compact?: boolean; manifest: VaultManifest }) {
  const [open, setOpen] = useState(false);
  const { lang } = useLang();

  return (
    <div className="relative">
      <button
        type="button"
        className={cn(
          "flex h-8 shrink-0 items-center rounded-lg bg-[#262626] text-[#D4D4D4] transition-colors hover:bg-white/10",
          compact ? "w-8 justify-center p-0" : "w-[200px] justify-start gap-1.5 px-4",
        )}
        aria-label="Search"
        onClick={() => setOpen((value) => !value)}
      >
        <Search className="h-4 w-4" />
        {!compact && <span className="text-[12px] leading-[17px] text-[#525252]">{lang.nav.search}</span>}
      </button>
      {open ? (
        <div className="absolute right-0 top-10 z-50 w-[min(320px,calc(100vw-2rem))] rounded-[12px] border border-[#262626] bg-[#171717] p-2 text-white shadow-[0_12px_32px_rgba(0,0,0,0.35)] md:left-0 md:right-auto">
          <div className="flex h-10 items-center gap-2 rounded-[8px] bg-[#0f0f0f] px-3">
            <Search className="h-4 w-4 text-white/48" />
            <input
              autoFocus
              className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-white/32"
              placeholder={lang.nav.searchToken}
            />
          </div>
          <button
            type="button"
            className="mt-2 flex w-full items-center justify-between rounded-[8px] px-3 py-3 text-left transition-colors hover:bg-[#262626]"
            onClick={() => setOpen(false)}
          >
            <span className="min-w-0 truncate text-sm font-medium">{manifest.name}</span>
            <span className="text-xs text-white/40">{lang.preview.badge}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CreateTokenButton({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const { lang } = useLang();

  return (
    <div className="relative">
      <button
        type="button"
        className={cn(
          "flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-[#705ef3] to-[#15e897] font-semibold text-white transition-opacity hover:opacity-90",
          compact ? "h-8 gap-1.5 px-3" : "h-[33px] gap-1.5 px-4",
        )}
        aria-label="Create Token"
        onClick={() => setOpen((value) => !value)}
      >
        <Plus className="h-3 w-3 shrink-0" strokeWidth={3} />
        <span className="text-[12px] font-bold leading-[17px]">
          <span className={compact ? "inline" : "hidden sm:inline"}>{compact ? lang.nav.create : lang.nav.createToken}</span>
          {!compact && <span className="sm:hidden">{lang.nav.create}</span>}
        </span>
        {!compact && <ChevronDown className="h-3 w-3 text-white/80" />}
      </button>
      {open ? (
        <div className="absolute right-0 top-10 z-50 w-[180px] rounded-[12px] border border-[#262626] bg-[#171717] p-1.5 text-white shadow-[0_12px_32px_rgba(0,0,0,0.35)]">
          {[lang.nav.createTaxToken, lang.nav.createToken].map((item) => (
            <button
              key={item}
              type="button"
              className="flex h-12 w-full items-center justify-start gap-2 rounded-[8px] px-4 text-left transition-colors hover:bg-[#262626]"
              onClick={() => setOpen(false)}
            >
              <Plus className="h-3.5 w-3.5 shrink-0 text-white" strokeWidth={2.2} />
              <span className="truncate text-[12px] font-medium leading-[18px] text-white">{item}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LanguageSelectorButton() {
  const [open, setOpen] = useState(false);
  const { lang, languageCode, changeLang } = useLang();
  const isZh = languageCode === "zh";

  const handleChange = (language: typeof EN | typeof ZH) => {
    changeLang(language);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        className="flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[#404040] bg-transparent px-2 text-white transition-colors hover:bg-white/10"
        onClick={() => setOpen((value) => !value)}
        aria-label={lang.nav.language}
      >
        <Image src="/lang.svg" alt="" width={16} height={16} className="hidden h-4 w-4 opacity-80 sm:block" unoptimized />
        <span className="text-[12px] font-bold uppercase leading-[17px]">{isZh ? "ZH" : "EN"}</span>
        <ChevronDown className="h-3 w-3 text-white/60" />
      </button>
      {open ? (
        <div className="absolute right-0 top-10 z-[120] min-w-[96px] rounded-[12px] border border-[#262626] bg-[#171717] p-1.5 text-white shadow-[0_12px_32px_rgba(0,0,0,0.35)]">
          <button type="button" className="flex h-9 w-full items-center rounded-[8px] px-3 text-sm transition-colors hover:bg-[#262626]" onClick={() => handleChange(EN)}>
            EN
          </button>
          <button type="button" className="flex h-9 w-full items-center rounded-[8px] px-3 text-sm transition-colors hover:bg-[#262626]" onClick={() => handleChange(ZH)}>
            ZH
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MobileNavDropdown() {
  const [open, setOpen] = useState(false);
  const { lang } = useLang();
  const navItems = [
    { label: lang.nav.home, icon: "/logo.png" },
    { label: lang.nav.store, icon: ShoppingCart },
    { label: lang.nav.prelaunch, icon: "/logo.png" },
    { label: lang.nav.aiOracle, icon: Brain },
    { label: lang.nav.txInfo, icon: TrendingUp },
    { label: lang.nav.profile, icon: User },
  ];

  return (
    <>
      <button
        type="button"
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#262626] text-white/70 transition-colors hover:text-white md:hidden"
        aria-label="Open navigation"
        onClick={() => setOpen(true)}
      >
        <Menu className="h-4 w-4" />
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm md:hidden" onClick={() => setOpen(false)} />
          <div className="fixed left-0 top-0 z-[100] flex h-dvh min-h-dvh w-[80%] flex-col border-r border-white/10 bg-[#0d0d0d] shadow-2xl md:hidden">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
              <Link href="/" onClick={() => setOpen(false)} className="flex h-12 w-12 items-center justify-center" aria-label="Flap home">
                <Image src="/logo.png" alt="flap" width={48} height={48} className="h-12 w-12" priority />
              </Link>
              <button type="button" onClick={() => setOpen(false)} className="p-1 text-white/60 transition-colors hover:text-white" aria-label="Close navigation">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex flex-col gap-1 px-3 py-6">
              {navItems.map((item, index) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => setOpen(false)}
                    className={cn("flex w-full items-center gap-4 rounded-lg px-4 py-3 text-sm transition-colors", index === 0 ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white")}
                  >
                    {typeof Icon === "string" ? (
                      <Image src={Icon} alt={item.label} width={20} height={20} className="h-5 w-5" />
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                    <span className="text-[13px] uppercase">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </>
      ) : null}
    </>
  );
}

export function FlapNavbar({ manifest }: FlapNavbarProps) {
  return (
    <nav className="relative z-[80] flex h-[var(--nav)] w-full min-w-0 items-center justify-between gap-2 border-b border-[#262626] bg-[#0A0A0A] px-3 pb-[9px] pt-2 md:px-5">
      <div className="hidden shrink-0 items-center gap-1 md:flex">
        <Link href="/" className="text-2xl font-bold text-primary" aria-label="Flap home">
          <Image src="/logo.png" height={500} width={500} alt="flap" className="h-12 w-12" priority />
        </Link>
      </div>

      <div className="flex h-12 shrink-0 items-center gap-1 md:hidden">
        <MobileNavDropdown />
        <Link href="/" className="flex h-12 w-12 items-center justify-center text-2xl font-bold text-primary" aria-label="Flap home">
          <Image src="/logo.png" height={500} width={500} alt="flap" className="h-12 w-12" priority />
        </Link>
      </div>

      <div className="hidden min-w-0 items-center justify-end gap-3 md:flex">
        <SearchButton manifest={manifest} />
        <CreateTokenButton />
        <ChainSelectorButton />
        <LanguageSelectorButton />
        <div className="flex h-8 shrink-0 items-center overflow-visible">
          <WalletButton />
        </div>
      </div>

      <div className="flex h-8 min-w-0 items-center justify-end gap-2 md:hidden">
        <SearchButton compact manifest={manifest} />
        <CreateTokenButton compact />
        <ChainSelectorButton compact />
        <LanguageSelectorButton />
        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-visible rounded-lg bg-[#262626]">
          <WalletButton />
        </div>
      </div>
    </nav>
  );
}
