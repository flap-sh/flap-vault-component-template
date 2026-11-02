"use client";
import { useState } from "react";
import { useMiniAppRouter, useMiniAppSdk } from "@/src/sdk";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/src/ui";
export default function Component() {
  const { i18n } = useMiniAppSdk();
  const route = useMiniAppRouter();
  const [count, setCount] = useState(0);
  const isItem = route.segments.length === 2 && route.segments[0] === "items";
  return <div className="min-h-screen w-full p-6">
    <Card>
      <CardHeader><CardTitle>{i18n.t("title")}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p>{route.pathname === "/" ? i18n.t("home") : isItem ? i18n.t("item", undefined, { id: route.segments[1] }) : route.pathname === "/settings" ? i18n.t("settings") : i18n.t("notFound")}</p>
        <p className="break-all text-sm text-white/60">{route.pathname}{route.search}</p>
        <Button onClick={() => setCount(value => value + 1)}>{i18n.t("counter", undefined, { count })}</Button>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => route.push("/items/first?tab=details")}>{i18n.t("open")}</Button>
          <Button variant="secondary" onClick={() => route.replace("/items/second?tab=history")}>{i18n.t("replace")}</Button>
          <Button variant="secondary" onClick={() => route.back()}>{i18n.t("back")}</Button>
          <Button variant="secondary" onClick={() => route.push("/")}>{i18n.t("root")}</Button>
          <Button variant="secondary" onClick={() => route.push("/settings")}>{i18n.t("settings")}</Button>
        </div>
      </CardContent>
    </Card>
  </div>;
}
