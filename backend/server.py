from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
import os
from typing import List, Optional
from psycopg_pool import ConnectionPool
from datetime import datetime


class Sensor(BaseModel):
    hardware_id: int
    name: str
    sensor_type: str
    gps_latitude: float
    gps_longitude: float
    metadata: Optional[dict] = None


app = FastAPI()

# Allow the Vite dev server to call this API during development.
# Accept any localhost/127.0.0.1 port to avoid CORS issues when Vite picks a random port.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_methods=["*"],
    allow_headers=["*"],
)

# Simple global connection pool (weekend-hack friendly)
pool: Optional[ConnectionPool] = None


@app.on_event("startup")
def on_startup() -> None:
    global pool
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL is not set")
    # Create a small pool; defaults are fine for a dev server
    pool = ConnectionPool(db_url, min_size=1, max_size=5)
    print("[startup] Connection pool created")
    try:
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute("select current_database(), current_user")
                dbname, dbuser = cur.fetchone()
                print(f"[startup] Connected to database='{dbname}' as user='{dbuser}'")
    except Exception as e:
        print(f"[startup] DB connectivity check failed: {e}")


@app.on_event("shutdown")
def on_shutdown() -> None:
    global pool
    if pool is not None:
        print("[shutdown] Closing connection pool")
        pool.close()
        pool = None


@app.get("/api/sensors", response_model=List[Sensor])
def list_sensors() -> List[Sensor]:
    assert pool is not None
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("set timezone to 'UTC'")
            cur.execute(
                """
                select hardware_id, name, sensor_type,
                       gps_latitude, gps_longitude,
                       coalesce(metadata, '{}'::jsonb)
                from sensor
                order by hardware_id
                """
            )
            rows = cur.fetchall()

    sensors: List[Sensor] = []
    for hardware_id, name, sensor_type, gps_latitude, gps_longitude, metadata in rows:
        meta_val = metadata
        if isinstance(meta_val, str):
            try:
                meta_val = json.loads(meta_val)
            except Exception:
                meta_val = {}
        sensors.append(
            Sensor(
                hardware_id=hardware_id,
                name=name,
                sensor_type=sensor_type,
                gps_latitude=gps_latitude,
                gps_longitude=gps_longitude,
                metadata=meta_val,
            )
        )
    print(f"[list_sensors] Fetched {len(sensors)} sensors from DB")
    return sensors



class Reading(BaseModel):
    id: str
    sensor_id: int
    ts: datetime
    sequence: Optional[int] = None
    temperature_c: Optional[float] = None
    humidity_pct: Optional[float] = None
    capacitance_val: Optional[float] = None
    battery_v: Optional[float] = None
    rssi_dbm: Optional[int] = None


@app.get("/api/sensors/{sensor_id}/readings", response_model=List[Reading])
def get_sensor_readings(sensor_id: int, start: str, end: str) -> List[Reading]:
    """
    Return readings for a specific sensor between [start, end], ordered by ts asc.
    Required params: start, end as ISO8601. Example: 2025-09-17T00:53:13Z
    """
    assert pool is not None

    try:
        start_dt = datetime.fromisoformat(start.replace("Z", "+00:00"))
        end_dt = datetime.fromisoformat(end.replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid start/end ISO8601 timestamps")

    if start_dt > end_dt:
        raise HTTPException(status_code=400, detail="start must be <= end")

    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("set timezone to 'UTC'")
            cur.execute(
                """
                select id::text, sensor_id, ts, sequence,
                       temperature_c, humidity_pct, capacitance_val,
                       battery_v, rssi_dbm
                from reading
                where sensor_id = %s and ts >= %s and ts <= %s
                order by ts asc
                """,
                (sensor_id, start_dt, end_dt),
            )
            rows = cur.fetchall()

    readings: List[Reading] = []
    for (
        id_str,
        sensor_id_val,
        ts,
        sequence,
        temperature_c,
        humidity_pct,
        capacitance_val,
        battery_v,
        rssi_dbm,
    ) in rows:
        readings.append(
            Reading(
                id=id_str,
                sensor_id=sensor_id_val,
                ts=ts,
                sequence=sequence,
                temperature_c=temperature_c,
                humidity_pct=humidity_pct,
                capacitance_val=capacitance_val,
                battery_v=battery_v,
                rssi_dbm=rssi_dbm,
            )
        )
    print(f"[get_sensor_readings] sensor_id={sensor_id} -> {len(readings)} rows")
    return readings


