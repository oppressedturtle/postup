# PostUp — Deployment Guide

**Audience:** Operators deploying PostUp to a production environment.
**Summary:** Step-by-step instructions for deploying PostUp on Railway, Fly.io, or a self-managed VPS with Docker Compose + Nginx + SSL.

---

## Prerequisites

- **Node.js 20+** (only needed if building outside Docker)
- **Docker** and **Docker Compose** (VPS option)
- A **domain name** pointed at your server or platform
- An **S3-compatible object storage** account (Cloudflare R2, Backblaze B2, or AWS S3) — see [S3/Storage Options](#sstorage-options) below
- OAuth app credentials if you want GitHub and/or Google login (optional — email/password works without them)

---

## Option A: Railway (Recommended for simplicity)

Railway handles managed Postgres, Redis, builds from your Dockerfile, and SSL — no server to manage.

### 1. Push to GitHub

Ensure your code is pushed to a public or private GitHub repository under your account.

### 2. Create a Railway project

1. Go to [railway.app](https://railway.app) and create a new project.
2. Select **Deploy from GitHub repo** and connect your `postup` repository.
3. Railway auto-detects the `Dockerfile` and sets up the build pipeline.

### 3. Add a Postgres service

In your Railway project dashboard:
1. Click **+ New** → **Database** → **Add PostgreSQL**.
2. Railway provisions a Postgres 16 instance and sets `DATABASE_URL` automatically in the service environment.

### 4. Add a Redis service

1. Click **+ New** → **Database** → **Add Redis**.
2. Railway sets `REDIS_URL` automatically. Note the connection string — you will need it for `REDIS_URL`.

### 5. Set environment variables

In your Railway app service → **Variables**, set each of the following:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `NEXTAUTH_URL` | `https://your-domain.railway.app` (or your custom domain) |
| `NEXTAUTH_SECRET` | Output of `openssl rand -base64 32` |
| `DATABASE_URL` | Provided automatically by Railway Postgres service |
| `REDIS_URL` | Provided automatically by Railway Redis service |
| `S3_ENDPOINT` | Your S3-compatible endpoint URL |
| `S3_ACCESS_KEY` | Your S3 access key |
| `S3_SECRET_KEY` | Your S3 secret key |
| `S3_BUCKET` | Your bucket name (e.g. `postup-production`) |
| `GITHUB_CLIENT_ID` | (Optional) GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | (Optional) GitHub OAuth app client secret |
| `GOOGLE_CLIENT_ID` | (Optional) Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | (Optional) Google OAuth client secret |

### 6. Set the start command

In Railway → your service → **Settings** → **Deploy** → **Start command**:

```
npm run migrate:prod && npm run start:prod
```

This runs `prisma migrate deploy` to apply any pending migrations before starting the Next.js server.

### 7. Custom domain

In Railway → your service → **Settings** → **Networking**, add your custom domain and Railway provides a free TLS certificate via Let's Encrypt.

Update `NEXTAUTH_URL` to match your custom domain.

### 8. S3: Cloudflare R2 (recommended for Railway)

Cloudflare R2 is S3-compatible with no egress fees:

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **R2** → **Create bucket** (e.g. `postup-production`).
2. Go to **R2** → **Manage R2 API Tokens** → **Create API Token** with **Object Read & Write** on your bucket.
3. Note your **Account ID**, **Access Key ID**, and **Secret Access Key**.
4. Set `S3_ENDPOINT` to `https://<account-id>.r2.cloudflarestorage.com`.

---

## Option B: Fly.io

Fly.io runs your Docker container globally with built-in Postgres and Upstash Redis integrations.

### 1. Install flyctl

```bash
curl -L https://fly.io/install.sh | sh
fly auth login
```

### 2. Launch the app

From the repository root:

```bash
fly launch
```

Fly auto-detects the `Dockerfile`. Accept the defaults or customise the app name and region. This creates a `fly.toml` in the project root.

### 3. Create a Postgres database

```bash
fly postgres create --name postup-db
fly postgres attach --app <your-app-name> postup-db
```

`fly postgres attach` sets `DATABASE_URL` as a secret on your app automatically.

### 4. Add Redis via Upstash

```bash
fly redis create
```

Follow the prompts to create an Upstash Redis instance. Copy the `redis://` URL provided.

### 5. Set secrets

```bash
fly secrets set \
  NODE_ENV=production \
  NEXTAUTH_URL=https://<your-app>.fly.dev \
  NEXTAUTH_SECRET=$(openssl rand -base64 32) \
  REDIS_URL=rediss://<upstash-url> \
  S3_ENDPOINT=https://fly.storage.tigris.dev \
  S3_ACCESS_KEY=<tigris-access-key> \
  S3_SECRET_KEY=<tigris-secret-key> \
  S3_BUCKET=postup-production
```

Add OAuth secrets if needed:

```bash
fly secrets set \
  GITHUB_CLIENT_ID=... \
  GITHUB_CLIENT_SECRET=... \
  GOOGLE_CLIENT_ID=... \
  GOOGLE_CLIENT_SECRET=...
```

### 6. S3: Tigris (Fly's managed S3-compatible storage)

```bash
fly storage create
```

Tigris provisions an S3-compatible bucket and sets `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `BUCKET_NAME` as secrets. Map these to PostUp's env vars:

```bash
fly secrets set \
  S3_ENDPOINT=https://fly.storage.tigris.dev \
  S3_ACCESS_KEY=$(fly secrets list | grep AWS_ACCESS_KEY_ID) \
  S3_SECRET_KEY=$(fly secrets list | grep AWS_SECRET_ACCESS_KEY) \
  S3_BUCKET=<your-bucket-name>
```

### 7. Deploy

```bash
fly deploy
```

Fly builds and deploys your Docker image. The container `CMD` runs `./entrypoint.sh`, which executes `prisma migrate deploy` before starting the Next.js server — migrations run automatically on every deploy.

### 8. Custom domain

```bash
fly certs add your-domain.com
```

Update `NEXTAUTH_URL` to match:

```bash
fly secrets set NEXTAUTH_URL=https://your-domain.com
```

---

## Option C: VPS (DigitalOcean / Hetzner) with Docker Compose

Full control, lowest long-term cost. Recommended minimum: **Ubuntu 22.04 LTS, 2 GB RAM, 20 GB disk**.

### 1. Provision a server

Create a VPS with your provider (DigitalOcean Droplet, Hetzner Cloud VPS, etc.). Use Ubuntu 22.04 LTS.

Create the data directories that `docker-compose.prod.yml` bind-mounts:

```bash
sudo mkdir -p /opt/postup/data/postgres /opt/postup/data/redis
sudo chown -R 1001:1001 /opt/postup/data
```

### 2. Install Docker and Docker Compose

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
docker --version && docker compose version
```

### 3. Clone the repository and configure env

```bash
git clone https://github.com/oppressedturtle/postup.git /opt/postup/app
cd /opt/postup/app
cp .env.production.example .env.production
```

Edit `.env.production` with your values. At minimum:

```bash
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=<openssl rand -base64 32>
POSTGRES_PASSWORD=<strong-random-password>
DATABASE_URL=postgresql://postup:<POSTGRES_PASSWORD>@postgres:5432/postup?sslmode=disable
REDIS_PASSWORD=<strong-random-password>
REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379
S3_ENDPOINT=https://...
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_BUCKET=postup-production
```

> WARNING: Never commit `.env.production` to version control.

### 4. Configure Nginx as a reverse proxy

Install Nginx:

```bash
sudo apt update && sudo apt install -y nginx
```

Create `/etc/nginx/sites-available/postup`:

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    # Redirect HTTP to HTTPS (Certbot will update this block)
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com www.your-domain.com;

    # SSL certificates (managed by Certbot — see step 5)
    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # Security
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Proxy to PostUp (bound to 127.0.0.1:3000 in docker-compose.prod.yml)
    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Increase timeouts for large media uploads (500 MB video)
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
        client_max_body_size 520M;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/postup /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 5. SSL with Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

Certbot modifies the Nginx config and sets up automatic renewal.

### 6. Start the application

```bash
cd /opt/postup/app
docker compose -f docker-compose.prod.yml up -d --build
```

The `migrate` service runs `prisma migrate deploy` and exits before the `app` service starts. On subsequent deploys, pull the latest code and re-run:

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

### 7. Monitor

```bash
# All service logs
docker compose -f docker-compose.prod.yml logs -f

# App logs only
docker compose -f docker-compose.prod.yml logs -f app

# Service status
docker compose -f docker-compose.prod.yml ps
```

---

## Environment Variables Reference

Full reference for `.env.production`. See `.env.production.example` for the template.

Generate secrets with:
```bash
openssl rand -base64 32
```

| Variable | Required | Description | Example |
|---|---|---|---|
| `NODE_ENV` | Yes | Runtime mode | `production` |
| `NEXTAUTH_URL` | Yes | Full public URL of your deployment | `https://postup.example.com` |
| `NEXTAUTH_SECRET` | Yes | Secret for signing Auth.js sessions (min 16 chars) | `openssl rand -base64 32` output |
| `DATABASE_URL` | Yes | Postgres connection string | `postgresql://user:pass@host:5432/postup_prod?sslmode=require` |
| `POSTGRES_USER` | VPS only | Postgres user (used by docker-compose.prod.yml) | `postup` |
| `POSTGRES_PASSWORD` | VPS only | Postgres password | Strong random string |
| `POSTGRES_DB` | VPS only | Postgres database name | `postup` |
| `REDIS_URL` | Yes | Redis connection URL (include password if set) | `redis://:password@redis:6379` |
| `REDIS_PASSWORD` | VPS only | Redis `--requirepass` value (used by docker-compose.prod.yml) | Strong random string |
| `S3_ENDPOINT` | Yes | S3-compatible endpoint URL | `https://<id>.r2.cloudflarestorage.com` |
| `S3_ACCESS_KEY` | Yes | S3 access key ID | From your storage provider |
| `S3_SECRET_KEY` | Yes | S3 secret access key | From your storage provider |
| `S3_BUCKET` | Yes | S3 bucket name | `postup-production` |
| `GITHUB_CLIENT_ID` | No | GitHub OAuth app client ID | From GitHub Developer Settings |
| `GITHUB_CLIENT_SECRET` | No | GitHub OAuth app client secret | From GitHub Developer Settings |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret | From Google Cloud Console |

**OAuth callback URLs** to register with providers:
- GitHub: `https://your-domain.com/api/auth/callback/github`
- Google: `https://your-domain.com/api/auth/callback/google`

---

## Database Migrations

See [`prisma/README.md`](./prisma/README.md) for the full migration strategy (dev workflow, production deployment, rollback procedure, and CI integration).

**Key points:**
- Migrations run automatically via `scripts/entrypoint.sh` on every container start — schema and code are always in sync after deploy.
- Never run `prisma migrate dev` in production. Use `prisma migrate deploy` (or `npm run migrate:prod`).
- Seed the database on staging only: `npm run db:seed`. Never run the seed script in production.

---

## Health Monitoring

The application exposes a health check endpoint:

```
GET /api/health
```

Response (all healthy):

```json
{
  "status": "ok",
  "timestamp": "2026-06-15T12:00:00.000Z",
  "services": {
    "database": "ok",
    "redis": "ok",
    "storage": "ok"
  },
  "version": "0.1.0"
}
```

HTTP `200` when all services are healthy, `503` when any service reports an error.

**Uptime monitoring (free options):**
- [UptimeRobot](https://uptimerobot.com) — monitor `GET /api/health` every 5 minutes, alert on non-200
- [Better Uptime](https://betteruptime.com) — HTTP monitor with on-call alerts

---

## S3/Storage Options

PostUp works with any S3-compatible storage provider. Set `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, and `S3_BUCKET` accordingly.

| Provider | Free Tier | Notes |
|---|---|---|
| **Cloudflare R2** | 10 GB storage, 1M Class A ops/mo | No egress fees — best cost at scale |
| **Backblaze B2** | 10 GB storage | S3-compatible; low cost; some egress fees |
| **MinIO (self-hosted)** | Unlimited | Included in `docker-compose.yml` for local dev; uncomment in `docker-compose.prod.yml` for self-hosted prod |
| **AWS S3** | None (pay-as-you-go) | Set `S3_ENDPOINT=https://s3.amazonaws.com` (or omit for SDK region default) |
| **Tigris (Fly.io)** | 5 GB storage | Native Fly integration; provisioned via `fly storage create` |

For **AWS S3**, leave `S3_ENDPOINT` as `https://s3.amazonaws.com` and set your `S3_BUCKET` to a bucket in the region where your app is deployed.

---

## Troubleshooting

### Database connection refused

**Symptom:** App crashes at startup with `Error: Can't reach database server`.

**Cause / Fix:**
- On VPS: Postgres container may still be starting. Wait for the `migrate` service to complete (`docker compose -f docker-compose.prod.yml logs migrate`).
- Verify `DATABASE_URL` is correct and the Postgres service is healthy: `docker compose -f docker-compose.prod.yml ps`.
- If using a managed database (Railway, Neon, Supabase), ensure `?sslmode=require` is in the connection string.

### Redis auth failure

**Symptom:** `ReplyError: NOAUTH Authentication required`.

**Cause / Fix:**
- The `REDIS_URL` must include the password: `redis://:your-redis-password@redis:6379`.
- `REDIS_PASSWORD` in `docker-compose.prod.yml` must match the password in `REDIS_URL`.

### Prisma Client not generated

**Symptom:** `Error: @prisma/client did not initialize yet`.

**Cause / Fix:**
- The Dockerfile runs `npx prisma generate` in the builder stage. If you are running outside Docker, run `npm run db:generate` manually before starting the server.
- In CI, add `npx prisma generate` before `npm run build`.

### Zod env validation error at startup

**Symptom:** `ZodError: ... NEXTAUTH_SECRET: Required`.

**Cause / Fix:**
- A required environment variable is missing or empty. Read the full Zod error output — it lists every failing field with the expected type.
- Confirm `.env.production` is present and loaded (`env_file: .env.production` in `docker-compose.prod.yml`).

### Large video uploads failing

**Symptom:** `413 Request Entity Too Large` from Nginx.

**Cause / Fix:**
- Add `client_max_body_size 520M;` to the Nginx `server` block (the sample config above includes this).
- Also increase `proxy_read_timeout` and `proxy_send_timeout` to at least `600s`.

### Resetting the database (last resort)

> WARNING: This destroys all data. Only do this on a fresh staging instance.

```bash
# Connect to the Postgres container
docker compose -f docker-compose.prod.yml exec postgres psql -U postup

# Inside psql:
DROP DATABASE postup;
CREATE DATABASE postup;
\q

# Re-run migrations
docker compose -f docker-compose.prod.yml run --rm migrate
```
