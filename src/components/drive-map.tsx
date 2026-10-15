"use client";

import { useEffect } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import type { SpeedCamera } from "@/lib/cameras";
import type { LatLng } from "@/lib/geo";
import "leaflet/dist/leaflet.css";

function Recenter({ center }: { center: LatLng }) {
  const map = useMap();
  useEffect(() => {
    map.setView([center.lat, center.lng], map.getZoom(), { animate: true });
  }, [center.lat, center.lng, map]);
  return null;
}

function cameraIcon(
  kind: SpeedCamera["kind"],
  maxspeed: number | null,
  alertLevel: "none" | "watch" | "near" | "critical" = "none",
) {
  const bg = kind === "van" ? "#b45309" : "#b91c1c";
  const text = maxspeed != null ? String(maxspeed) : kind === "van" ? "VAN" : "CAM";
  const size = alertLevel === "critical" || alertLevel === "near" ? 72 : 58;
  const pulse =
    alertLevel === "critical" || alertLevel === "near"
      ? "animation:camcue-pulse 1.1s ease-out infinite;"
      : "";
  const ring =
    alertLevel === "critical"
      ? "box-shadow:0 0 0 10px rgba(185,28,28,.28),0 10px 24px rgba(0,0,0,.4);"
      : alertLevel === "near"
        ? "box-shadow:0 0 0 8px rgba(180,83,9,.22),0 10px 22px rgba(0,0,0,.35);"
        : "box-shadow:0 8px 20px rgba(0,0,0,.35);";
  return L.divIcon({
    className: "camcue-marker",
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:999px;background:${bg};
      color:white;display:flex;align-items:center;justify-content:center;
      font:800 ${size >= 72 ? 18 : 15}px/1 Manrope,system-ui,sans-serif;border:4px solid white;
      ${ring}${pulse}
    ">${text}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export function DriveMap({
  center,
  cameras,
  heading,
  alertById = {},
}: {
  center: LatLng;
  cameras: SpeedCamera[];
  heading: number | null;
  alertById?: Record<string, "watch" | "near" | "critical">;
}) {
  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={15}
      className="h-full w-full rounded-2xl"
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Recenter center={center} />
      <CircleMarker
        center={[center.lat, center.lng]}
        radius={12}
        pathOptions={{ color: "#0f766e", fillColor: "#14b8a6", fillOpacity: 0.95, weight: 3 }}
      >
        <Popup>
          You are here
          {heading != null ? ` · heading ${Math.round(heading)}°` : ""}
        </Popup>
      </CircleMarker>
      {cameras.map((camera) => {
        const level = alertById[camera.id] ?? "none";
        return (
          <Marker
            key={camera.id}
            position={[camera.lat, camera.lng]}
            icon={cameraIcon(camera.kind, camera.maxspeed, level)}
            zIndexOffset={level === "critical" ? 1000 : level === "near" ? 800 : 0}
          >
            <Popup>{camera.label}</Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
