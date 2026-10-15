import type { LatLng } from "@/lib/geo";

export type CameraKind = "fixed" | "van";

export type SpeedCamera = {
  id: string;
  kind: CameraKind;
  lat: number;
  lng: number;
  maxspeed: number | null;
  label: string;
  source: "osm" | "local" | "seed" | "bundle";
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

function mapElements(elements: OverpassElement[]): SpeedCamera[] {
  const cameras: SpeedCamera[] = [];
  for (const el of elements) {
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
}

function withinRadius(center: LatLng, camera: SpeedCamera, radiusM: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(camera.lat - center.lat);
  const dLng = toRad(camera.lng - center.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(center.lat)) *
      Math.cos(toRad(camera.lat)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a))) <= radiusM;
}

/** Offline seed so demo still works if every network path fails. */
export const BRUSSELS_SEED: SpeedCamera[] = [
  {
    id: "seed-bxl-1",
    kind: "fixed",
    lat: 50.85045,
    lng: 4.3548,
    maxspeed: 50,
    label: "Fixed camera · 50 km/h",
    source: "seed",
  },
  {
    id: "seed-bxl-2",
    kind: "fixed",
    lat: 50.8491,
    lng: 4.3582,
    maxspeed: 30,
    label: "Fixed camera · 30 km/h",
    source: "seed",
  },
  {
    id: "seed-bxl-3",
    kind: "fixed",
    lat: 50.8522,
    lng: 4.3615,
    maxspeed: 50,
    label: "Fixed camera · 50 km/h",
    source: "seed",
  },
  {
    id: "seed-bxl-4",
    kind: "van",
    lat: 50.8486,
    lng: 4.3489,
    maxspeed: null,
    label: "Mobile camera van (seed)",
    source: "seed",
  },
  {
    id: "seed-bxl-5",
    kind: "fixed",
    lat: 50.8468,
    lng: 4.3524,
    maxspeed: 70,
    label: "Fixed camera · 70 km/h",
    source: "seed",
  },
];

function seedNear(center: LatLng): SpeedCamera[] {
  const dLat = center.lat - 50.8503;
  const dLng = center.lng - 4.3517;
  if (Math.hypot(dLat, dLng) < 0.08) return BRUSSELS_SEED;
  return BRUSSELS_SEED.map((c, i) => ({
    ...c,
    id: `seed-local-${i}`,
    lat: center.lat + (c.lat - 50.8503),
    lng: center.lng + (c.lng - 4.3517),
  }));
}

async function loadBundledCameras(
  center: LatLng,
  radiusMeters: number,
): Promise<SpeedCamera[]> {
  try {
    const base =
      typeof window !== "undefined" ? window.location.pathname.replace(/\/$/, "") : "";
    // Works for both `/` local and `/camcue/` GitHub Pages basePath.
    const candidates = [
      `${base}/data/brussels-cameras.json`,
      `/data/brussels-cameras.json`,
      `./data/brussels-cameras.json`,
    ];
    for (const path of candidates) {
      try {
        const res = await fetch(path, { cache: "force-cache" });
        if (!res.ok) continue;
        const data = (await res.json()) as {
          cameras?: SpeedCamera[];
        };
        const all = (data.cameras ?? []).map((c) => ({
          ...c,
          source: "bundle" as const,
        }));
        const nearby = all.filter((c) => withinRadius(center, c, radiusMeters));
        if (nearby.length > 0) return nearby;
        // Bundle is Brussels-focused; if user is far away, skip.
        if (Math.hypot(center.lat - 50.8503, center.lng - 4.3517) > 0.25) {
          return [];
        }
        return all.slice(0, 80);
      } catch {
        // try next path
      }
    }
  } catch {
    // ignore
  }
  return [];
}

async function fetchOverpass(
  center: LatLng,
  radiusMeters: number,
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
    "https://overpass.openstreetmap.fr/api/interpreter",
    "https://overpass-api.de/api/interpreter",
  ];

  for (const endpoint of endpoints) {
    try {
      const url = `${endpoint}?data=${encodeURIComponent(query)}`;
      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { elements?: OverpassElement[] };
      const cameras = mapElements(data.elements ?? []);
      if (cameras.length) return cameras;
    } catch {
      // CORS / network — fall through
    }
  }
  return [];
}

export async function fetchFixedCamerasAround(
  center: LatLng,
  radiusMeters = 8000,
): Promise<SpeedCamera[]> {
  // Same-origin bundled OSM extract first (GitHub Pages safe).
  const bundled = await loadBundledCameras(center, radiusMeters);
  if (bundled.length > 0) return bundled;

  // Live Overpass when the browser can reach a CORS-friendly mirror.
  const live = await fetchOverpass(center, radiusMeters);
  if (live.length > 0) return live;

  return seedNear(center);
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
