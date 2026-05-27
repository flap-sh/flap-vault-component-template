"use client";

import dynamic from "next/dynamic";
import { useLang } from "@/src/i18n/useLang";

const DynamicVaultPreviewClient = dynamic(() => import("./VaultPreviewClient").then((module) => module.VaultPreviewClient), {
  ssr: false,
  loading: () => <PreviewLoading />,
});

function PreviewLoading() {
  const { lang } = useLang();
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="rounded-md border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/60">{lang.preview.loading}</div>
    </main>
  );
}

export function VaultPreviewClientNoSsr({ folderName }: { folderName: string }) {
  return <DynamicVaultPreviewClient folderName={folderName} />;
}
