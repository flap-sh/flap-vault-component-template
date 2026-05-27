"use client";

import dynamic from "next/dynamic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useState } from "react";
import { LangProvider } from "@/src/i18n/LangContext";
import type { LanguageCode } from "@/src/i18n/languagePreference";

const DynamicWalletRuntimeProviders = dynamic(() => import("./WalletRuntimeProviders").then((module) => module.WalletRuntimeProviders), {
  ssr: false,
});

export function FlapPreviewProviders({
  children,
  hasInitialLanguageCookie,
  initialLanguageCode,
}: {
  children: ReactNode;
  hasInitialLanguageCookie?: boolean;
  initialLanguageCode?: LanguageCode;
}) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <LangProvider hasInitialLanguageCookie={hasInitialLanguageCookie} initialLanguageCode={initialLanguageCode}>
        <DynamicWalletRuntimeProviders>{children}</DynamicWalletRuntimeProviders>
      </LangProvider>
    </QueryClientProvider>
  );
}
