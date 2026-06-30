"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ChevronDown, Menu, Plus, Search, X } from "lucide-react";
import type { VaultManifest } from "@/src/sdk";
import EN from "@/res/content.json";
import ZH from "@/res/content_zh.json";
import { useLang } from "@/src/i18n/useLang";
import { cn } from "@/src/ui/utils";
import { Ui20FlapMarkIcon } from "./Ui20Icons";

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
          "flex shrink-0 items-center rounded-[6px] border border-[#303236] bg-black font-mono text-[#D4D4D4] transition-colors hover:border-[#D0FF00]",
          compact ? "h-9 w-9 justify-center p-0" : "h-10 w-[180px] justify-start gap-1.5 px-4 2xl:w-[240px]",
        )}
        aria-label="Search"
        onClick={() => setOpen((value) => !value)}
      >
        <Search className={compact ? "h-5 w-5" : "h-4 w-4"} strokeWidth={2} />
        {!compact && <span className="text-[12px] leading-[17px] text-[#84888C]">{lang.nav.search}</span>}
      </button>
      {open ? (
        <div className="absolute right-0 top-11 z-50 w-[min(320px,calc(100vw-2rem))] border border-[#303236] bg-[#070808] p-2 font-mono text-white shadow-none md:left-0 md:right-auto">
          <div className="flex h-10 items-center gap-2 border border-[#303236] bg-black px-3">
            <Search className="h-4 w-4 text-white/48" />
            <input
              autoFocus
              className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-white/32"
              placeholder={lang.nav.searchToken}
            />
          </div>
          <button
            type="button"
            className="group relative mt-2 flex h-[52px] w-full items-center justify-between px-3 text-left uppercase transition-colors hover:bg-[#131516] hover:text-[#D0FF00]"
            onClick={() => setOpen(false)}
          >
            <span className="absolute left-0 top-0 hidden h-full w-0.5 bg-[#D0FF00] group-hover:block" />
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
          "flex shrink-0 items-center justify-center rounded-[6px] border border-[#D0FF00] bg-[#D0FF00] font-mono font-extrabold uppercase text-black transition-colors hover:bg-[#BDE800]",
          compact ? "h-9 w-[118px] max-[375px]:w-[86px]" : "h-10 gap-1.5 px-4",
        )}
        aria-label="Create Token"
        onClick={() => setOpen((value) => !value)}
      >
        {!compact && <Plus className="h-3 w-3 shrink-0" strokeWidth={3} />}
        <span className={cn("font-bold", compact ? "text-[14px] leading-normal" : "text-[12px] leading-[17px]")}>
          <span className={compact ? "inline" : "hidden sm:inline"}>{compact ? lang.nav.create : lang.nav.createToken}</span>
          {!compact && <span className="sm:hidden">{lang.nav.create}</span>}
        </span>
        {!compact && <ChevronDown className="h-3 w-3 text-black/70" />}
      </button>
      {open ? (
        <div className="absolute right-0 top-11 z-50 w-[190px] border border-[#303236] bg-[#070808] p-0 font-mono text-white shadow-none">
          {[lang.nav.createTaxToken, lang.nav.createToken].map((item) => (
            <button
              key={item}
              type="button"
              className="group relative flex h-[60px] w-full items-center justify-start gap-2 border-b border-[#303236] px-4 text-left uppercase transition-colors last:border-b-0 hover:bg-[#131516] hover:text-[#D0FF00]"
              onClick={() => setOpen(false)}
            >
              <span className="absolute left-0 top-0 hidden h-full w-0.5 bg-[#D0FF00] group-hover:block" />
              <Plus className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />
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
        className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[6px] border border-[#303236] bg-black px-2 font-mono text-white transition-colors hover:border-[#D0FF00] md:h-10"
        onClick={() => setOpen((value) => !value)}
        aria-label={lang.nav.language}
      >
        <Image src="/lang.svg" alt="" width={16} height={16} className="hidden h-4 w-4 opacity-80 sm:block" unoptimized />
        <span className="text-[12px] font-bold uppercase leading-[17px]">{isZh ? "ZH" : "EN"}</span>
        <ChevronDown className="h-3 w-3 text-white/60" />
      </button>
      {open ? (
        <div className="absolute right-0 top-11 z-[120] min-w-[96px] border border-[#303236] bg-[#070808] p-0 font-mono text-white shadow-none">
          <button type="button" className="group relative flex h-[52px] w-full items-center border-b border-[#303236] px-4 text-sm transition-colors hover:bg-[#131516] hover:text-[#D0FF00]" onClick={() => handleChange(EN)}>
            <span className="absolute left-0 top-0 hidden h-full w-0.5 bg-[#D0FF00] group-hover:block" />
            EN
          </button>
          <button type="button" className="group relative flex h-[52px] w-full items-center px-4 text-sm transition-colors hover:bg-[#131516] hover:text-[#D0FF00]" onClick={() => handleChange(ZH)}>
            <span className="absolute left-0 top-0 hidden h-full w-0.5 bg-[#D0FF00] group-hover:block" />
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

  return (
    <>
      <button
        type="button"
        className="relative flex h-6 w-6 items-center justify-center bg-transparent text-white transition-colors hover:text-[#D0FF00] md:hidden"
        aria-label="Open navigation"
        onClick={() => setOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </button>
      {open ? (
        <>
          <div className="fixed inset-x-0 bottom-0 top-16 z-[90] bg-black/70 md:hidden" onClick={() => setOpen(false)} />
          <div className="fixed left-0 top-16 z-[100] flex h-[calc(100dvh-64px)] w-full flex-col bg-[#070808] font-mono shadow-none md:hidden">
            <div className="flex items-center justify-between border-b border-[#303236] px-6 py-4">
              <Link href="/" onClick={() => setOpen(false)} className="flex h-9 w-9 items-center justify-center" aria-label="Flap home">
                <Ui20FlapMarkIcon className="h-6 w-[26px] text-[#D0FF00]" />
              </Link>
              <button type="button" onClick={() => setOpen(false)} className="text-white transition-colors hover:text-[#D0FF00]" aria-label="Close navigation">
                <X className="h-6 w-6" />
              </button>
            </div>
            <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="group relative flex h-[61px] w-full shrink-0 items-center gap-4 border-b border-[#303236] bg-[#070808] px-6 text-left text-[16px] font-normal uppercase leading-normal text-[#D0FF00] transition-colors hover:bg-[#131516]"
              >
                <span className="absolute left-0 top-0 h-full w-0.5 bg-[#D0FF00]" />
                <Ui20FlapMarkIcon className="h-5 w-5 text-current" />
                <span className="text-[13px] uppercase">{lang.nav.home}</span>
              </button>
            </nav>
          </div>
        </>
      ) : null}
    </>
  );
}

export function FlapNavbar({ manifest }: FlapNavbarProps) {
  return (
    <nav className="relative z-[100] flex h-16 w-full min-w-0 items-center justify-between gap-2 border-b border-[#484B51] bg-black px-3 font-mono md:h-[68px] md:px-6">
      <div className="hidden shrink-0 items-center gap-3 md:flex">
        <Link href="/" className="flex h-10 w-10 items-center justify-center text-[#D0FF00]" aria-label="Flap home">
          <Image src="/logo.png" height={40} width={40} alt="flap" className="h-10 w-10" priority />
        </Link>
      </div>

      <div className="absolute left-3 top-[14px] flex h-9 w-[74px] items-center gap-3 md:hidden">
        <MobileNavDropdown />
        <Link href="/" className="flex h-6 w-[26px] items-center justify-center text-[#D0FF00]" aria-label="Flap home">
          <Ui20FlapMarkIcon className="h-6 w-[26px]" />
        </Link>
      </div>

      <div className="hidden min-w-0 items-center justify-end gap-2 md:flex 2xl:gap-4">
        <SearchButton manifest={manifest} />
        <CreateTokenButton />
        <ChainSelectorButton />
        <LanguageSelectorButton />
        <div className="flex h-10 shrink-0 items-center overflow-visible">
          <WalletButton />
        </div>
      </div>

      <div className="absolute right-3 top-[14px] h-9 w-[276px] md:hidden max-[375px]:w-[244px]">
        <div className="relative h-9 w-full">
          <div className="absolute left-0 top-0">
            <CreateTokenButton compact />
          </div>
          <div className="absolute left-[126px] top-0 max-[375px]:left-[94px]">
            <SearchButton compact manifest={manifest} />
          </div>
          <div className="absolute left-[170px] top-0 max-[375px]:left-[138px]">
            <ChainSelectorButton compact />
          </div>
          <div className="absolute left-[240px] top-0 flex h-9 w-9 shrink-0 items-center justify-center overflow-visible max-[375px]:left-[208px]">
            <WalletButton />
          </div>
        </div>
      </div>
    </nav>
  );
}
