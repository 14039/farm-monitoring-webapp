import os, csv, zlib, json, argparse
from datetime import datetime, timezone
import psycopg

def parse_float(v):
    try:
        if v is None: return None
        v = str(v).strip()
        if v == "" or v.lower() == "nan": return None
        return float(v)
    except Exception:
        return None

def parse_int(v):
    try:
        if v is None: return None
        v = str(v).strip()
        if v == "": return None
        return int(float(v))
    except Exception:
        return None

def parse_ts(s):
    if not s: return None
    s = s.strip()
    # Expect ISO8601 like 2025-09-17T00:53:13Z
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None

def stable_hardware_id(tx_id: str) -> int:
    # Deterministic 32-bit id based on TX ID; fits BIGINT and is stable across runs
    return 1000 + (zlib.crc32(tx_id.encode("utf-8")) & 0x7FFFFFFF)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", required=True, help="Path to data_log_sample.csv")
    parser.add_argument("--default-lat", type=float, default=(44 + 50/60 + 24/3600))   # 44°50′24″N
    parser.add_argument("--default-lon", type=float, default=-(122 + 46/60 + 22/3600)) # 122°46′22″W
    parser.add_argument("--sensor-type", default="temperature")
    parser.add_argument("--batch-size", type=int, default=1000)
    args = parser.parse_args()

    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise SystemExit("Set DATABASE_URL")

    sensors = {}  # tx_id -> dict(...)
    readings = []

    with open(args.csv, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Skip malformed rows (some CSVs have a JSON blob in first line)
            date_str = (row.get("Date") or "").strip()
            if not date_str or date_str.startswith("{"):
                continue

            tx_id = (row.get("TX ID") or "").strip()
            if not tx_id:
                continue

            ts = parse_ts(date_str)
            if ts is None:
                continue

            # Build/record sensor (one per TX ID)
            if tx_id not in sensors:
                sensors[tx_id] = {
                    "hardware_id": stable_hardware_id(tx_id),
                    "name": tx_id,
                    "sensor_type": args.sensor_type,
                    "gps_latitude": args.default_lat,
                    "gps_longitude": args.default_lon,
                    "metadata": {
                        "source": "csv_import",
                    },
                }

            sensor_id = sensors[tx_id]["hardware_id"]

            # Parse numeric fields safely
            seq = parse_int(row.get("Sequence #"))
            vbat = parse_float(row.get("V_battery"))
            temp_c = parse_float(row.get("temp_c"))
            rh_pct = parse_float(row.get("RH %"))
            rssi = parse_int(row.get("rssi (signal strength)"))

            readings.append({
                "sensor_id": sensor_id,
                "ts": ts,
                "sequence": seq,
                "temperature_c": temp_c,
                "humidity_pct": rh_pct,
                "capacitance_val": None,  # not present in this CSV
                "battery_v": vbat,
                "rssi_dbm": rssi,
            })

    # Insert into Postgres
    with psycopg.connect(db_url) as conn:
        conn.execute("set timezone to 'UTC'")
        with conn.cursor() as cur:
            # Upsert sensors
            sensor_rows = []
            for s in sensors.values():
                sensor_rows.append((
                    s["hardware_id"],
                    s["name"],
                    s["sensor_type"],
                    s["gps_latitude"],
                    s["gps_longitude"],
                    json.dumps(s["metadata"]),
                ))
            if sensor_rows:
                cur.executemany("""
                    insert into sensor (hardware_id, name, sensor_type, gps_latitude, gps_longitude, metadata)
                    values (%s, %s, %s, %s, %s, %s::jsonb)
                    on conflict (hardware_id) do update
                      set name = excluded.name,
                          sensor_type = excluded.sensor_type,
                          gps_latitude = excluded.gps_latitude,
                          gps_longitude = excluded.gps_longitude,
                          metadata = excluded.metadata
                """, sensor_rows)

            # Batch insert readings with ON CONFLICT ignore (unique(sensor_id, ts))
            bs = max(1, args.batch_size)
            for i in range(0, len(readings), bs):
                chunk = readings[i:i+bs]
                cur.executemany("""
                    insert into reading (sensor_id, ts, sequence, temperature_c, humidity_pct, capacitance_val, battery_v, rssi_dbm)
                    values (%(sensor_id)s, %(ts)s, %(sequence)s, %(temperature_c)s, %(humidity_pct)s, %(capacitance_val)s, %(battery_v)s, %(rssi_dbm)s)
                    on conflict (sensor_id, ts) do nothing
                """, chunk)

        conn.commit()

    print(f"Upserted {len(sensors)} sensors; inserted {len(readings)} readings (duplicates skipped).")

if __name__ == "__main__":
    main()