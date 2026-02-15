import React, { useState, useEffect } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Menu,
  MenuItem,
  Box,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  MoreVert as MoreIcon,
  VpnKey as VpnIcon,
  BugReport as BugIcon,
} from '@mui/icons-material';
import LogViewer from './LogViewer';

interface ConnectionStatus {
  connected: boolean;
  currentServer?: any;
}

export default function Navbar() {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [status, setStatus] = useState<ConnectionStatus>({ connected: false });
  const [logsOpen, setLogsOpen] = useState(false);

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
    <>
      <AppBar
        position="sticky"
        sx={{
          top: 0,
          zIndex: theme => theme.zIndex.drawer + 2,
          background: 'linear-gradient(90deg, rgba(17, 28, 39, 0.92) 0%, rgba(20, 34, 53, 0.9) 100%)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          borderBottom: '1px solid var(--border-light)',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)',
        }}
      >
        <Toolbar sx={{ minHeight: { xs: 56, sm: 64 }, px: { xs: 1.5, sm: 2.5 } }}>
          <Typography
            variant="h6"
            sx={{
              flexGrow: 1,
              fontWeight: 700,
              letterSpacing: 0.2,
              background: 'linear-gradient(90deg, var(--primary), var(--accent))',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            V2Ray VPN
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Tooltip title="View Logs">
              <IconButton onClick={() => setLogsOpen(true)} size="small" sx={{ color: 'var(--text-secondary)' }}>
                <BugIcon fontSize="small" />
              </IconButton>
            </Tooltip>

            {!status.connected && (
              <Chip
                label="Disconnected"
                size="small"
                sx={{
                  backgroundColor: 'rgba(148, 163, 184, 0.14)',
                  color: 'var(--text-secondary)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                }}
              />
            )}

            {status.connected && (
              <>
                <Box sx={{ mr: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <VpnIcon sx={{ color: 'var(--success)', fontSize: 20 }} />
                  <Chip
                    label={status.currentServer?.name || 'Connected'}
                    size="small"
                    sx={{
                      backgroundColor: 'rgba(34, 197, 94, 0.12)',
                      color: 'var(--success)',
                    }}
                  />
                </Box>
                <IconButton
                  id="menu-button"
                  onClick={handleMenuOpen}
                  color="inherit"
                  sx={{ minWidth: 40, '&:hover': { backgroundColor: 'rgba(20, 184, 166, 0.12)' } }}
                >
                  <MoreIcon />
                </IconButton>
                <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
                  <MenuItem onClick={handleDisconnect} sx={{ color: '#ef4444' }}>
                    Disconnect VPN
                  </MenuItem>
                </Menu>
              </>
            )}
          </Box>
        </Toolbar>
      </AppBar>

      <LogViewer open={logsOpen} onClose={() => setLogsOpen(false)} />
    </>
  );
}
