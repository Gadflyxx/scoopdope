# Production Deployment Guide

A comprehensive, step-by-step guide for deploying the scoopdope platform to a production environment. This guide covers environment preparation, containerized deployment using Docker Compose, and Stellar/Soroban mainnet integration.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites & Server Requirements](#2-prerequisites--server-requirements)
3. [Environment Configuration](#3-environment-configuration)
4. [Docker Production Deployment](#4-docker-production-deployment)
5. [Stellar Mainnet Configuration](#5-stellar-mainnet-configuration)
6. [Reverse Proxy & SSL/TLS Setup](#6-reverse-proxy--ssltls-setup)
7. [Database Migrations & Initial Setup](#7-database-migrations--initial-setup)
8. [Health Checks & Verification](#8-health-checks--verification)
9. [Operations, Monitoring & Rollbacks](#9-operations-monitoring--rollbacks)

---

## 1. Architecture Overview

The scoopdope production stack consists of five interconnected layers:

```
                          Internet (HTTPS / Port 443)
                                      │
                                      ▼
                        ┌───────────────────────────┐
                        │   Reverse Proxy (Nginx)   │
                        │    SSL / TLS Termination  │
                        └─────────────┬─────────────┘
                                      │
                 ┌────────────────────┴────────────────────┐
                 ▼                                         ▼
      ┌─────────────────────┐                   ┌─────────────────────┐
      │  Frontend (Next.js) │                   │  Backend (NestJS)   │
      │   Port 3001 (SSR)   │                   │    Port 3000 (API)  │
      └─────────────────────┘                   └──────────┬──────────┘
                                                           │
                                ┌──────────────────────────┼──────────────────────────┐
                                ▼                          ▼                          ▼
                     ┌──────────────────┐       ┌──────────────────┐       ┌──────────────────────┐
                     │ PostgreSQL (v16) │       │   Redis (v7)     │       │   Stellar Mainnet    │
                     │ Relational Data  │       │ Cache & Sessions │       │ Horizon & Soroban RPC│
                     └──────────────────┘       └──────────────────┘       └──────────────────────┘
```

- **Frontend (`apps/frontend`)**: Next.js 14 application serving client views, wallet connections, and learner interfaces.
- **Backend (`apps/backend`)**: NestJS REST API exposing `/v1` routes with JWT authentication, RBAC, and blockchain services.
- **Database**: PostgreSQL 16 storing persistent application data with TypeORM migrations.
- **Cache**: Redis 7 handling session caching, idempotency keys, and rate-limiting counters.
- **Blockchain**: Stellar Mainnet executing Soroban smart contracts (credentials, tokens, analytics).

---

## 2. Prerequisites & Server Requirements

### Minimum Hardware Specifications

| Component | Minimum Specification | Recommended Specification |
|-----------|----------------------|---------------------------|
| **CPU** | 2 vCPU cores | 4 vCPU cores |
| **RAM** | 4 GB | 8 GB |
| **Disk** | 40 GB NVMe SSD | 80+ GB NVMe SSD |
| **Network** | 100 Mbps egress | 1 Gbps egress |

### Required Host Software

Ensure the host operating system (Ubuntu 22.04 LTS or newer recommended) has the following packages installed:

```bash
# Update package index and install dependencies
sudo apt-get update && sudo apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    git \
    jq

# Install Docker Engine and Docker Compose plugin (v2)
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Verify installation
docker --version
docker compose version
```

### Stellar CLI (For Contract Deployment)

Install Stellar CLI on the deployment bastion or CI server to manage contract operations:

```bash
curl https://github.com/stellar/stellar-cli/releases/download/v21.5.0/stellar-cli-21.5.0-x86_64-unknown-linux-gnu.tar.gz | tar xz
sudo mv stellar /usr/local/bin/
stellar --version
```

---

## 3. Environment Configuration

### 3.1 Creating the Production `.env` File

Never commit production secrets to Git. Copy the environment template and populate it with production values:

```bash
cp .env.example .env.production
chmod 600 .env.production
```

### 3.2 Production Environment Variables Reference

| Variable | Required | Production Value / Description | Example |
|----------|----------|--------------------------------|---------|
| `NODE_ENV` | Yes | Must be set to `production`. Disables TypeORM auto-sync and enables optimized caching. | `production` |
| `PORT` | Yes | HTTP port for the NestJS API server. | `3000` |
| `LOG_LEVEL` | No | Logging verbosity (`warn`, `info`, `error`). | `info` |
| `LOG_FORMAT` | No | Structured log output. In production, use `json` for aggregation. | `json` |
| `DATABASE_HOST` | Yes | PostgreSQL host (container name `postgres` in Docker Compose, or managed cloud host). | `postgres` |
| `DATABASE_PORT` | Yes | PostgreSQL port. | `5432` |
| `DATABASE_NAME` | Yes | Database name. | `scoopdope` |
| `DATABASE_USER` | Yes | Database username. Use a dedicated non-superuser role. | `scoopdope_user` |
| `DATABASE_PASSWORD` | Yes | Cryptographically secure random password (minimum 32 characters). | *(secure password)* |
| `REDIS_URL` | Yes | Redis connection string. `redis://redis:6379` in Docker Compose or authenticated URL. | `redis://redis:6379` |
| `JWT_SECRET` | Yes | High-entropy secret key for signing auth tokens (minimum 64 characters). | *(64-byte hex or base64)* |
| `JWT_EXPIRES_IN` | No | Token expiration duration. | `1d` |
| `STELLAR_NETWORK` | Yes | Must be `mainnet` in production. | `mainnet` |
| `STELLAR_HORIZON_URL` | Yes | Stellar Horizon mainnet endpoint. | `https://horizon.stellar.org` |
| `SOROBAN_RPC_URL` | Yes | Soroban RPC mainnet endpoint. | `https://soroban.stellar.org` |
| `STELLAR_SECRET_KEY` | Yes | Mainnet issuer/distribution secret key (starts with `S`). Kept strictly confidential. | `S...` |
| `STELLAR_PUBLIC_KEY` | Yes | Public key corresponding to `STELLAR_SECRET_KEY` (starts with `G`). | `G...` |
| `ANALYTICS_CONTRACT_ID` | Yes | Mainnet Soroban contract ID for the Analytics contract (starts with `C`). | `C...` |
| `TOKEN_CONTRACT_ID` | Yes | Mainnet Soroban contract ID for the Reward Token contract. | `C...` |
| `CERTIFICATE_CONTRACT_ID`| Yes | Mainnet Soroban contract ID for Certificate issuance. | `C...` |
| `GOVERNANCE_CONTRACT_ID` | Yes | Mainnet Soroban contract ID for Governance. | `C...` |
| `NEXT_PUBLIC_API_URL` | Yes | Public URL pointing to backend API (through reverse proxy). | `https://api.yourdomain.com` |
| `NEXT_PUBLIC_STELLAR_NETWORK` | Yes | Client network identifier. | `mainnet` |

### 3.3 Generating Production Secrets

Generate secure secrets using OpenSSL:

```bash
# Generate 64-character JWT secret
openssl rand -hex 32

# Generate secure PostgreSQL password
openssl rand -base64 24
```

---

## 4. Docker Production Deployment

scoopdope provides an optimized `docker-compose.prod.yml` configuration configured with restart policies, resource limits, and health checks.

### 4.1 Production Compose File Structure

The `docker-compose.prod.yml` defines the following isolated services:
- **`postgres`**: Alpine-based PostgreSQL 16 with persistent volume `postgres_data` and memory limits (1GB limit, 512MB reservation).
- **`redis`**: Alpine-based Redis 7 with AOF persistence enabled and memory limits (512MB limit, 256MB reservation).
- **`backend`**: Multi-stage NestJS container with dependency installation, production build, non-root user execution, and health dependencies on `postgres` and `redis`.
- **`frontend`**: Standalone Next.js 14 container with built assets and production runtime.

### 4.2 Building and Launching Containers

Deploy the production stack using Docker Compose:

```bash
# Export the environment file location
export COMPOSE_FILE=docker-compose.prod.yml
export COMPOSE_ENV_FILES=.env.production

# Build the containers with cache checking
docker compose -f docker-compose.prod.yml --env-file .env.production build

# Start services in detached mode
docker compose -f docker-compose.prod.yml --env-file .env.production up -d

# Verify all containers are running and healthy
docker compose -f docker-compose.prod.yml --env-file .env.production ps
```

Expected output:
```
NAME                    IMAGE               COMMAND                  SERVICE    STATUS
scoopdope-backend-1     scoopdope-backend   "node dist/main"         backend    Up (healthy)
scoopdope-frontend-1    scoopdope-frontend  "node server.js"         frontend   Up
scoopdope-postgres-1    postgres:16-alpine  "docker-entrypoint.s…"   postgres   Up (healthy)
scoopdope-redis-1       redis:7-alpine      "docker-entrypoint.s…"   redis      Up (healthy)
```

### 4.3 Inspecting Container Logs

Stream logs from individual or all services:

```bash
# Follow logs for the backend API
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f backend

# Follow logs for all services with timestamps
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f -t
```

---

## 5. Stellar Mainnet Configuration

Deploying smart contracts and issuing credentials on Stellar Mainnet requires real XLM balances and strict operational security.

### 5.1 Mainnet Keypair & Security Architecture

1. **Issuer Keypair vs Distribution Keypair**:
   - **Issuer Account (Cold Storage)**: Creates and authors the token contracts. Keep this key offline (hardware wallet / cold storage).
   - **Distribution Account (Hot Wallet)**: Configured in `STELLAR_SECRET_KEY` on the backend server. Used solely for signing credential verification and reward transactions.
2. **Account Funding**:
   - Ensure the Distribution Account has at least **20-50 XLM** on Mainnet to satisfy the base reserve requirement and pay network transaction fees (base fee: 100 stroops / 0.00001 XLM).
   - Verify balance using Stellar CLI:
     ```bash
     stellar account info --source GYOUR_PUBLIC_KEY --network mainnet
     ```

### 5.2 Network Constants for Mainnet

Ensure your `.env.production` includes:

```bash
STELLAR_NETWORK=mainnet
STELLAR_HORIZON_URL=https://horizon.stellar.org
SOROBAN_RPC_URL=https://soroban.stellar.org
```

Network passphrase for verification in code/scripts:
```
Public Global Stellar Network ; September 2015
```

### 5.3 Building and Deploying Contracts to Mainnet

1. **Compile Optimized WASM**:
   ```bash
   rustup target add wasm32-unknown-unknown
   ./scripts/build.sh
   ```

2. **Deploy Each Contract to Mainnet**:
   ```bash
   # Deploy analytics contract
   ./scripts/deploy.sh mainnet analytics

   # Deploy token contract
   ./scripts/deploy.sh mainnet token

   # Deploy certificate contract
   ./scripts/deploy.sh mainnet certificate

   # Deploy governance contract
   ./scripts/deploy.sh mainnet governance
   ```

3. **Verify Deployment & Record Addresses**:
   The deployment script automatically logs the assigned contract IDs to `scripts/deployed-contracts.json`.
   Copy the generated contract IDs into your `.env.production`:
   ```bash
   ANALYTICS_CONTRACT_ID=C...
   TOKEN_CONTRACT_ID=C...
   CERTIFICATE_CONTRACT_ID=C...
   GOVERNANCE_CONTRACT_ID=C...
   ```

4. **Soroban State TTL (Rent) Management**:
   Mainnet Soroban contracts require periodic rent renewal for instance and storage data. Use the maintenance script to extend TTL:
   ```bash
   stellar contract extend --network mainnet --id $ANALYTICS_CONTRACT_ID --durability persistent --ledgers-to-extend 500000
   ```

---

## 6. Reverse Proxy & SSL/TLS Setup

Place Nginx in front of Docker containers for TLS termination, gzip/brotli compression, and security headers.

### 6.1 Sample Nginx Configuration (`/etc/nginx/sites-available/scoopdope`)

```nginx
# Rate limiting zone
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=30r/s;

# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name scoopdope.yourdomain.com api.yourdomain.com;
    return 301 https://$host$request_uri;
}

# Main Application & API Server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name scoopdope.yourdomain.com;

    # SSL Certificates (managed via Certbot)
    ssl_certificate /etc/letsencrypt/live/scoopdope.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/scoopdope.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security Headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://horizon.stellar.org https://soroban.stellar.org;" always;

    # API Proxy Routing
    location /api/ {
        limit_req zone=api_limit burst=20 nodelay;
        proxy_pass http://127.0.0.1:3000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 90;
    }

    # Frontend Proxy Routing
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the configuration and obtain SSL certificates via Certbot:

```bash
sudo ln -s /etc/nginx/sites-available/scoopdope /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Issue Let's Encrypt certificates
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d scoopdope.yourdomain.com -d api.yourdomain.com
```

---

## 7. Database Migrations & Initial Setup

TypeORM schema synchronization (`synchronize: true`) is **disabled** in production to prevent unintentional data drops. Schema changes must be applied via migrations.

### 7.1 Running Pending Migrations

Run database migrations inside the running backend container:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec backend npm run migration:run
```

### 7.2 Inspecting Migration Status

To check which migrations have been applied:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec backend npm run migration:show
```

---

## 8. Health Checks & Verification

After deployment, perform verification checks to ensure all subsystems are functioning.

### 8.1 API & Database Health Check

```bash
curl -f https://api.yourdomain.com/api/v1/health
```

Expected response (`200 OK`):
```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "redis": { "status": "up" }
  }
}
```

### 8.2 Stellar Mainnet Connectivity Verification

Query the distribution wallet balance via the API:

```bash
curl -f https://api.yourdomain.com/api/v1/stellar/balance/GYOUR_DISTRIBUTION_PUBLIC_KEY
```

Expected response:
```json
{
  "balances": [
    {
      "asset_type": "native",
      "balance": "48.5000000"
    }
  ]
}
```

---

## 9. Operations, Monitoring & Rollbacks

### 9.1 Zero-Downtime Deployment & Updates

When updating to a new version:

```bash
# 1. Fetch latest changes
git pull origin main

# 2. Rebuild images with new commit
docker compose -f docker-compose.prod.yml --env-file .env.production build backend frontend

# 3. Apply any database migrations
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm backend npm run migration:run

# 4. Restart containers with zero downtime
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --no-deps backend frontend

# 5. Clean up old dangling images
docker image prune -f
```

### 9.2 Automated Database Backups

Configure a daily cron job for PostgreSQL backups:

```bash
# Create backup directory
sudo mkdir -p /var/backups/scoopdope

# Add cron task: /etc/cron.d/scoopdope-db-backup
0 3 * * * root docker exec scoopdope-postgres-1 pg_dump -U scoopdope scoopdope | gzip > /var/backups/scoopdope/db-$(date +\%Y\%m\%d-\%H\%M\%S).sql.gz

# Retain backups for 30 days
0 4 * * * root find /var/backups/scoopdope/ -name "*.sql.gz" -mtime +30 -delete
```

### 9.3 Rollback Procedure

If a deployment fails:

1. **Revert Application Containers**:
   ```bash
   # Re-tag previous known stable image or checkout previous commit
   git checkout <PREVIOUS_COMMIT_TAG>
   docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
   ```

2. **Revert Database Migration (if needed)**:
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production exec backend npm run migration:revert
   ```

3. **Restore Database from Backup (disaster recovery)**:
   ```bash
   gunzip < /var/backups/scoopdope/db-YYYYMMDD-HHMMSS.sql.gz | \
     docker exec -i scoopdope-postgres-1 psql -U scoopdope -d scoopdope
   ```
