from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pathlib import Path
import json
from typing import List, Optional


# NOTE: This file currently reads from a JSON file as a stand-in for a real database.
# When the hosted database is provisioned, replace the JSON-loading logic with real DB queries.
# Look for sections marked with "REPLACE WITH REAL DB CALL".


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


DATA_PATH = Path(__file__).parent / "data" / "sensors.json"


def load_sensors_from_json() -> List[Sensor]:
    """
    REPLACE WITH REAL DB CALL:
    - This function currently loads sensors from a JSON file on disk to simulate a database.
    - In production, replace this with a query to your hosted database (e.g., PostgreSQL)
      that selects rows from the `sensor` table and maps them to the Sensor model.
    """
    with DATA_PATH.open("r", encoding="utf-8") as f:
        raw = json.load(f)
    return [Sensor(**item) for item in raw]


@app.get("/api/sensors", response_model=List[Sensor])
def list_sensors() -> List[Sensor]:
    """
    Return all sensors for map display.

    REPLACE WITH REAL DB CALL:
    - Currently delegates to `load_sensors_from_json()` to simulate data retrieval.
    - Later, implement a database query here and return the rows.
    """
    return load_sensors_from_json()



