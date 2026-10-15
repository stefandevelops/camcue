# CamCue

**Real problem:** Google Maps / Waze camera icons are easy to miss, and you can drift over the limit without noticing until it’s too late.

**Solution:** a driving-mode web app with **large** camera badges, proximity banners, optional voice cues, and a one-tap “mobile van here” marker. Built to help you **check your speed** — not to break the law.

## Data sources

- **Fixed cameras:** OpenStreetMap via the Overpass API (`highway=speed_camera`)
- **Map tiles:** OpenStreetMap
- **Mobile vans:** local reports saved in your browser (no account)

## Features

- GPS tracking with live speed readout
- Big on-map markers (limit number or `VAN`)
- Watch / near / critical alert bands
- Voice nudge when a camera is ahead
- Extra reminder if GPS speed looks above the camera’s tagged limit
- Mark a van at your current location

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
