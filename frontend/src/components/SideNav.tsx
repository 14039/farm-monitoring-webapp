import { useState } from 'react'
import { Box, Button, Paper, Stack } from '@mui/material'

export default function SideNav() {
  const [open, setOpen] = useState(false)

  return (
    <Box sx={{ width: { xs: '70vw', sm: '40vw', md: '24vw', lg: '20vw' } }}>
      <Button
        fullWidth
        variant="contained"
        color="primary"
        onClick={() => setOpen((v) => !v)}
        sx={{
          borderRadius: 2,
          px: 2,
          py: 1.5,
          textTransform: 'none',
          justifyContent: 'flex-start',
          gap: 1.5,
          ':hover': { filter: 'brightness(0.95)' }
        }}
        startIcon={<Box component="img" src="/logo.avif" alt="Sublime Organics" sx={{ width: 28, height: 28, borderRadius: 0.5 }} />}
      >
        Sublime Organics
      </Button>

      {open && (
        <Paper elevation={6} sx={{ mt: 1, borderRadius: 2, height: 'calc(100vh - 88px)', width: '100%' }}>
          <Stack p={2} spacing={1}>
            <Button variant="outlined">Action 1</Button>
            <Button variant="outlined">Action 2</Button>
            <Button variant="outlined">Action 3</Button>
          </Stack>
        </Paper>
      )}
    </Box>
  )
}

