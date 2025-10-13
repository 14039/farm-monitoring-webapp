## Farm Monitoring - Quickstart (Porter + Postgres + FastAPI + Vite)

Copy/paste these commands top-to-bottom in separate terminals as noted. This repo is hack-first: passwords/tokens are embedded for convenience.

### TL;DR – Start Everything (3 terminals)

Terminal A – Porter DB tunnel (keep open):

```bash
porter auth login
porter cluster list
porter datastore connect farm-db
# Leave this running. It forwards 127.0.0.1:8122 -> in-cluster Postgres 5432
```

Terminal B – Backend API (FastAPI/Uvicorn):

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt || pip install fastapi uvicorn pydantic "psycopg[binary]>=3.1" python-dotenv

# Local tunnel DB URL (matches Porter tunnel above)
export DATABASE_URL="postgresql://postgres:hZq4hbPWwOvuZCPp0dEr@127.0.0.1:8122/postgres?sslmode=disable"

uvicorn server:app --reload --port 8000
```

Terminal C – Frontend (Vite/React/TS):

```bash
cd frontend
npm install
VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev
```

Open the URL Vite prints (typically http://127.0.0.1:5173/). You should see the map and markers.

---

### Database Setup (first time only)

Terminal A – start/keep the tunnel open (same as above):

```bash
porter datastore connect farm-db
```

Terminal D – Schema + Seed (run once):

```bash
cd "$(git rev-parse --show-toplevel)"

# Point psql and scripts at the tunnel
export PGHOST=127.0.0.1
export PGPORT=8122
export PGUSER=postgres
export PGPASSWORD='hZq4hbPWwOvuZCPp0dEr'
export PGDATABASE=postgres
export DATABASE_URL="postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/${PGDATABASE}?sslmode=disable"

# Verify connection
psql -c "select now(), current_database(), current_user;"

# Create schema
psql -f schema.sql

# Install python driver + ingest sample CSV
pip install "psycopg[binary]>=3.1"
python backend/db_ingest_data.py --csv llm_context/data_log_sample.csv

# Sanity checks
psql -c "select count(*) as sensors from sensor;"
psql -c "select count(*) as readings from reading;"
psql -c "select name, gps_latitude, gps_longitude from sensor order by name;"
```

Update GPS coordinates (example already applied for three sensors):

```bash
psql <<'SQL'
begin;
update sensor set gps_latitude=44.8433287, gps_longitude=-122.7733833 where name='north-pasture';
update sensor set gps_latitude=44.8397076, gps_longitude=-122.7728281 where name='high-tunnel';
update sensor set gps_latitude=44.8401558, gps_longitude=-122.7732289 where name='test-tx';
commit;
SQL
```

---

### Running the Backend Against the Cluster (local vs in-cluster)

- Local development: use the Porter tunnel as shown; set `DATABASE_URL` to 127.0.0.1:8122 with `sslmode=disable`.
- Deployed on Porter (inside cluster): set `DATABASE_URL` to the in-cluster DNS service (no tunnel needed):

```bash
# Example in-cluster URL (adjust if your service name/namespace differ)
export DATABASE_URL="postgresql://postgres:hZq4hbPWwOvuZCPp0dEr@farm-db-postgres-hl.default.svc.cluster.local:5432/postgres?sslmode=disable"
```

Add this env var to your Porter app via the dashboard and redeploy.

---

### Porter Handy Commands

```bash
# Login / context
porter auth login
porter config
porter cluster list

# Open dashboard in browser
open https://dashboard.porter.run

# Start DB tunnel (keep window open)
porter datastore connect farm-db

# If you have multiple datastores, list/select
porter datastore list
```

---

### Troubleshooting

Ports already in use:

```bash
# Kill whatever is listening on a port (e.g., 8000 or 5173)
lsof -nP -iTCP:8000 -sTCP:LISTEN -t | xargs -r kill
lsof -nP -iTCP:5173 -sTCP:LISTEN -t | xargs -r kill

# If the Porter tunnel died, restart it
porter datastore connect farm-db
```

#### Resetting the backend cleanly on port 8000 (uvicorn --reload)

Uvicorn's `--reload` uses a parent/child process model; a child can continue to hold the port after the parent is stopped (Ctrl-Z) or crashes.

Steps to reset:

```bash
# 1) Inspect and kill any listeners on 8000/8001
sudo lsof -nP -i :8000
sudo lsof -nP -i :8001
sudo lsof -ti :8000 | xargs -r sudo kill -9
sudo lsof -ti :8001 | xargs -r sudo kill -9

# 2) Also clear any uvicorn workers for this app
pkill -f "uvicorn .* backend\.server:app" || true

# 3) Start backend consistently on 8000
export DATABASE_URL="postgresql://postgres:hZq4hbPWwOvuZCPp0dEr@127.0.0.1:8122/postgres?sslmode=disable"
uvicorn backend.server:app --reload --host 127.0.0.1 --port 8000

# 4) Point the frontend at 8000
cd frontend
VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev
```

`psql` works but Python can’t connect:

```bash
# Ensure DATABASE_URL points at the tunnel host/port (not the in-cluster DNS)
export DATABASE_URL="postgresql://postgres:hZq4hbPWwOvuZCPp0dEr@127.0.0.1:8122/postgres?sslmode=disable"
python - <<'PY'
import os, psycopg
print('Connecting to', os.environ['DATABASE_URL'])
with psycopg.connect(os.environ['DATABASE_URL']) as conn:
    with conn.cursor() as cur:
        cur.execute('select 1')
        print('OK:', cur.fetchone())
PY
```

Reset/inspect env vars while debugging:

```bash
export | egrep 'PG(HOST|PORT|USER|PASSWORD|DATABASE)|DATABASE_URL'
```

Common DB errors:

- `could not translate host name "*.svc.cluster.local"`: you’re using the in-cluster DNS from your laptop. Use the tunnel URL (127.0.0.1:8122) locally.
- `permission denied` on schema creation: ensure you’re `postgres` user (as above) or adjust roles.
- `duplicate key` on re-ingest: expected; readings are deduped by `(sensor_id, ts)` and will be skipped.

---

### Useful One-liners

```bash
# Re-seed quickly (safe to re-run; duplicates skipped)
python backend/db_ingest_data.py --csv llm_context/data_log_sample.csv

# Verify API
curl -s http://127.0.0.1:8000/healthz | jq .
curl -s http://127.0.0.1:8000/api/sensors | jq '.[0]'

# Update one sensor position
psql -c "update sensor set gps_latitude=44.84, gps_longitude=-122.77 where name='north-pasture';"
```

---

### Secrets (intentionally hard-coded for hackability)

- Postgres superuser: `postgres`
- Postgres password: `hZq4hbPWwOvuZCPp0dEr`
- Local tunnel: `127.0.0.1:8122` (run `porter datastore connect farm-db`)

Rotate these at will in Porter; update the values here to match if you change them.


