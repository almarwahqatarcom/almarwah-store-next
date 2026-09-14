"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker as LeafletMarker } from "leaflet";
import { useLanguage } from "@/lib/store/language";

// A real, click-or-drag interactive map — not just a "use my current GPS
// position" shortcut, which can't help someone setting a DIFFERENT
// location (an office, a relative's place) than wherever they happen to
// be standing right now. Built on Leaflet + OpenStreetMap tiles rather
// than Google Maps: this app deliberately has no client-side Google Maps
// key at all (the one Maps API key it does use, for delivery-distance
// pricing, is kept server-side only — see getDistanceKm() in api.ts), and
// OSM's raw tile server is the standard, no-signup way to get a real
// interactive map for a site at this scale, with proper attribution shown
// on the map itself.
const DEFAULT_CENTER: [number, number] = [25.2854, 51.531]; // Doha, Qatar

export default function MapLocationPicker({
  latitude,
  longitude,
  onChange,
}: {
  latitude?: string;
  longitude?: string;
  onChange: (lat: string, lng: string) => void;
}) {
  const { t } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const onChangeRef = useRef(onChange);
  const [locating, setLocating] = useState(false);
  const [ready, setReady] = useState(false);

  // Keeps the map's event handlers (bound once, below) always calling the
  // latest onChange without needing the whole map to be torn down and
  // rebuilt every time a parent re-renders with a new function identity —
  // done in an effect (not directly in the render body) since mutating a
  // ref is a side effect, not something render itself should do.
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      // Leaflet's default marker icon resolves its image paths relative to
      // the CSS file's own location, which breaks once bundled — pointing
      // them at the same unpkg CDN copy the CSS convention expects is the
      // standard workaround for this exact issue under any bundler.
      delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const startLat = latitude ? Number(latitude) : DEFAULT_CENTER[0];
      const startLng = longitude ? Number(longitude) : DEFAULT_CENTER[1];

      const map = L.map(containerRef.current).setView([startLat, startLng], latitude ? 15 : 11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      }).addTo(map);

      const marker = L.marker([startLat, startLng], { draggable: true }).addTo(map);
      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        onChangeRef.current(String(pos.lat), String(pos.lng));
      });
      map.on("click", (e) => {
        marker.setLatLng(e.latlng);
        onChangeRef.current(String(e.latlng.lat), String(e.latlng.lng));
      });

      mapRef.current = map;
      markerRef.current = marker;
      setReady(true);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Intentionally mount once — re-creating the whole map on every
    // latitude/longitude change (e.g. from the marker's own drag) would
    // fight the user mid-drag. The initial position is read once above;
    // after that, the map is the source of truth until unmounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function useMyLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        mapRef.current?.setView([lat, lng], 16);
        markerRef.current?.setLatLng([lat, lng]);
        onChangeRef.current(String(lat), String(lng));
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <div>
      <label className="block text-[11px] font-bold text-am-primary-dark uppercase tracking-wide mb-1.5">{t("checkoutAuth.pickLocation")}</label>
      <div ref={containerRef} className="w-full h-[220px] rounded-xl overflow-hidden border border-am-border bg-am-bg relative z-0" />
      <div className="flex items-center justify-between gap-2 mt-2">
        <p className="text-[11px] text-am-text-faint leading-relaxed">{t("checkoutAuth.mapHint")}</p>
        <button
          type="button"
          onClick={useMyLocation}
          disabled={!ready || locating}
          className="shrink-0 flex items-center gap-1.5 text-[12px] font-bold px-3 py-2 rounded-full border border-am-border text-am-text hover:border-am-primary disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {locating ? "⏳" : "📍"} {t("checkoutAuth.useMyLocation")}
        </button>
      </div>
    </div>
  );
}
