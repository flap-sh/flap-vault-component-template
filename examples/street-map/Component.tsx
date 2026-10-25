"use client";
import { useMemo, useState } from "react";
import { useFlapI18n, useGeolocation } from "@/src/sdk";
import {
  Button, FlapStreetMap, STREET_MAP_PRESENTATION_V1,
  type FlapStreetMapCoordinate, type FlapStreetMapPoint, type FlapStreetMapState,
} from "@/src/ui";

function countdown(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 3600).toString().padStart(2, "0")}:${Math.floor(seconds / 60 % 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

/** Copy with i18n.json and the manifest fragment; requires the enhanced testing Runtime. */
export default function StreetMapExample() {
  const { t } = useFlapI18n();
  const location = useGeolocation();
  const [demoNow] = useState(() => Date.now());
  const [center, setCenter] = useState<FlapStreetMapCoordinate>({ lat: 35, lng: 116 });
  const [zoom, setZoom] = useState(5);
  const [state, setState] = useState<FlapStreetMapState>({ status: "loading" });
  const [selected, setSelected] = useState<string | null>(null);
  // Example data, not inventory or claim authorization. All deadlines are epoch milliseconds.
  const points = useMemo<FlapStreetMapPoint[]>(() => [
    { id: "sh-common", lat: 31.2304, lng: 121.4737, title: t("map.shopCommon"), symbol: "CATCH", rarity: "common", place: t("map.placePeople"), city: t("map.cityShanghai"), amount: "10", expiresAt: demoNow + 86400000, respawnAt: demoNow - 1000, kind: "store" },
    { id: "sh-rare", lat: 31.228, lng: 121.48, title: t("map.shopRareActive"), symbol: "CATCH", rarity: "rare", place: t("map.placePeople"), city: t("map.cityShanghai"), amount: "25", expiresAt: demoNow + 86400000, respawnAt: demoNow - 1000, kind: "store" },
    { id: "bj-epic", lat: 39.915, lng: 116.41, title: t("map.shopEpicActive"), symbol: "CATCH", rarity: "epic", place: t("map.placeWangfujing"), city: t("map.cityBeijing"), amount: "50", expiresAt: demoNow + 86400000, respawnAt: demoNow - 1000, kind: "store" },
    { id: "sh-cooldown", lat: 31.235, lng: 121.482, title: t("map.shopRare"), symbol: "CATCH", rarity: "rare", place: t("map.placeNanjing"), city: t("map.cityShanghai"), amount: "25", expiresAt: demoNow + 86400000, respawnAt: demoNow + 1800000, kind: "store" },
    { id: "sh-expired", lat: 31.223, lng: 121.469, title: t("map.shopEpic"), symbol: "CATCH", rarity: "epic", place: t("map.placeHuaihai"), city: t("map.cityShanghai"), amount: "50", expiresAt: demoNow - 1000, respawnAt: demoNow - 1000, kind: "store" },
    // Legendary rarity alone is still an ordinary store, included in its city bubble.
    { id: "bj-legendary-store", lat: 39.9087, lng: 116.3975, title: t("map.shopLegendary"), symbol: "CATCH", rarity: "legendary", place: t("map.placeWangfujing"), city: t("map.cityBeijing"), amount: "100", expiresAt: demoNow + 86400000, respawnAt: demoNow - 1000, kind: "store" },
    // kind:event selects the separate event layer regardless of rarity.
    { id: "sh-event", lat: 31.24, lng: 121.49, title: t("map.event"), symbol: "CATCH", rarity: "legendary", place: t("map.placeBund"), city: t("map.cityShanghai"), amount: "1000", expiresAt: demoNow + 3600000, respawnAt: demoNow - 1000, kind: "event" },
  ], [demoNow, t]);
  const userLocation = location.status === "active" && location.data
    && Math.abs(location.data.latitude) <= 85.051129
    ? { lat: location.data.latitude, lng: location.data.longitude } : null;
  const locate = async () => {
    const result = await location.request({ enableHighAccuracy: true, maximumAge: 0, timeoutMs: 10000 });
    if (result.status === "active" && result.data && Math.abs(result.data.latitude) <= 85.051129) {
      setCenter({ lat: result.data.latitude, lng: result.data.longitude });
      setZoom(12);
    }
  };
  const choose = (point: FlapStreetMapPoint) => {
    setSelected(point.id);
    setCenter({ lat: point.lat, lng: point.lng });
    setZoom(12);
  };
  const list = <ul className="flex flex-wrap gap-2">{points.map((point) => <li key={point.id}>
    <Button variant="outline" onClick={() => choose(point)}>{point.title}</Button>
  </li>)}</ul>;
  const yesNo = (value: boolean | null) => t(value === null ? "map.unknown" : value ? "map.yes" : "map.no");
  const timestamp = (value: number | undefined) => value === undefined ? t("map.noDeadline") : new Date(value).toISOString();

  return <section className="min-h-screen w-full space-y-4" data-map-presentation={STREET_MAP_PRESENTATION_V1}>
    <p className="text-sm text-muted-foreground">{t("map.demo")}</p>
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => void locate()} disabled={location.status === "requesting"}>
        {t(location.status === "requesting" ? "map.locating" : "map.locate")}
      </Button>
      <Button variant="outline" onClick={() => setSelected(null)} disabled={selected === null}>{t("map.clearSelection")}</Button>
    </div>
    <p className="text-sm">{t(location.mode === "mock" ? "map.locationMock" : location.status === "active" ? "map.locationActive" : "map.locationOptional")}</p>
    {location.status === "active" && location.data && <p className="text-xs text-muted-foreground">
      {t("map.accuracy")}: {Math.round(location.data.accuracy)} {t("map.meters")} · {t("map.sampleTime")}: {timestamp(location.data.timestamp)}
    </p>}
    {state.status !== "ready" && <p role="status">{t("map.fallback")}</p>}
    <FlapStreetMap
      points={points} center={center} zoom={zoom} userLocation={userLocation} claimRadiusMeters={200}
      cityClusters showPointLabels showEventCountdowns showNavigation showScale
      rarityColors={{ common: "#22c55e", rare: "#3b82f6", epic: "#a855f7", legendary: "#fbbf24" }}
      controlLabels={{ zoomIn: t("map.zoomIn"), zoomOut: t("map.zoomOut"), resetBearing: t("map.resetBearing"), closeDetails: t("map.closeDetails") }}
      selectedPointId={selected}
      onSelectionChange={(point) => setSelected(point?.id ?? null)}
      onStateChange={setState} fallback={list}
      renderPointDetails={(point, details) => <section className="space-y-3">
        <h2 className="font-semibold">{point.title}</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm [&>dd]:min-w-0 [&>dd]:break-words">
          <dt>{t("map.id")}</dt><dd>{point.id}</dd>
          <dt>{t("map.symbol")}</dt><dd>{point.symbol ?? t("map.unknown")}</dd>
          <dt>{t("map.kind")}</dt><dd>{t(point.kind === "event" ? "map.eventKind" : "map.storeKind")}</dd>
          <dt>{t("map.rarity")}</dt><dd>{t(`map.rarity.${point.rarity ?? "common"}`)}</dd>
          <dt>{t("map.amount")}</dt><dd>{point.amount ?? t("map.unknown")}</dd>
          <dt>{t("map.place")}</dt><dd>{point.place ?? point.title}</dd>
          <dt>{t("map.city")}</dt><dd>{point.city ?? t("map.unknown")}</dd>
          <dt>{t("map.coordinates")}</dt><dd>{point.lat.toFixed(6)}, {point.lng.toFixed(6)}</dd>
          <dt>{t("map.distance")}</dt><dd>{details.distanceMeters === null ? t("map.unknown") : `${Math.round(details.distanceMeters)} ${t("map.meters")}`}</dd>
          <dt>{t("map.radius")}</dt><dd>{details.claimRadiusMeters === null ? t("map.unknown") : `${details.claimRadiusMeters} ${t("map.meters")}`}</dd>
          <dt>{t("map.withinRadius")}</dt><dd>{yesNo(details.withinDisplayRadius)}</dd>
          <dt>{t("map.coolingDown")}</dt><dd>{yesNo(details.coolingDown)}</dd>
          <dt>{t("map.cooldownRemaining")}</dt><dd>{countdown(details.cooldownRemainingMs)}</dd>
          <dt>{t("map.respawnAt")}</dt><dd>{timestamp(point.respawnAt)}</dd>
          <dt>{t("map.expired")}</dt><dd>{yesNo(details.expired)}</dd>
          <dt>{t("map.expiresAt")}</dt><dd>{timestamp(point.expiresAt)}</dd>
          <dt>{t("map.eventRemaining")}</dt><dd>{details.eventRemainingMs === null ? t("map.noDeadline") : countdown(details.eventRemainingMs)}</dd>
          <dt>{t("map.displayClock")}</dt><dd>{timestamp(details.nowMs)}</dd>
        </dl>
        <p className="text-xs text-muted-foreground">{t("map.displayOnly")}</p>
        <Button variant="outline" onClick={details.close}>{t("map.closeDetails")}</Button>
      </section>}
    />
    {state.status === "ready" && list}
  </section>;
}
