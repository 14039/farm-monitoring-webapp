import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useState } from 'react'
import L from 'leaflet'
import CameraModal from './CameraModal'
import SoilSensorModal from './SoilSensorModal'
import TemperatureModal from './TemperatureModal'
import ReactDOMServer from 'react-dom/server'


type Sensor = {
  hardware_id: number
  name: string
  sensor_type: string
  gps_latitude: number
  gps_longitude: number
  metadata?: unknown
}

const FARM_CENTER: [number, number] = [44 + 50/60 + 24/3600, -(122 + 46/60 + 22/3600)]
const DEFAULT_ZOOM = 19
export default function MapCanvas() {
  const [sensors, setSensors] = useState<Sensor[]>([])
  const [error, setError] = useState<string | null>(null)
  const [openCamera, setOpenCamera] = useState(false)
  const [openSoil, setOpenSoil] = useState(false)
  const [openTemp, setOpenTemp] = useState(false)
  const [selectedSensor, setSelectedSensor] = useState<Sensor | null>(null)
  const [selectedSoilSensor, setSelectedSoilSensor] = useState<Sensor | null>(null)
  const [mapCenter, setMapCenter] = useState<[number, number]>(FARM_CENTER)
  const [mapKey, setMapKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const base = (import.meta as any).env?.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
      const url = `${String(base).replace(/\/$/, '')}/api/sensors`

      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`Failed to fetch sensors: ${res.status}`)
        const data = (await res.json()) as Sensor[]
        if (!cancelled) setSensors(data)
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load sensors')
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <MapContainer key={mapKey} center={mapCenter} zoom={DEFAULT_ZOOM} zoomControl={false} style={{ width: '100%', height: '100%' }}>
        <TileLayer 
          url="https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
          subdomains={["mt0","mt1","mt2","mt3"]}
          maxZoom={20}
          attribution="Imagery © Google"
        />
        {sensors.map((s) => (
          <PinMarker key={s.hardware_id} sensor={s} onClick={(sensor) => {
            // Recreate the map centered on the sensor (same as initial mount behavior)
            setMapCenter([sensor.gps_latitude, sensor.gps_longitude])
            setMapKey((k) => k + 1)
            const type = sensor.sensor_type
            if (type === 'camera') {
              setOpenCamera(true)
            } else if (type === 'soil') {
              setSelectedSoilSensor(sensor)
              setOpenSoil(true)
            } else {
              setSelectedSensor(sensor)
              setOpenTemp(true)
            }
          }} />
        ))}
      </MapContainer>
      <CameraModal open={openCamera} onClose={() => setOpenCamera(false)} />
      <SoilSensorModal
        open={openSoil}
        sensor={selectedSoilSensor ? { hardware_id: selectedSoilSensor.hardware_id, name: selectedSoilSensor.name } : null}
        onClose={() => {
          setOpenSoil(false)
          setSelectedSoilSensor(null)
        }}
      />
      <TemperatureModal
        open={openTemp}
        sensor={selectedSensor}
        onClose={() => {
          setOpenTemp(false)
          setSelectedSensor(null)
        }}
      />
      {error && (
        <div style={{
          position: 'absolute', bottom: 12, left: 12, padding: '8px 12px',
          background: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: 8, fontSize: 12
        }}>
          {error}
        </div>
      )}
    </div>
  )
}

function PinMarker({ sensor, onClick }: { sensor: Sensor, onClick?: (s: Sensor) => void }) {
  const iconUrl = getIconForSensor(sensor.sensor_type)
  const html = ReactDOMServer.renderToString(
    <div style={{ position: 'relative', width: 64, height: 80 }}>
      {/* Inline SVG (Material "LocationOn" style) with hardcoded fill */}
      <svg viewBox="0 0 24 24" width={64} height={80} style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.35))' }}>
        <path
          // Teardrop shape
          d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 11.5c-1.93 0-3.5-1.57-3.5-3.5S10.07 6.5 12 6.5s3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"
          fill="#1976d2"
        />
      </svg>
      <img src={iconUrl} alt={sensor.sensor_type} style={{ position: 'absolute', left: '50%', top: '40%', width: 56, height: 56, transform: 'translate(-50%, -50%)' }} />
    </div>
  )
  const icon = L.divIcon({ className: '', html, iconSize: [64, 80], iconAnchor: [32, 80] })

  const handleClick = () => {
    onClick?.(sensor)
  }

  return (
    <Marker position={[sensor.gps_latitude, sensor.gps_longitude]} icon={icon} eventHandlers={{ click: handleClick }}>
      <Popup>
        <div style={{ minWidth: 180 }}>
          <div style={{ fontWeight: 600 }}>{sensor.name}</div>
          <div>Type: {sensor.sensor_type}</div>
          <div>ID: {sensor.hardware_id}</div>
        </div>
      </Popup>
    </Marker>
  )
}

function getIconForSensor(type: string): string {
  const base = ((import.meta as any).env?.BASE_URL ?? '/') as string
  switch (type) {
    case 'camera':
      return `${base}icons/camera_icon.png`
    case 'soil':
      return `${base}icons/soil_icon.png`
    case 'temperature':
    default:
      return `${base}icons/temp_icon.png`
  }
}

