import { CssBaseline, ThemeProvider, createTheme, Box } from '@mui/material'
import MapCanvas from './components/MapCanvas'
import SideNav from './components/SideNav'

const theme = createTheme({})

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ width: '100vw', height: '100vh', display: 'flex' }}>
        <Box sx={{ position: 'absolute', top: 16, left: 16, zIndex: 1000 }}>
          <SideNav />
        </Box>
        <Box sx={{ flex: 1 }}>
          <MapCanvas />
        </Box>
      </Box>
    </ThemeProvider>
  )
}

