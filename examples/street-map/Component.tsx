"use client";
import { useMemo, useState } from "react";
import { useFlapI18n, useGeolocation } from "@/src/sdk";
import { Button, FlapStreetMap, type FlapStreetMapPoint, type FlapStreetMapState } from "@/src/ui";

/** Copy into a checked Vault/Mini App source directory with the manifest fragment. */
export default function StreetMapExample() {
  const { t } = useFlapI18n();
  const location = useGeolocation();
  const [state, setState] = useState<FlapStreetMapState>({ status: "loading" });
  const [selected, setSelected] = useState<string | null>(null);
  const points = useMemo<FlapStreetMapPoint[]>(() => [
    { id: "shanghai-shop", lat: 31.2304, lng: 121.4737, title: t("map.shop"), rarity: "rare" },
  ], [t]);
  const userLocation = location.status === "active" && location.data
    ? { lat: location.data.latitude, lng: location.data.longitude } : null;
  const list = <ul>{points.map((point) => <li key={point.id}><Button onClick={() => setSelected(point.id)}>{point.title}</Button></li>)}</ul>;
  return <section>
    <Button onClick={() => void location.request({ enableHighAccuracy: false })}>{t("map.locate")}</Button>
    <p>{t(location.status === "active" ? "map.locationActive" : "map.locationOptional")}</p>
    {state.status !== "ready" && <p role="status">{t("map.fallback")}</p>}
    <FlapStreetMap points={points} userLocation={userLocation} onSelectPoint={setSelected} onStateChange={setState} fallback={list} />
    {selected && <p>{points.find((point) => point.id === selected)?.title}</p>}
    {state.status === "ready" && list}
  </section>;
}
