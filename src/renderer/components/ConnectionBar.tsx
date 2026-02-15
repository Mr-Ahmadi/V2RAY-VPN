import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Button, Tooltip, CircularProgress } from '@mui/material';
import {
  CallEnd as DisconnectIcon,
  ArrowUpward as UpIcon,
  ArrowDownward as DownIcon,
  Timer as PingIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';

interface Status {
  connected: boolean;
  state: 'disconnected' | 'connecting' | 'connected' | 'disconnecting' | 'error';
  error?: string;
  currentServer?: { name: string; address: string; port: number; protocol: string };
  uploadSpeed?: number;
  downloadSpeed?: number;
  ping?: number;
}

export default function ConnectionBar() {
  const [status, setStatus] = useState<Status>({ connected: false, state: 'disconnected' });

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
    const interval = setInterval(checkStatus, 1000); // Poll faster for better UI feedback
    return () => clearInterval(interval);
  }, [checkStatus]);

  const handleDisconnect = async () => {
    try {
      await window.electronAPI.v2ray.disconnect();
    } catch (e) {
      console.error(e);
    }
  };

  if (status.state === 'disconnected') return null;

  const isConnecting = status.state === 'connecting';
  const isDisconnecting = status.state === 'disconnecting';
  const isError = status.state === 'error';

  return (
    <Box
      sx={{
        py: 1.5,
        px: 3,
        backgroundColor: isError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.08)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid',
        borderColor: isError ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)',
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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap', flex: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {/* Status Icon/Animation */}
          {(isConnecting || isDisconnecting) ? (
            <CircularProgress size={20} sx={{ color: 'var(--primary)' }} />
          ) : isError ? (
            <ErrorIcon sx={{ color: 'var(--error)' }} />
          ) : (
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: 'var(--success)',
                boxShadow: '0 0 10px rgba(34, 197, 94, 0.7)',
                animation: 'pulse 2s infinite',
                '@keyframes pulse': {
                  '0%': { opacity: 0.6, transform: 'scale(0.8)' },
                  '50%': { opacity: 1, transform: 'scale(1.2)' },
                  '100%': { opacity: 0.6, transform: 'scale(0.8)' }
                }
              }}
            />
          )}

          <Typography variant="body2" sx={{ fontWeight: 600, color: isError ? 'var(--error)' : 'var(--success)' }}>
            {isConnecting ? 'Authentication...' :
              isDisconnecting ? 'Disconnecting...' :
                isError ? 'Connection Failed' :
                  `Connected to ${status.currentServer?.name ?? 'VPN'}`}
          </Typography>
        </Box>

        {status.state === 'connected' && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5, animation: 'fadeIn 0.5s ease-in', '@keyframes fadeIn': { from: { opacity: 0 }, to: { opacity: 1 } } }}>
            <Tooltip title="Upload Speed">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <UpIcon sx={{ fontSize: 16, color: 'var(--accent)' }} />
                <Typography variant="caption" sx={{ color: 'var(--text-strong)', fontWeight: 500, minWidth: '45px' }}>
                  {status.uploadSpeed != null ? status.uploadSpeed.toFixed(2) : '0.00'} <span style={{ color: 'var(--text-secondary)' }}>Mb/s</span>
                </Typography>
              </Box>
            </Tooltip>

            <Tooltip title="Download Speed">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <DownIcon sx={{ fontSize: 16, color: 'var(--secondary)' }} />
                <Typography variant="caption" sx={{ color: 'var(--text-strong)', fontWeight: 500, minWidth: '45px' }}>
                  {status.downloadSpeed != null ? status.downloadSpeed.toFixed(2) : '0.00'} <span style={{ color: 'var(--text-secondary)' }}>Mb/s</span>
                </Typography>
              </Box>
            </Tooltip>

            {status.ping != null && (
              <Tooltip title="Latency">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <PingIcon sx={{
                    fontSize: 16,
                    color: status.ping < 300 ? 'var(--success)' : (status.ping < 800 ? 'var(--secondary)' : 'var(--error)')
                  }} />
                  <Typography variant="caption" sx={{
                    color: status.ping < 300 ? 'var(--success)' : (status.ping < 800 ? 'var(--secondary)' : 'var(--error)'),
                    fontWeight: 600
                  }}>
                    {status.ping >= 0 ? `${status.ping} ms` : 'N/A'}
                  </Typography>
                </Box>
              </Tooltip>
            )}
          </Box>
        )}

        {isError && status.error && (
          <Typography variant="caption" sx={{ color: 'var(--error)', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {status.error}
          </Typography>
        )}
      </Box>

      {!isError && (
        <Button
          size="small"
          variant="contained"
          color="error"
          startIcon={<DisconnectIcon />}
          onClick={handleDisconnect}
          disabled={isDisconnecting || isConnecting}
          sx={{
            borderRadius: 2,
            textTransform: 'none',
            px: 2,
            boxShadow: 'none',
            '&:hover': { boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)' }
          }}
        >
          {isDisconnecting ? 'Wait...' : 'Disconnect'}
        </Button>
      )}

      {isError && (
        <Button
          size="small"
          variant="outlined"
          color="error"
          onClick={() => setStatus({ connected: false, state: 'disconnected' })} // Clear error
          sx={{ ml: 2, textTransform: 'none' }}
        >
          Dismiss
        </Button>
      )}
    </Box>
  );
}
