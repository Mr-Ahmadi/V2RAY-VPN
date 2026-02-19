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
  Remove as MinimizeIcon,
  CropSquare as MaximizeIcon,
  FilterNone as RestoreIcon,
  Close as CloseIcon,
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
  const [isMaximized, setIsMaximized] = useState(false);
  const [platform, setPlatform] = useState<string>('unknown');

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

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const loadWindowState = async () => {
      try {
        const [stateResult, platformResult] = await Promise.all([
          window.electronAPI.window.getState(),
          window.electronAPI.window.getPlatform(),
        ]);
        if (stateResult?.success && stateResult.data) {
          setIsMaximized(Boolean(stateResult.data.isMaximized));
        }
        if (platformResult?.success && platformResult.data) {
          setPlatform(platformResult.data);
        }
      } catch (error) {
        console.error('Error loading window state:', error);
      }
    };

    loadWindowState();
    unsubscribe = window.electronAPI.window.onStateChanged((state) => {
      setIsMaximized(Boolean(state?.isMaximized));
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
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

  const handleMinimize = async () => {
    try {
      await window.electronAPI.window.minimize();
    } catch (error) {
      console.error('Minimize error:', error);
    }
  };

  const handleToggleMaximize = async () => {
    try {
      const result = await window.electronAPI.window.toggleMaximize();
      if (result?.success && result.data) {
        setIsMaximized(Boolean(result.data.isMaximized));
      }
    } catch (error) {
      console.error('Toggle maximize error:', error);
    }
  };

  const handleCloseWindow = async () => {
    try {
      await window.electronAPI.window.close();
    } catch (error) {
      console.error('Close window error:', error);
    }
  };

  const isMac = platform === 'darwin';

  const macWindowControls = (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        pl: 0.5,
        WebkitAppRegion: 'no-drag',
      }}
    >
      <Tooltip title="Close">
        <IconButton
          aria-label="Close window"
          onClick={handleCloseWindow}
          sx={{
            width: 13,
            height: 13,
            p: 0,
            backgroundColor: '#ff5f57',
            border: '1px solid rgba(0,0,0,0.35)',
            '&:hover': { backgroundColor: '#ff3b30' },
          }}
        />
      </Tooltip>
      <Tooltip title="Minimize">
        <IconButton
          aria-label="Minimize window"
          onClick={handleMinimize}
          sx={{
            width: 13,
            height: 13,
            p: 0,
            backgroundColor: '#ffbd2e',
            border: '1px solid rgba(0,0,0,0.35)',
            '&:hover': { backgroundColor: '#f6a700' },
          }}
        />
      </Tooltip>
      <Tooltip title={isMaximized ? 'Restore' : 'Zoom'}>
        <IconButton
          aria-label={isMaximized ? 'Restore window' : 'Zoom window'}
          onClick={handleToggleMaximize}
          sx={{
            width: 13,
            height: 13,
            p: 0,
            backgroundColor: '#28c840',
            border: '1px solid rgba(0,0,0,0.35)',
            '&:hover': { backgroundColor: '#1fad36' },
          }}
        />
      </Tooltip>
    </Box>
  );

  const windowsWindowControls = (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'stretch',
        ml: 0.5,
        WebkitAppRegion: 'no-drag',
      }}
    >
      <IconButton
        aria-label="Minimize window"
        onClick={handleMinimize}
        size="small"
        sx={{
          width: 36,
          height: 26,
          borderRadius: 0,
          color: 'var(--text-secondary)',
          '&:hover': { backgroundColor: 'rgba(148, 163, 184, 0.2)' },
        }}
      >
        <MinimizeIcon sx={{ fontSize: 14 }} />
      </IconButton>
      <IconButton
        aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
        onClick={handleToggleMaximize}
        size="small"
        sx={{
          width: 36,
          height: 26,
          borderRadius: 0,
          color: 'var(--text-secondary)',
          '&:hover': { backgroundColor: 'rgba(148, 163, 184, 0.2)' },
        }}
      >
        {isMaximized ? <RestoreIcon sx={{ fontSize: 13 }} /> : <MaximizeIcon sx={{ fontSize: 13 }} />}
      </IconButton>
      <IconButton
        aria-label="Close window"
        onClick={handleCloseWindow}
        size="small"
        sx={{
          width: 44,
          height: 26,
          borderRadius: 0,
          color: 'var(--text-secondary)',
          '&:hover': {
            backgroundColor: 'rgba(239, 68, 68, 0.9)',
            color: '#ffffff',
          },
        }}
      >
        <CloseIcon sx={{ fontSize: 14 }} />
      </IconButton>
    </Box>
  );

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
          WebkitAppRegion: 'drag',
        }}
      >
        <Toolbar sx={{ minHeight: { xs: 40, sm: 42 }, px: { xs: 1, sm: 1.25 }, gap: 0.75 }}>
          {isMac && macWindowControls}
          <Typography
            variant="h6"
            sx={{
              flexGrow: 1,
              fontWeight: 700,
              letterSpacing: 0.2,
              fontSize: { xs: '0.92rem', sm: '0.98rem' },
              background: 'linear-gradient(90deg, var(--primary), var(--accent))',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            V2Ray VPN
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, WebkitAppRegion: 'no-drag' }}>
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
                  height: 20,
                  fontSize: '0.7rem',
                  backgroundColor: 'rgba(148, 163, 184, 0.14)',
                  color: 'var(--text-secondary)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                }}
              />
            )}

            {status.connected && (
              <>
                <Box sx={{ mr: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <VpnIcon sx={{ color: 'var(--success)', fontSize: 18 }} />
                  <Chip
                    label={status.currentServer?.name || 'Connected'}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: '0.7rem',
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
            {!isMac && windowsWindowControls}
          </Box>
        </Toolbar>
      </AppBar>

      <LogViewer open={logsOpen} onClose={() => setLogsOpen(false)} />
    </>
  );
}
