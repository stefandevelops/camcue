import type { LatLng } from "@/lib/geo";

export type CameraKind = "fixed" | "van";

export type SpeedCamera = {
  id: string;
  kind: CameraKind;
  lat: number;
  lng: number;
  maxspeed: number | null;
  label: string;
  source: "osm" | "local";
  notedAt?: string;
};

type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

function parseMaxspeed(raw?: string): number | null {
  if (!raw) return null;
  const match = raw.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

export async function fetchFixedCamerasAround(
  center: LatLng,
  radiusMeters = 8000,
): Promise<SpeedCamera[]> {
  const query = `
[out:json][timeout:25];
(
  node["highway"="speed_camera"](around:${radiusMeters},${center.lat},${center.lng});
  node["enforcement"="maxspeed"](around:${radiusMeters},${center.lat},${center.lng});
);
out body;
`;

  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ];

  let lastError: Error | null = null;
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      const data = (await res.json()) as { elements?: OverpassElement[] };
      const cameras: SpeedCamera[] = [];
      for (const el of data.elements ?? []) {
        const lat = el.lat ?? el.center?.lat;
        const lng = el.lon ?? el.center?.lon;
        if (lat == null || lng == null) continue;
        const maxspeed = parseMaxspeed(el.tags?.maxspeed);
        cameras.push({
          id: `osm-${el.type}-${el.id}`,
          kind: "fixed",
          lat,
          lng,
          maxspeed,
          label: maxspeed
            ? `Fixed camera · ${maxspeed} km/h`
            : "Fixed speed camera",
          source: "osm",
        });
      }
      return cameras;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error("Overpass failed");
    }
  }
  throw lastError ?? new Error("Could not load camera data");
}

const VAN_KEY = "camcue-van-reports-v1";

export function loadVanReports(): SpeedCamera[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(VAN_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SpeedCamera[];
  } catch {
    return [];
  }
}

export function saveVanReports(vans: SpeedCamera[]) {
  localStorage.setItem(VAN_KEY, JSON.stringify(vans));
}

export function addVanReport(at: LatLng, note?: string): SpeedCamera {
  const vans = loadVanReports();
  const van: SpeedCamera = {
    id: `van-${Date.now()}`,
    kind: "van",
    lat: at.lat,
    lng: at.lng,
    maxspeed: null,
    label: note?.trim() || "Mobile camera van (reported)",
    source: "local",
    notedAt: new Date().toISOString(),
  };
  const next = [van, ...vans].slice(0, 80);
  saveVanReports(next);
  return van;
}

export function clearOldVans(maxAgeHours = 24) {
  const cutoff = Date.now() - maxAgeHours * 3600 * 1000;
  const vans = loadVanReports().filter((v) => {
    if (!v.notedAt) return true;
    return new Date(v.notedAt).getTime() >= cutoff;
  });
  saveVanReports(vans);
  return vans;
}
