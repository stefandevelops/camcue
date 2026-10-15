# CamCue

**Real problem:** Google Maps / Waze camera icons are easy to miss, and you can drift over the limit without noticing until it’s too late.

**Solution:** a driving-mode web app with **large** camera badges, proximity banners, optional voice cues, and a one-tap “mobile van here” marker. Built to help you **check your speed** — not to break the law.

## Data sources

- **Fixed cameras:** OpenStreetMap (`highway=speed_camera`)
  - Bundled Brussels extract in `public/data/` (same-origin — works on GitHub Pages)
  - Live Overpass mirrors when the browser can reach them
  - Tiny seed set if both are unavailable
- **Map tiles:** OpenStreetMap
- **Mobile vans:** local reports saved in your browser (no account)

Google Maps / Waze do not expose a public speed-camera API for third-party apps, so CamCue uses OpenStreetMap + your own van marks instead.

## Features

- GPS tracking with live speed readout
- Oversized on-map markers (limit number or `VAN`) that pulse when nearby
- Watch / near / critical alert bands
- Beep + optional voice when a camera is ahead
- Extra reminder if GPS speed looks above the camera’s tagged limit
- Mark a van at your current location
- Demo route (Brussels) to try alerts without phone GPS

## Live demo

https://stefandevelops.github.io/camcue/

## Run locally

```bash
npm install
npm run dev
```

Open http://127.0.0.1:43125 — allow location when prompted.

## Notes

- Works best on a phone with GPS (desktop may show weak/zero speed)
- OSM coverage varies by country/city
- Awareness aid only: follow posted limits and local laws

## CV line

Built a browser driving companion that pulls OpenStreetMap speed cameras, shows oversized map alerts, and nudges drivers when they approach enforcement zones or drift over the posted limit.
