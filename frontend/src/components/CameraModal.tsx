import { Modal, Box, Typography } from '@mui/material'

type Props = { open: boolean; onClose: () => void }

export default function CameraModal({ open, onClose }: Props) {
  return (
    <Modal open={open} onClose={onClose}>
      <Box sx={{ position: 'absolute', top: '14vh', left: '5vw', width: '90vw', height: '72vh', bgcolor: 'background.paper', boxShadow: 24, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="h4" textAlign="center">Work In Progress: camera Modal</Typography>
      </Box>
    </Modal>
  )
}


