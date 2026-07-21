# Weather Trip

Weather Trip helps users find travel destinations by weather, temperature, rainfall, humidity, and elevation. The app uses Astro + React for the public tool pages and a separate Node.js Worker to refresh forecast data into Postgres.

## Structure

```text
apps/web       # Astro SSR public app, English at / and Chinese under /zh
apps/worker    # Node.js worker, database initialization and scheduled weather refresh
packages/weather-core
packages/weather-db
data/          # one-time existing weather cache import input
docs/
scripts/
```

## Commands

```bash
npm install
npm run cities:import-geonames
npm run db:import-existing
npm run dev
npm run build
npm run start
npm run check
```

Copy `.env.example` to `.env.development` and set `DATABASE_URL` there before running maintenance scripts or local apps through root commands. App-level `.env.development` files are only needed for app-specific overrides such as ports or refresh intervals.
