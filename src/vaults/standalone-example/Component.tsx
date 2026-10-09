"use client";
import { useMiniAppSdk } from "@/src/sdk";
export default function Component() {
  const { session, i18n } = useMiniAppSdk();
  return <div className="min-h-screen w-full p-6">
    <h1 className="text-2xl font-semibold">{i18n.t("title")}</h1>
    <p className="mt-4 text-white/60">{i18n.t("description")}</p>
    <p className="mt-4 break-all">{session.isConnected ? session.address : i18n.t("guest")}</p>
    <p className="mt-4">{session.isAuthenticated ? i18n.t("connected") : i18n.t("guest")}</p>
  </div>;
}
