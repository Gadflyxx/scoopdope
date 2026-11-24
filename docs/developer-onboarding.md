# Developer Onboarding Guide

Welcome to the project! This guide will take you from a clean machine to a running local stack, and explain how to run the test suites. Follow it top to bottom the first time; after that, the [Quick Start](#quick-start) section is all you need.

> **Note for reviewers:** This guide should be reviewed by at least one developer who is unfamiliar with the codebase (a "dogfood test") before merging. If you are that reviewer, follow the guide exactly as written and report anything that is unclear, missing, or wrong.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Local Setup (detailed)](#local-setup-detailed)
4. [Environment Variables](#environment-variables)
5. [Running Services](#running-services)
6. [Running Tests](#running-tests)
7. [Common Troubleshooting](#common-troubleshooting)
8. [Where to Go Next](#where-to-go-next)

---

## Prerequisites

Install the following tools before you begin. Versions listed are the minimums we support.

| Tool | Minimum Version | Notes |
| --- | --- | --- |
| [Git](https://git-scm.com/) | 2.30+ | |
| [Node.js](https://nodejs.org/) | 18.x LTS | Use [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm) to manage versions. |
| [pnpm](https://pnpm.io/) | 8.x | The monorepo uses pnpm workspaces. |
| [Docker](https://www.docker.com/) + Docker Compose | 20.x+ | Used for local Postgres/Redis and other backing services. |
| [PostgreSQL client](https://www.postgresql.org/download/) | 14+ | Optional, but handy for inspecting the local DB. |

Verify your installs:

```bash
git --version
node --version      # should print v18.x or newer
pnpm --version      # should print 8.x or newer
docker --version
docker compose version
```

> **Tip:** If you use nvm, run `nvm install 18 && nvm use 18` before continuing.

---

## Quick Start

This is the copy-paste sequence that takes a clean machine to a running local stack. It assumes you have completed the [Prerequisites](#prerequisites).

```bash
# 1. Clone the repository
git clone <REPO_URL> project
cd project

# 2. Install dependencies (from the repo root)
pnpm install

# 3. Create your local environment files from the examples
cp .env.example .env
cp apps/backend/.env.example apps/backend/.env

# 4. Start backing services (Postgres, Redis, etc.)
docker compose up -d

# 5. Run database migrations and seed data
pnpm --filter backend migrate
pnpm --filter backend seed

# 6. Start the local stack (frontend + backend)
pnpm dev
```

Once everything is up:

- Frontend: <http://localhost:3000>
- Backend API: <http://localhost:4000>
- API health check: <http://localhost:4000/health>

If any step fails, jump to [Common Troubleshooting](#common-troubleshooting).

---

## Local Setup (detailed)

### 1. Clone the repository

```bash
git clone <REPO_URL> project
cd project
```

### 2. Install dependencies

The repository is a pnpm monorepo. Always install from the **repo root**:

```bash
pnpm install
```

This installs dependencies for every workspace package (`apps/frontend`, `apps/backend`, shared packages, etc.).

### 3. Create environment files

Copy the example files. **Do not commit** the resulting `.env` files — they are git-ignored.

```bash
cp .env.example .env
cp apps/backend/.env.example apps/backend/.env
```

See [Environment Variables](#environment-variables) for what each variable does.

### 4. Start backing services

```bash
docker compose up -d
```

This starts the local Postgres and Redis containers defined in `docker-compose.yml`. Confirm they are healthy:

```bash
docker compose ps
```

### 5. Prepare the database

```bash
pnpm --filter backend migrate
pnpm --filter backend seed
```

- `migrate` applies all pending database migrations.
- `seed` loads development fixtures so the app has data to display.

### 6. Start the stack

```bash
pnpm dev
```

This runs the frontend and backend in watch mode. You should see both services log that they are listening.

---

## Environment Variables

The variable names below **match `.env.example` (repo root) and `apps/backend/.env.example` exactly**. If you add a new variable, update both the example file and this table.

### Root `.env` (from `.env.example`)

| Variable | Description | Example |
| --- | --- | --- |
| `NODE_ENV` | Runtime environment. Use `development` locally. | `development` |
| `FRONTEND_PORT` | Port the frontend dev server listens on. | `3000` |
| `BACKEND_PORT` | Port the backend API listens on. | `4000` |
| `BACKEND_URL` | Base URL the frontend uses to reach the backend. | `http://localhost:4000` |
| `NEXT_PUBLIC_API_URL` | Public API URL exposed to the browser. | `http://localhost:4000` |

### `apps/backend/.env` (from `apps/backend/.env.example`)

| Variable | Description | Example |
| --- | --- | --- |
| `NODE_ENV` | Runtime environment for the backend. | `development` |
| `PORT` | Port the backend listens on. | `4000` |
| `DATABASE_URL` | Postgres connection string. | `postgresql://postgres:postgres@localhost:5432/app` |
| `REDIS_URL` | Redis connection string. | `redis://localhost:6379` |
| `JWT_SECRET` | Secret used to sign JWTs. Use a random value locally. | `change-me-in-local-dev` |
| `JWT_EXPIRES_IN` | JWT lifetime. | `1h` |
| `LOG_LEVEL` | Backend log verbosity. | `debug` |
| `CORS_ORIGIN` | Allowed CORS origin(s) for the frontend. | `http://localhost:3000` |

> **Important:** The tables above are the source of truth for variable *names*. If a name in this guide ever disagrees with `.env.example` or `apps/backend/.env.example`, the example files win — please open an issue so we can fix the guide.

---

## Running Services

### Everything at once

```bash
pnpm dev
```

### Individual services

```bash
# Frontend only
pnpm --filter frontend dev

# Backend only
pnpm --filter backend dev
```

### Backing services (Docker)

```bash
docker compose up -d      # start
docker compose ps         # status
docker compose logs -f    # follow logs
docker compose down       # stop (keeps volumes)
docker compose down -v    # stop and wipe data
```

### Useful endpoints

| Service | URL |
| --- | --- |
| Frontend | <http://localhost:3000> |
| Backend API | <http://localhost:4000> |
| Health check | <http://localhost:4000/health> |

---

## Running Tests

The repo has three test layers: **unit**, **integration**, and **e2e**. Run them from the repo root unless noted.

### Unit tests

Fast, isolated tests that do not touch the network or database.

```bash
pnpm test
```

To run a single package:

```bash
pnpm --filter backend test
pnpm --filter frontend test
```

### Integration tests

These spin up the local backing services (Postgres/Redis) and exercise real database code. Make sure Docker services are running first:

```bash
docker compose up -d
pnpm test:integration
```

### End-to-end (e2e) tests

E2E tests drive the full stack through a browser. Start the stack first (or let the test runner start it, depending on your setup):

```bash
pnpm dev            # in one terminal
pnpm test:e2e       # in another terminal
```

### Testnet `@e2e` suite

Some e2e tests are tagged `@e2e` and run against a **testnet** environment rather than localhost. They require testnet credentials in your environment (see `.env.example` for the relevant variable names). Run them with:

```bash
pnpm test:e2e --grep @e2e
```

> **Note:** The `@e2e` suite hits a live testnet and can be slow or flaky. Run it before opening a PR that touches network or chain-related code, but do not rely on it for fast local feedback.

### Running everything

```bash
pnpm test && pnpm test:integration && pnpm test:e2e
```

---

## Common Troubleshooting

### `pnpm install` fails

- Confirm you are on Node 18.x: `node --version`.
- Delete `node_modules` and the lockfile cache, then retry:
  ```bash
  rm -rf node_modules
  pnpm store prune
  pnpm install
  ```

### Port already in use (`EADDRINUSE`)

Another process is using port 3000 or 4000. Find and stop it:

```bash
# macOS / Linux
lsof -i :3000
lsof -i :4000
kill -9 <PID>
```

Or change `FRONTEND_PORT` / `BACKEND_PORT` in your `.env` files.

### Backend cannot connect to the database

- Check containers are running: `docker compose ps`.
- Confirm `DATABASE_URL` in `apps/backend/.env` matches the credentials in `docker-compose.yml`.
- Re-run migrations: `pnpm --filter backend migrate`.

### `docker compose up` fails or containers keep restarting

- Check logs: `docker compose logs -f`.
- Wipe stale volumes and restart: `docker compose down -v && docker compose up -d`.

### Migrations fail

- Ensure the database is reachable (see above).
- If the schema is in a bad state locally, reset it:
  ```bash
  docker compose down -v
  docker compose up -d
  pnpm --filter backend migrate
  pnpm --filter backend seed
  ```

### Tests fail with "connection refused"

Your backing services are not running. Start them with `docker compose up -d` and wait for `docker compose ps` to show them as healthy.

### Environment variables seem ignored

- Confirm you copied the example files to the correct locations (`.env` at root, `apps/backend/.env` in the backend).
- Restart the dev server after editing `.env` files — they are read at startup.

### Still stuck?

Search existing issues, then open a new one with the output of `node --version`, `pnpm --version`, `docker compose ps`, and the failing command's logs.

---

## Where to Go Next

- **Production deployment:** see `docs/production-deployment-guide.md`.
- **Architecture and implementation notes:** search the repo for `IMPLEMENTATION_SUMMARY_*` and `QUICK_REFERENCE.md` files.
- **Contributing:** open a PR against `main` and request review from a maintainer.

Welcome aboard — if anything in this guide was wrong or confusing, please fix it in a PR. That is how we keep onboarding fast.