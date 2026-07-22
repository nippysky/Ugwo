# Deploying ugwo-api to the NIPPYSKY droplet

Target: the existing DigitalOcean droplet at `178.128.165.128` (nippysky-svr),
alongside `aku-api`. Ụgwọ gets its own folder, its own Postgres database on the
shared instance, its own PM2 process on **port 3001**, and its own nginx site
for `ugwo.nippysky.com`.

Everything below mirrors the aku-api layout at `/var/www/aku-api`.

---

## 0. One-time prerequisites

### DNS
Add an **A record** for `ugwo.nippysky.com` → `178.128.165.128` (same as aku).
Wait for it to propagate before running certbot (step 6).

### Resend
`nippysky.com` is already verified on Resend. Create a **new API key** named
`ugwo-api` at https://resend.com/api-keys and keep it for step 4.

---

## 1. Create the database (shared Postgres instance, separate DB)

```bash
ssh root@178.128.165.128
sudo -u postgres psql
```

```sql
CREATE USER ugwo_user WITH PASSWORD '<generate a strong password>';
CREATE DATABASE ugwo_db OWNER ugwo_user;
\q
```

## 2. Upload the server code

From your Mac (project root `~/Documents/Projects/ugwo`):

```bash
rsync -avz --delete --exclude node_modules --exclude dist --exclude .env --exclude logs \
  server/ root@178.128.165.128:/var/www/ugwo-api/
```

`--delete` mirrors the droplet to match `server/` exactly — without it, files you delete
locally (e.g. an old route) stay behind on the server and can break the next build.

`--exclude logs` matters just as much: `logs/` is created once on the droplet (step 3)
and isn't tracked in the local repo, so without this exclude, `--delete` wipes it on
every redeploy. PM2 needs that folder to open its log file handles when it spawns the
process — if it's missing, the app can crash-loop on startup with an empty/misleading
error log (this happened during the auth-hardening deploy on 2026-07-22).

(Repeat this same command for every future deploy.)

## 3. Install + build on the droplet

```bash
ssh root@178.128.165.128
cd /var/www/ugwo-api
mkdir -p logs
npm install
```

## 4. Configure the environment

```bash
cp .env.example .env
nano .env
```

Fill in:

- `DATABASE_URL` — the password from step 1
- `JWT_SECRET`   — `node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"`
- `SERVER_DEK_MASTER_KEY` — `openssl rand -hex 32`  (generate ONCE, back it up — see warning in .env.example)
- `RESEND_API_KEY` — the key from step 0
- Leave `PORT=3001`, `API_URL=https://ugwo.nippysky.com`, `APP_SCHEME=ugwo`

## 5. Create tables + start the process

```bash
cd /var/www/ugwo-api
npm run db:push          # drizzle-kit creates the tables in ugwo_db
npm run build
pm2 start ecosystem.config.cjs --env production
pm2 save
curl http://localhost:3001/health   # → {"status":"ok",...}
```

## 6. nginx + TLS

```bash
cp /var/www/ugwo-api/nginx-ugwo.conf /etc/nginx/sites-available/ugwo
ln -s /etc/nginx/sites-available/ugwo /etc/nginx/sites-enabled/ugwo
nginx -t && systemctl reload nginx

# After DNS has propagated:
certbot --nginx -d ugwo.nippysky.com
```

Certbot rewrites the site file with the SSL blocks (same flow as aku).

## 7. Verify

```bash
curl https://ugwo.nippysky.com/health          # API through nginx
curl -I https://ugwo.nippysky.com/             # landing page
curl -I https://ugwo.nippysky.com/privacy      # clean legal URLs
```

Then from the app (point `EXPO_PUBLIC_API_URL=https://ugwo.nippysky.com`),
request a magic link and confirm the email arrives from `Ụgwọ <auth@nippysky.com>`.

---

## Redeploying after changes

```bash
# Mac
rsync -avz --delete --exclude node_modules --exclude dist --exclude .env --exclude logs \
  server/ root@178.128.165.128:/var/www/ugwo-api/

# Droplet
cd /var/www/ugwo-api && npm install && npm run build && pm2 restart ugwo-api
```

If `pm2 restart` ever errors with "Process not found" or the app shows `stopped` with
`uptime: 0` in `pm2 list`, don't fight it — just reset the entry cleanly:

```bash
pm2 delete ugwo-api
pm2 start ecosystem.config.cjs --only ugwo-api --env production
pm2 save
```

Static site changes (server/public) need no restart — nginx serves them directly.

## Useful commands

```bash
pm2 logs ugwo-api          # live logs
pm2 status                 # process health
sudo -u postgres psql ugwo_db   # inspect the DB
```

## Store-listing URLs (Apple + Google)

- Privacy policy:   https://ugwo.nippysky.com/privacy
- Terms of service: https://ugwo.nippysky.com/terms
- Account deletion: https://ugwo.nippysky.com/delete-account
- Support contact:  contact@nippysky.com
