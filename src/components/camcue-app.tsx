"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addVanReport,
  clearOldVans,
  fetchFixedCamerasAround,
  type SpeedCamera,
} from "@/lib/cameras";
import {
  beepOnce,
  rankNearbyCameras,
  shouldWarnSpeed,
  speakOnce,
  type CameraAlert,
} from "@/lib/alerts";
import { formatDistance, msToKmh, type LatLng } from "@/lib/geo";

/** Brussels — start ~350 m west of a dense OSM camera cluster so the demo hits alerts fast. */
const DEMO_CENTER: LatLng = { lat: 50.82594, lng: 4.39195 };

const DriveMap = dynamic(
  () => import("@/components/drive-map").then((m) => m.DriveMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center rounded-2xl bg-black/5 text-[var(--muted)]">
        Loading map…
      </div>
    ),
  },
);

type Status = "idle" | "locating" | "live" | "denied" | "error";

export function CamCueApp() {
  const [status, setStatus] = useState<Status>("idle");
  const [position, setPosition] = useState<LatLng | null>(null);
  const [speedKmh, setSpeedKmh] = useState<number | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [fixedCams, setFixedCams] = useState<SpeedCamera[]>([]);
  const [vanCams, setVanCams] = useState<SpeedCamera[]>([]);
  const [loadingCams, setLoadingCams] = useState(false);
  const [camError, setCamError] = useState("");
  const [voiceOn, setVoiceOn] = useState(true);
  const [demoMode, setDemoMode] = useState(false);
  const [error, setError] = useState("");
  const watchRef = useRef<number | null>(null);
  const lastFetchRef = useRef<LatLng | null>(null);
  const demoTimerRef = useRef<number | null>(null);

  const cameras = useMemo(() => [...fixedCams, ...vanCams], [fixedCams, vanCams]);

  const nearby = useMemo(() => {
    if (!position) return [] as CameraAlert[];
    return rankNearbyCameras(position, cameras, heading);
  }, [position, cameras, heading]);

  const nearest = nearby[0] ?? null;
  const overLimit = shouldWarnSpeed(speedKmh, nearest);

  const alertById = useMemo(() => {
    const map: Record<string, "watch" | "near" | "critical"> = {};
    for (const item of nearby) {
      if (item.level === "none") continue;
      map[item.camera.id] = item.level;
    }
    return map;
  }, [nearby]);

  const refreshCameras = useCallback(async (at: LatLng, force = false) => {
    const prev = lastFetchRef.current;
    if (
      !force &&
      prev &&
      Math.hypot(at.lat - prev.lat, at.lng - prev.lng) < 0.015
    ) {
      return;
    }
    setLoadingCams(true);
    setCamError("");
    try {
      const fixed = await fetchFixedCamerasAround(at, 9000);
      setFixedCams(fixed);
      lastFetchRef.current = at;
    } catch (err) {
      setCamError(
        err instanceof Error
          ? err.message
          : "Could not load fixed cameras from OpenStreetMap.",
      );
    } finally {
      setLoadingCams(false);
    }
  }, []);

  useEffect(() => {
    setVanCams(clearOldVans(24));
    return () => {
      if (watchRef.current != null) {
        navigator.geolocation.clearWatch(watchRef.current);
      }
      if (demoTimerRef.current != null) {
        window.clearInterval(demoTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!nearest) return;
    if (nearest.level === "near" || nearest.level === "critical") {
      beepOnce(`${nearest.camera.id}-${nearest.level}`);
      if (voiceOn) {
        const limit =
          nearest.camera.maxspeed != null
            ? ` Speed limit ${nearest.camera.maxspeed} kilometers per hour.`
            : "";
        speakOnce(
          `${nearest.camera.kind === "van" ? "Mobile speed camera" : "Speed camera"} ahead in ${Math.round(nearest.distanceM)} meters.${limit} Check your speed.`,
          `${nearest.camera.id}-${nearest.level}`,
        );
      }
    }
    if (overLimit && nearest.camera.maxspeed != null) {
      beepOnce(`overspeed-${nearest.camera.id}`, 12000);
      if (voiceOn) {
        speakOnce(
          `You are above the camera limit. Slow down to ${nearest.camera.maxspeed}.`,
          `overspeed-${nearest.camera.id}`,
          15000,
        );
      }
    }
  }, [nearest, overLimit, voiceOn]);

  function stopDemo() {
    if (demoTimerRef.current != null) {
      window.clearInterval(demoTimerRef.current);
      demoTimerRef.current = null;
    }
    setDemoMode(false);
  }

  function startDemo() {
    if (watchRef.current != null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    stopDemo();
    setDemoMode(true);
    setStatus("live");
    setError("");
    setHeading(90);
    setSpeedKmh(58);
    setPosition(DEMO_CENTER);
    void refreshCameras(DEMO_CENTER, true);

    let step = 0;
    demoTimerRef.current = window.setInterval(() => {
      step += 1;
      // Drift east toward the camera cluster (~350 m ahead at start).
      const next = {
        lat: DEMO_CENTER.lat + Math.sin(step / 20) * 0.0004,
        lng: DEMO_CENTER.lng + step * 0.00018,
      };
      setPosition(next);
      setSpeedKmh(48 + (step % 7) * 3);
      setHeading(90 + Math.sin(step / 10) * 6);
      void refreshCameras(next);
    }, 1600);
  }

  function startTracking() {
    if (!navigator.geolocation) {
      setStatus("error");
      setError("Geolocation is not available in this browser.");
      return;
    }
    stopDemo();
    if (watchRef.current != null) {
      navigator.geolocation.clearWatch(watchRef.current);
    }
    setStatus("locating");
    setError("");

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPosition(next);
        setSpeedKmh(msToKmh(pos.coords.speed));
        setHeading(
          pos.coords.heading != null && !Number.isNaN(pos.coords.heading)
            ? pos.coords.heading
            : null,
        );
        setStatus("live");
        void refreshCameras(next);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setStatus("denied");
        else {
          setStatus("error");
          setError(err.message || "Could not get location.");
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 15000,
      },
    );
  }

  function reportVan() {
    if (!position) return;
    const van = addVanReport(position, "Mobile van spotted");
    setVanCams((prev) => [van, ...prev.filter((v) => v.id !== van.id)]);
    speakOnce("Mobile camera van saved at your location.", "van-saved", 5000);
  }

  const alertTone =
    overLimit || nearest?.level === "critical"
      ? "critical"
      : nearest?.level === "near"
        ? "near"
        : nearest?.level === "watch"
          ? "watch"
          : "idle";

  return (
    <main className="mx-auto flex min-h-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
            CamCue
          </p>
          <h1 className="mt-2 max-w-2xl font-[family-name:var(--font-display)] text-4xl tracking-tight sm:text-5xl">
            Big alerts for speed cameras — so you notice before it&apos;s too late
          </h1>
          <p className="mt-3 max-w-2xl text-[var(--muted)]">
            Fixed cameras from OpenStreetMap. Mobile vans you can mark yourself.
            Loud, clear cues when you&apos;re approaching — a nudge to check the
            speedometer, not a license to speed.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {status !== "live" ? (
            <>
              <button
                type="button"
                onClick={() => startTracking()}
                className="rounded-xl bg-[var(--accent)] px-4 py-2.5 font-medium text-white"
              >
                Start driving mode
              </button>
              <button
                type="button"
                onClick={() => startDemo()}
                className="rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-medium"
              >
                Try demo (Brussels)
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => position && void refreshCameras(position, true)}
                className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
              >
                Refresh cameras
              </button>
              <button
                type="button"
                onClick={reportVan}
                className="rounded-xl bg-[var(--warn)] px-3 py-2 text-sm font-medium text-white"
              >
                Mark van here
              </button>
              {demoMode ? (
                <button
                  type="button"
                  onClick={() => startTracking()}
                  className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                >
                  Switch to live GPS
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => startDemo()}
                  className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                >
                  Demo route
                </button>
              )}
            </>
          )}
          <button
            type="button"
            onClick={() => setVoiceOn((v) => !v)}
            className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
          >
            Voice {voiceOn ? "on" : "off"}
          </button>
        </div>
      </header>

      <div
        className={`rounded-2xl border px-4 py-4 sm:px-5 ${
          alertTone === "critical"
            ? "border-red-500 bg-red-50 text-red-900"
            : alertTone === "near"
              ? "border-amber-500 bg-amber-50 text-amber-950"
              : alertTone === "watch"
                ? "border-teal-600/40 bg-teal-50 text-teal-950"
                : "border-[var(--line)] bg-white text-[var(--ink)]"
        }`}
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.14em] opacity-70">Now</p>
            <p className="mt-1 font-[family-name:var(--font-display)] text-2xl sm:text-3xl">
              {status === "idle" && "Start driving mode to track cameras ahead"}
              {status === "locating" && "Getting precise GPS…"}
              {status === "denied" && "Location permission blocked — enable it to use CamCue"}
              {status === "error" && (error || "Location error")}
              {status === "live" &&
                (nearest
                  ? nearest.message
                  : "No cameras in alert range — keep an eye on the map")}
            </p>
            {demoMode ? (
              <p className="mt-2 text-sm opacity-80">
                Demo route in Brussels — simulating travel so you can see alerts without GPS.
              </p>
            ) : null}
            {overLimit ? (
              <p className="mt-2 font-semibold">
                You may be over the nearby limit — ease off the accelerator.
              </p>
            ) : null}
          </div>
          <div className="text-right">
            <p className="text-sm opacity-70">Speed</p>
            <p className="font-[family-name:var(--font-display)] text-4xl">
              {speedKmh != null ? Math.round(speedKmh) : "—"}
              <span className="text-lg"> km/h</span>
            </p>
          </div>
        </div>
      </div>

      <div className="grid flex-1 gap-5 lg:grid-cols-[1.4fr_0.8fr]">
        <section className="h-[55vh] min-h-[360px] overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-sm lg:h-auto">
          {position ? (
            <DriveMap
              center={position}
              cameras={cameras}
              heading={heading}
              alertById={alertById}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="font-[family-name:var(--font-display)] text-2xl">
                Map waits for GPS
              </p>
              <p className="max-w-md text-[var(--muted)]">
                CamCue uses your browser location (and OpenStreetMap camera data)
                to show large markers and alert you as you approach.
              </p>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
            <h2 className="font-[family-name:var(--font-display)] text-lg">Nearby list</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {loadingCams
                ? "Loading fixed cameras from OpenStreetMap…"
                : `${fixedCams.filter((c) => c.kind === "fixed").length} fixed · ${
                    fixedCams.filter((c) => c.kind === "van").length + vanCams.length
                  } vans`}
            </p>
            {fixedCams.some((c) => c.source === "seed") ? (
              <p className="mt-2 text-sm text-[var(--warn)]">
                Using seed cameras — alerts still work offline.
              </p>
            ) : fixedCams.some((c) => c.source === "bundle") ? (
              <p className="mt-2 text-sm text-[var(--muted)]">
                OSM extract bundled with the app (works on GitHub Pages).
              </p>
            ) : null}
            {camError ? (
              <p className="mt-2 text-sm text-red-700">{camError}</p>
            ) : null}
            <ul className="mt-3 max-h-72 space-y-2 overflow-auto">
              {nearby.length === 0 ? (
                <li className="rounded-xl bg-[var(--bg)] px-3 py-4 text-sm text-[var(--muted)]">
                  Nothing in alert range yet.
                </li>
              ) : (
                nearby.slice(0, 8).map((item) => (
                  <li
                    key={item.camera.id}
                    className="rounded-xl bg-[var(--bg)] px-3 py-3 text-sm"
                  >
                    <p className="font-medium">{item.camera.label}</p>
                    <p className="text-[var(--muted)]">
                      {formatDistance(item.distanceM)} · {item.level}
                    </p>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="rounded-2xl border border-[var(--line)] bg-[var(--ink)] p-4 text-white">
            <h2 className="font-[family-name:var(--font-display)] text-lg">How it helps</h2>
            <ul className="mt-3 space-y-2 text-sm text-white/80">
              <li>· Oversized badges that pulse when a camera is near</li>
              <li>· Banner + beep + optional voice as you approach</li>
              <li>· Extra nudge if GPS speed looks over the posted limit</li>
              <li>· Mark a mobile van for yourself (saved in this browser)</li>
            </ul>
            <p className="mt-4 text-xs text-white/55">
              Awareness aid only. Obey local traffic law. OSM data can be incomplete;
              always watch the road.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
