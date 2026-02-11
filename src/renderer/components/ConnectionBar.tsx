import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Button, Tooltip } from '@mui/material';
import {
  CallEnd as DisconnectIcon,
  ArrowUpward as UpIcon,
  ArrowDownward as DownIcon,
  Timer as PingIcon
} from '@mui/icons-material';

interface Status {
  connected: boolean;
  currentServer?: { name: string; address: string; port: number; protocol: string };
  uploadSpeed?: number;
  downloadSpeed?: number;
  ping?: number;
}

export default function ConnectionBar() {
  const [status, setStatus] = useState<Status>({ connected: false });
  const [disconnecting, setDisconnecting] = useState(false);

  const checkStatus = useCallback(async () => {
    try {
      const result = await window.electronAPI?.v2ray?.getStatus();
      if (result?.success) setStatus(result.data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 2000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await window.electronAPI.v2ray.disconnect();
      setStatus({ connected: false });
    } catch (e) {
      console.error(e);
    } finally {
      setDisconnecting(false);
    }
  };

  if (!status.connected) return null;

  return (
    <Box
      sx={{
        py: 1.5,
        px: 3,
        backgroundColor: 'rgba(16, 185, 129, 0.05)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(16, 185, 129, 0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        animation: 'slideDown 0.4s ease-out',
        '@keyframes slideDown': {
          from: { transform: 'translateY(-100%)' },
          to: { transform: 'translateY(0)' }
        }
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: '#10b981',
              boxShadow: '0 0 10px #10b981',
              animation: 'pulse 2s infinite',
              '@keyframes pulse': {
                '0%': { opacity: 0.6, transform: 'scale(0.8)' },
                '50%': { opacity: 1, transform: 'scale(1.2)' },
                '100%': { opacity: 0.6, transform: 'scale(0.8)' }
              }
            }}
          />
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#10b981' }}>
            Connected to {status.currentServer?.name ?? 'VPN'}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5 }}>
          <Tooltip title="Upload Speed">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <UpIcon sx={{ fontSize: 16, color: '#6366f1' }} />
              <Typography variant="caption" sx={{ color: '#e2e8f0', fontWeight: 500, minWidth: '45px' }}>
                {status.uploadSpeed != null ? status.uploadSpeed.toFixed(2) : '0.00'} <span style={{ color: '#94a3b8' }}>Mb/s</span>
              </Typography>
            </Box>
          </Tooltip>

          <Tooltip title="Download Speed">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <DownIcon sx={{ fontSize: 16, color: '#ec4899' }} />
              <Typography variant="caption" sx={{ color: '#e2e8f0', fontWeight: 500, minWidth: '45px' }}>
                {status.downloadSpeed != null ? status.downloadSpeed.toFixed(2) : '0.00'} <span style={{ color: '#94a3b8' }}>Mb/s</span>
              </Typography>
            </Box>
          </Tooltip>

          {status.ping != null && status.ping >= 0 && (
            <Tooltip title="Latency">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <PingIcon sx={{
                  fontSize: 16,
                  color: status.ping < 300 ? '#10b981' : (status.ping < 800 ? '#f59e0b' : '#ef4444')
                }} />
                <Typography variant="caption" sx={{
                  color: status.ping < 300 ? '#10b981' : (status.ping < 800 ? '#f59e0b' : '#ef4444'),
                  fontWeight: 600
                }}>
                  {status.ping} ms
                </Typography>
              </Box>
            </Tooltip>
          )}
        </Box>
      </Box>

      <Button
        size="small"
        variant="contained"
        color="error"
        startIcon={<DisconnectIcon />}
        onClick={handleDisconnect}
        disabled={disconnecting}
        sx={{
          borderRadius: 2,
          textTransform: 'none',
          px: 2,
          boxShadow: 'none',
          '&:hover': { boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)' }
        }}
      >
        {disconnecting ? 'Terminating...' : 'Disconnect'}
      </Button>
    </Box>
  );
}
