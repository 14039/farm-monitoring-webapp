import { Modal, Box, Typography, IconButton, Stack, Divider, Chip, LinearProgress } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { useEffect, useMemo, useState } from 'react'
import { ScatterChart, ChartsXAxis, ChartsYAxis, ChartsTooltip, ChartsGrid } from '@mui/x-charts'

type SensorRef = { hardware_id: number; name: string }

type Reading = {
  id: string
  sensor_id: number
  ts: string
  sequence?: number | null
  temperature_c?: number | null
  humidity_pct?: number | null
  capacitance_val?: number | null
  battery_v?: number | null
  rssi_dbm?: number | null
}

type Props = { open: boolean; sensor: SensorRef | null; onClose: () => void }

// NOTE: Backend requires start & end ISO8601 bounds; always include them.
const FIXED_START_ISO = '2025-09-17T00:53:13Z'
const FIXED_END_ISO = '2025-09-17T02:38:43Z'

export default function SoilSensorModal({ open, sensor, onClose }: Props) {
  const [readings, setReadings] = useState<Reading[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!open || !sensor) return
    const base = (import.meta as any).env?.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
    const urlBase = `${String(base).replace(/\/$/, '')}/api/sensors/${sensor.hardware_id}/readings`
    const url = `${urlBase}?start=${encodeURIComponent(FIXED_START_ISO)}&end=${encodeURIComponent(FIXED_END_ISO)}`

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`Failed to fetch readings: ${res.status}`)
        const data = (await res.json()) as Reading[]
        if (!cancelled) setReadings(data)
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load readings')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [open, sensor?.hardware_id])

  // Normalize capacitance (approx 1000..4000) -> 0..1 with clamping
  const soilPoints = useMemo(() => {
    const MIN = 1000
    const MAX = 4000
    const DEN = MAX - MIN
    const items = (readings ?? [])
      .filter(r => r.capacitance_val != null && !Number.isNaN(r.capacitance_val))
      .map(r => {
        const raw = Number(r.capacitance_val)
        const norm = Math.max(0, Math.min(1, (raw - MIN) / DEN))
        return { x: new Date(r.ts), y: norm }
      })
      .sort((a, b) => +a.x - +b.x)
    return items
  }, [readings])

  const metrics = useMemo(() => {
    const vals = soilPoints.map(p => p.y)
    if (vals.length === 0) return null
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length
    const latest = soilPoints[soilPoints.length - 1]
    return { min, max, avg, latest }
  }, [soilPoints])

  const xMin = useMemo(() => new Date(FIXED_START_ISO), [])
  const xMax = useMemo(() => new Date(FIXED_END_ISO), [])

  return (
    <Modal open={open} onClose={onClose}>
      <Box sx={{ position: 'absolute', top: '10vh', left: '5vw', width: '90vw', height: '80vh', bgcolor: 'background.paper', boxShadow: 24, borderRadius: 2, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5 }}>
          <Typography variant="h6" component="div">
            {sensor ? `${sensor.name} · Soil moisture (normalized)` : 'Soil moisture (normalized)'}
          </Typography>
          <IconButton size="small" onClick={onClose} aria-label="Close soil modal">
            <CloseIcon />
          </IconButton>
        </Box>
        <Divider />

        {loading && <LinearProgress sx={{ borderTopLeftRadius: 2, borderTopRightRadius: 2 }} />}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1 }}>
          <Chip
            size="small"
            label={`Window: ${
              new Intl.DateTimeFormat(undefined, {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZone: 'UTC',
                timeZoneName: 'short',
              }).format(new Date(FIXED_START_ISO))
            }  ${
              new Intl.DateTimeFormat(undefined, {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZone: 'UTC',
                timeZoneName: 'short',
              }).format(new Date(FIXED_END_ISO))
            }`}
          />
          {metrics && (
            <Stack direction="row" spacing={1} sx={{ ml: 'auto' }}>
              <Chip size="small" color="default" label={`Latest: ${metrics.latest.y.toFixed(3)}`} />
              <Chip size="small" color="primary" label={`Avg: ${metrics.avg.toFixed(3)}`} />
              <Chip size="small" color="success" label={`Max: ${metrics.max.toFixed(3)}`} />
              <Chip size="small" color="warning" label={`Min: ${metrics.min.toFixed(3)}`} />
            </Stack>
          )}
        </Box>

        <Box sx={{ flex: 1, px: 2, pb: 2 }}>
          <Box sx={{ width: '100%', height: '100%', borderRadius: 1, bgcolor: 'background.default' }}>
            <ScatterChart
              series={[{
                id: 'soil',
                label: 'Soil (normalized 0–1)',
                data: soilPoints,
                markerSize: 4,
              }]}
              xAxis={[{
                scaleType: 'time',
                min: xMin,
                max: xMax,
                label: 'Time (UTC)',
                valueFormatter: (v) => new Intl.DateTimeFormat(undefined, {
                  hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC'
                }).format(v as Date)
              }]}
              yAxis={[{ label: 'Normalized (0–1)', min: 0, max: 1 }]}
            >
              <ChartsGrid horizontal vertical />
              <ChartsXAxis />
              <ChartsYAxis />
              <ChartsTooltip />
            </ScatterChart>
          </Box>
        </Box>

        {error && (
          <Box sx={{ px: 2, pb: 2 }}>
            <Typography color="error" variant="body2">{error}</Typography>
          </Box>
        )}
      </Box>
    </Modal>
  )
}


