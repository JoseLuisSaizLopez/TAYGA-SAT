# Tayga SAT

Real-time 3D satellite tracker visualizing 6,000+ active satellites orbiting Earth. Built with CesiumJS, satellite.js (SGP4), and React.

Live TLE data is fetched from CelesTrak, propagated client-side with SGP4, and rendered as interactive point primitives on a photorealistic globe.

---

## Features

- **Live orbital data** — fetches the `active` group from CelesTrak, refreshed at load time.
- **SGP4 propagation** — positions computed every second, interpolated every frame.
- **Interactive globe** — photorealistic Cesium World Terrain + ellipsoid, click any satellite to inspect.
- **Smart search** — incremental fuzzy search by name or NORAD ID across the full catalog.
- **Tracking camera** — lock the view to any satellite and follow it along its orbit.
- **Orbit classification** — LEO / MEO / GEO / HEO buckets with live counts and distribution bar.
- **Visual toggles** — atmospheric cloud layer and Rayleigh atmosphere glow.
- **Boot sequence HUD** — progress, status, and telemetry indicators during data load.
- **UTC mission clock** — overlay synced to the user's system time.
- **Resilient data layer** — direct fetch, multiple CORS proxies, local snapshot fallback.

---

## Tech stack

| Layer | Choice |
|-------|--------|
| UI | React 19 |
| 3D engine | CesiumJS 1.140 |
| Orbital mechanics | satellite.js 5 (SGP4) |
| Build tool | Vite 8 |
| Cesium integration | `vite-plugin-cesium` |
| Data source | CelesTrak (TLE / OMM JSON) |

---

## Getting started

### Prerequisites

- Node.js 20+
- npm 10+

### Install

```bash
npm install
```

### Development

```bash
npm run dev
```

Opens at `http://localhost:3000/TAYGA-SAT/`.

### Production build

```bash
npm run build
npm run preview
```

Build output is written to `dist/`.

---

## Project structure

```
tayga-sat/
├── public/
│   ├── data/satellites.json     # Offline fallback catalog
│   ├── favicon.svg              # Planet + ring brand mark
│   └── icons.svg                # Icon sprite sheet
├── src/
│   ├── components/
│   │   ├── CesiumViewer.jsx     # Cesium viewer bootstrap
│   │   ├── Sidebar.jsx          # Brand, stats, legend, view toggles
│   │   ├── SearchBar.jsx        # Top-center command bar
│   │   ├── InfoBox.jsx          # Selected-satellite detail panel
│   │   └── LoadingScreen.jsx    # HUD boot sequence
│   ├── engine/
│   │   ├── SatelliteManager.js  # TLE ingest, SGP4 propagation, bucketing
│   │   └── CesiumRenderer.js    # Point primitives, highlighting, tracking
│   ├── services/
│   │   └── SatelliteDataService.js  # CelesTrak fetch + proxy chain + local fallback
│   ├── App.jsx                  # Composition root
│   ├── App.css                  # Component styles
│   ├── index.css                # Global tokens & reset
│   └── main.jsx                 # React entry
├── index.html
├── vite.config.js
└── package.json
```

---

## Data pipeline

1. **Fetch** — `SatelliteDataService.fetchSatelliteData()` attempts, in order:
   1. Direct TLE fetch from CelesTrak (`GROUP=active&FORMAT=tle`).
   2. Direct OMM JSON fetch.
   3. OMM JSON via rotating CORS proxies (`corsproxy.io`, `allorigins`, `codetabs`, `cors.sh`, `cors.lol`).
   4. Bundled local snapshot (`public/data/satellites.json`).
2. **Parse** — TLE lines are grouped into OMM-shaped records with NORAD ID, international designator, and TLE pair.
3. **Load** — `SatelliteManager.loadSatellites()` builds `satrec` objects for each satellite.
4. **Propagate** — `SatelliteManager.propagateAll(date)` computes ECI position/velocity via SGP4, converts to geodetic coordinates, and classifies orbit type by altitude.
5. **Render** — `CesiumRenderer` writes into `PointPrimitiveCollection`, interpolates between propagation ticks, and drives the tracking camera.

Selected satellites are re-propagated every frame for sub-second smoothness.

---

## Orbit buckets

| Bucket | Altitude range | Typical examples |
|--------|----------------|------------------|
| **LEO** | below 2,000 km | ISS, Starlink, Earth observation |
| **MEO** | 2,000 – 35,000 km | GPS, Galileo, GLONASS |
| **GEO** | ≈ 35,786 km | Weather, TV broadcast |
| **HEO** | above 35,000 km | Molniya, Tundra orbits |

---

## Deployment

The Vite `base` is set to `/TAYGA-SAT/`. To deploy elsewhere, edit `vite.config.js`:

```js
base: '/your-path/',
```

For root-level hosting (e.g. a custom domain), use `base: '/'`.

### GitHub Pages

```bash
npm run build
# publish the dist/ folder to the gh-pages branch
```

---

## Data attribution

Satellite orbital elements are provided by [CelesTrak](https://celestrak.org) (Dr. T.S. Kelso). Data is used under CelesTrak's standard terms.

Built with:
- [CesiumJS](https://cesium.com/platform/cesiumjs/) — MIT
- [satellite.js](https://github.com/shashwatak/satellite-js) — MIT
- [React](https://react.dev) — MIT

---

## License

MIT
