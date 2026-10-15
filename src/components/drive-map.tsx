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

function cameraIcon(kind: SpeedCamera["kind"], maxspeed: number | null) {
  const bg = kind === "van" ? "#b45309" : "#b91c1c";
  const text = maxspeed != null ? String(maxspeed) : kind === "van" ? "VAN" : "CAM";
  return L.divIcon({
    className: "camcue-marker",
    html: `<div style="
      width:52px;height:52px;border-radius:999px;background:${bg};
      color:white;display:flex;align-items:center;justify-content:center;
      font:700 14px/1 Manrope,system-ui,sans-serif;border:3px solid white;
      box-shadow:0 8px 20px rgba(0,0,0,.35);
    ">${text}</div>`,
    iconSize: [52, 52],
    iconAnchor: [26, 26],
  });
}

export function DriveMap({
  center,
  cameras,
  heading,
}: {
  center: LatLng;
  cameras: SpeedCamera[];
  heading: number | null;
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
        radius={10}
        pathOptions={{ color: "#0f766e", fillColor: "#14b8a6", fillOpacity: 0.9 }}
      >
        <Popup>
          You are here
          {heading != null ? ` · heading ${Math.round(heading)}°` : ""}
        </Popup>
      </CircleMarker>
      {cameras.map((camera) => (
        <Marker
          key={camera.id}
          position={[camera.lat, camera.lng]}
          icon={cameraIcon(camera.kind, camera.maxspeed)}
        >
          <Popup>{camera.label}</Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
