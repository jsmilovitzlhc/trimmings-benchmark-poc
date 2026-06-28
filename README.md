# MP Trimmings Benchmark Portal — POC

Proof-of-concept for the Meatingplace Trimmings Benchmark Portal. Produces daily assessed prices for five beef trimmings series using VWAP aggregation with outlier filtering.

## Quick Start

```bash
npm run setup    # install deps, import real data, seed synthetic
npm run dev      # starts API (port 3001) + React dev server (port 5173)
```

Then open http://localhost:5173

## The Five Series

| Series | Unit | Type | Data Source |
|--------|------|------|-------------|
| MP Domestic 90CL | $/cwt | Raw | USDA LM_XB401 (real, Jan 2026+) |
| MP Domestic 50CL | $/cwt | Raw | USDA LM_XB403 (real, Apr 2001+) |
| MP Imported 90CL | $/lb | Raw | Synthetic (no real source yet) |
| MP 75CL Meat-Block | $/cwt | Derived | 62.5% × 90CL + 37.5% × 50CL |
| MP Trim Spread | $/cwt | Derived | Dom 90CL − Imp 90CL (normalized) |

## Import from Neon

Pull real data from the meat-prices-app Neon database:

```bash
DATABASE_URL="postgresql://..." npm run import
```

This reads from the `meat_prices` table and hydrates the local SQLite store with real Domestic 90CL and 50CL history.

## Features

- **Subscriber Dashboard**: 5-card headline strip, time-series chart, assessment detail, data table, CSV export
- **Contributor Flow**: Trade submission form, bulk CSV upload, validation, "My Submissions" view
- **Composite Engine**: VWAP aggregation, z-score outlier filtering, derived series calculation
- **The Wall**: Contributors cannot see other contributors' raw trades (API-enforced)
- **Audit Log**: Immutable record of all submissions and assessment runs
- **Role Switcher**: Toggle between subscriber/contributor/admin in the UI

## Tests

```bash
node tests/composite-engine.test.js
```

## Data Sources

- **Real data**: Domestic 90CL (~83 records, Jan-Jun 2026) and Domestic 50CL (~1,431 records, 2001-2026) from USDA reports stored in the meat-prices-app Neon DB
- **Synthetic data**: Imported 90CL (generated to demonstrate spread calculation), 10 mock contributor accounts (clearly tagged `is_synthetic=1`)
- The startup import reports which series/dates are real vs. synthetic

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the SQLite→Postgres migration path and system design.

## CSV Upload Template

Download from the running app or use:

```csv
series_id,date,price,volume,unit,notes
domestic_90cl,2026-06-28,460.00,40000,$/cwt,
domestic_50cl,2026-06-28,185.00,50000,$/cwt,
```
