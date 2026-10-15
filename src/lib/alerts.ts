import {
  bearingDegrees,
  formatDistance,
  haversineMeters,
  headingDelta,
  type LatLng,
} from "@/lib/geo";
import type { SpeedCamera } from "@/lib/cameras";

export type AlertLevel = "none" | "watch" | "near" | "critical";

export type CameraAlert = {
  camera: SpeedCamera;
  distanceM: number;
  level: AlertLevel;
  message: string;
};

export function rankNearbyCameras(
  position: LatLng,
  cameras: SpeedCamera[],
  heading: number | null,
  watchM = 1200,
  nearM = 450,
  criticalM = 180,
): CameraAlert[] {
  return cameras
    .map((camera) => {
      const target = { lat: camera.lat, lng: camera.lng };
      const distanceM = haversineMeters(position, target);
      let level: AlertLevel = "none";
      if (distanceM <= criticalM) level = "critical";
      else if (distanceM <= nearM) level = "near";
      else if (distanceM <= watchM) level = "watch";

      // Prefer cameras ahead of travel direction when heading is known
      if (
        level !== "none" &&
        heading != null &&
        headingDelta(heading, bearingDegrees(position, target)) > 95 &&
        distanceM > criticalM
      ) {
        // Behind you — demote unless very close
        if (level === "watch") level = "none";
        else if (level === "near") level = "watch";
      }

      const kindLabel = camera.kind === "van" ? "Mobile van" : "Fixed camera";
      const limit =
        camera.maxspeed != null ? ` · limit ${camera.maxspeed} km/h` : "";
      const message = `${kindLabel} in ${formatDistance(distanceM)}${limit}`;

      return { camera, distanceM, level, message };
    })
    .filter((a) => a.level !== "none")
    .sort((a, b) => a.distanceM - b.distanceM);
}

export function shouldWarnSpeed(
  speedKmh: number | null,
  nearest: CameraAlert | null,
  graceKmh = 3,
) {
  if (speedKmh == null || !nearest) return false;
  const limit = nearest.camera.maxspeed;
  if (limit == null) return nearest.level === "critical" && speedKmh > 50;
  return speedKmh > limit + graceKmh;
}

export function speakOnce(text: string, key: string, cooldownMs = 20000) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const stampKey = `camcue-voice-${key}`;
  const last = Number(sessionStorage.getItem(stampKey) || "0");
  if (Date.now() - last < cooldownMs) return;
  sessionStorage.setItem(stampKey, String(Date.now()));
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 1.05;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

/** Short attention beep — useful when voice is off or easy to miss. */
export function beepOnce(key: string, cooldownMs = 8000) {
  if (typeof window === "undefined") return;
  const stampKey = `camcue-beep-${key}`;
  const last = Number(sessionStorage.getItem(stampKey) || "0");
  if (Date.now() - last < cooldownMs) return;
  sessionStorage.setItem(stampKey, String(Date.now()));
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    osc.start(now);
    osc.stop(now + 0.3);
    osc.onended = () => void ctx.close();
  } catch {
    // Audio may be blocked until a user gesture — ignore.
  }
}
