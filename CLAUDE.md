# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

At-home sleep lab for clinical sleep analytics — video-based motion/arousal detection, BLE heart rate monitoring, and UniFi camera integration. Full-stack: Python FastAPI backend + React/TypeScript frontend, orchestrated via Docker Compose.

## Development Commands

- `make dev` — start dev stack (Postgres, backend on :8000, dashboard on :5174) with hot reload
- `make up` — start production stack (dashboard served via nginx on :3000)
- `make down` — stop containers
- `make nuke` — hard reset dev environment (removes volumes, rebuilds)
- `make ble` — run BLE microservice locally on :8001 (requires host `.venv`)
- `make logs` — follow Docker logs

### Frontend (from `dashboard/`)

- `npm run lint` — ESLint
- `npm run format` — Prettier
- `npm run typecheck` — TypeScript type checking
- `npm run build` — production build

## Architecture

- **backend/** — FastAPI (Python 3.12, asyncpg, OpenCV). Handles sessions, video processing pipeline, PLMS detection, UniFi camera control.
- **dashboard/** — React 19 + TypeScript + Vite + shadcn/ui + Tailwind CSS v4. Uses TanStack Query for data fetching, Recharts for charts.
- **ble_service.py** — Standalone Bluetooth microservice that runs on the **host machine** (not Docker) because containers can't access Bluetooth hardware. Connects to BLE heart rate monitors.
- **PostgreSQL 16** — session and metrics storage. Dev credentials: `sleeplab:sleeplab@db:5432/sleeplab`.

## Code Style

### Frontend

- Prettier: no semicolons, double quotes, 2-space indent, trailing commas
- Path alias: `@/*` maps to `./src/*` — always use this for imports
- Components use shadcn/ui (Radix Nova style, Lucide icons). Add new ones with `npx shadcn@latest add <component>`
- Tailwind CSS v4 via `@tailwindcss/vite` plugin (not PostCSS)

### Backend

- Async-first: use `async`/`await` with asyncpg, httpx, etc.
- Type hints on all function signatures
- Ruff for linting and formatting (config in `ruff.toml`): line-length 88, double quotes, select E/F/I/UP rules

## Gotchas

- Frontend proxies `/api` to backend via Vite config in dev, nginx in prod
- Video and HR data dirs are Docker volumes — files persist across container restarts
- BLE service needs a local Python 3.12 venv with bleak, fastapi, uvicorn
