# Architecture — Trimmings Benchmark POC

## Overview

```
┌─────────────┐     ┌──────────────┐     ┌──────────┐
│   React UI  │────▶│  Express API │────▶│  SQLite   │
│  (Vite/RC)  │◀────│   (REST)     │◀────│  (WAL)   │
└─────────────┘     └──────┬───────┘     └──────────┘
                           │
                    ┌──────┴───────┐
                    │  Composite   │
                    │   Engine     │
                    │  (VWAP +     │
                    │  outliers)   │
                    └──────────────┘
```

## Components

### Frontend (`client/`)
- **React + Vite** — SPA with financial-terminal aesthetic
- **Recharts** — Time-series charting with multi-series overlay
- **Role Switcher** — Client-side role simulation (subscriber/contributor/admin)

### Backend (`server/`)
- **Express REST API** — Stateless, role-aware via headers
- **SQLite (better-sqlite3)** — Single-file embedded database in WAL mode
- **Composite Engine** — Isolated module for VWAP, outlier detection, derived series

### Import Layer (`scripts/`)
- **import-from-neon.js** — Reads real data from Neon Postgres (meat-prices-app DB)
- **seed-synthetic.js** — Generates synthetic imported 90CL, contributors, and trades

## Data Flow

```
Neon Postgres ──import──▶ SQLite (assessments)
                              │
Contributor trades ──API──▶ SQLite (trades)
                              │
"Run Assessment" ──engine──▶ VWAP + outlier filter ──▶ SQLite (assessments)
                              │
Derived series ──engine──▶ 75CL + Spread ──▶ SQLite (assessments)
```

## The Wall (Contributor Isolation)

Contributors submit trades via POST `/api/trades`. The API enforces:
1. Contributor can only see their own trades (GET `/api/trades`)
2. Subscribers cannot see any raw trades
3. Only assessed benchmark values (VWAP output) are visible to all

This is enforced at the Express route level via `x-role` and `x-contributor-id` headers.

## SQLite → Postgres Migration Path

For production:

1. **Schema**: The SQLite schema uses standard SQL types that map directly to Postgres:
   - `TEXT` → `TEXT`
   - `REAL` → `NUMERIC(12,4)` or `DOUBLE PRECISION`
   - `INTEGER` → `INTEGER` / `BIGINT`
   - `datetime('now')` → `NOW()`

2. **Migrations**: Export SQLite schema → Drizzle/Prisma migration files

3. **Connection**: Replace `better-sqlite3` calls with `pg` pool:
   - `db.prepare(sql).all(params)` → `pool.query(sql, params).rows`
   - `db.prepare(sql).run(params)` → `pool.query(sql, params)`
   - `db.transaction(fn)` → `BEGIN/COMMIT` blocks

4. **Deployment**: Use Neon Postgres (already available in the Vercel project)

5. **Indexes**: The same indexes apply; add `CONCURRENTLY` for production creates

### Key Decisions for Prod
- Use connection pooling (Neon pooler endpoint)
- Add row-level security for The Wall (Postgres RLS policies)
- Add proper auth (JWT/session) instead of header-based role stubs
- Add rate limiting on trade submission endpoints
- Consider TimescaleDB extension for time-series queries

## Composite Engine

The engine (`server/composite-engine.js`) is deliberately isolated from Express routes:
- Pure functions for VWAP and outlier detection
- Side-effectful functions for assessment runs and derived series
- Config constants are co-located and easily overridable
- Can be extracted to a shared package for use in CLI/batch processes
