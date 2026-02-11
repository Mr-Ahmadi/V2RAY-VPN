import React, { useState, useEffect } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Menu,
  MenuItem,
  Box,
  Chip,
} from '@mui/material';
import {
  MoreVert as MoreIcon,
  VpnKey as VpnIcon,
} from '@mui/icons-material';

interface ConnectionStatus {
  connected: boolean;
  currentServer?: any;
}

export default function Navbar() {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [status, setStatus] = useState<ConnectionStatus>({ connected: false });

  useEffect(() => {
    // Poll connection status
    const checkStatus = async () => {
      try {
        const result = await window.electronAPI.v2ray.getStatus();
        if (result.success) {
          setStatus(result.data);
        }
      } catch (error) {
        console.error('Error checking status:', error);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleDisconnect = async () => {
    try {
      await window.electronAPI.v2ray.disconnect();
      setStatus({ connected: false });
    } catch (error) {
      console.error('Disconnect error:', error);
    }
    handleMenuClose();
  };

  return (
    <AppBar
      position="static"
      sx={{
        background: 'linear-gradient(90deg, #0f172a 0%, #1e293b 100%)',
        borderBottom: '1px solid rgba(99, 102, 241, 0.1)',
      }}
    >
      <Toolbar>
        <Typography
          variant="h6"
          sx={{
            flexGrow: 1,
            fontWeight: 700,
            background: 'linear-gradient(90deg, #6366f1, #ec4899)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          V2Ray VPN
        </Typography>

        {status.connected && (
          <>
            <Box sx={{ mr: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
              <VpnIcon sx={{ color: '#10b981', fontSize: 20 }} />
              <Chip
                label={status.currentServer?.name || 'Connected'}
                size="small"
                sx={{
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  color: '#10b981',
                }}
              />
            </Box>
            <Button
              id="menu-button"
              onClick={handleMenuOpen}
              color="inherit"
              sx={{ minWidth: 40, '&:hover': { backgroundColor: 'rgba(99, 102, 241, 0.1)' } }}
            >
              <MoreIcon />
            </Button>
            <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
              <MenuItem onClick={handleDisconnect} sx={{ color: '#ef4444' }}>
                Disconnect VPN
              </MenuItem>
            </Menu>
          </>
        )}
      </Toolbar>
    </AppBar>
  );
}
