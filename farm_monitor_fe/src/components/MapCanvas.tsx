import { MapContainer, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const FARM_CENTER: [number, number] = [44 + 50/60 + 24/3600, -(122 + 46/60 + 22/3600)]
const DEFAULT_ZOOM = 19
export default function MapCanvas() {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <MapContainer center={FARM_CENTER} zoom={DEFAULT_ZOOM} zoomControl={false} style={{ width: '100%', height: '100%' }}>
        <TileLayer 
          url="https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
          subdomains={["mt0","mt1","mt2","mt3"]}
          maxZoom={20}
          attribution="Imagery © Google"
        />
      </MapContainer>
    </div>
  )
}

