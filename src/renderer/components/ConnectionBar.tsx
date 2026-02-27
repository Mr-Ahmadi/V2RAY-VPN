import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Button, Tooltip, CircularProgress, Chip } from '@mui/material';
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
    const interval = setInterval(checkStatus, 1000);
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

  const pingColor =
    status.ping == null
      ? 'var(--text-secondary)'
      : status.ping < 300
        ? 'var(--success)'
        : status.ping < 800
          ? 'var(--secondary)'
          : 'var(--error)';

  return (
    <Box
      sx={{
        py: 0.8,
        px: { xs: 1, sm: 1.5 },
        backgroundColor: isError ? 'rgba(239, 68, 68, 0.08)' : 'rgba(34, 197, 94, 0.08)',
        borderBottom: '1px solid',
        borderColor: isError ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
        {isConnecting || isDisconnecting ? (
          <CircularProgress size={14} sx={{ color: 'var(--primary)' }} />
        ) : isError ? (
          <ErrorIcon sx={{ color: 'var(--error)', fontSize: 16 }} />
        ) : (
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--success)' }} />
        )}

        <Typography
          variant="caption"
          sx={{ fontWeight: 700, color: isError ? 'var(--error)' : 'var(--success)', whiteSpace: 'nowrap' }}
        >
          {isConnecting
            ? 'Connecting'
            : isDisconnecting
              ? 'Disconnecting'
              : isError
                ? 'Connection Failed'
                : `Connected to ${status.currentServer?.name ?? 'VPN'}`}
        </Typography>

        {status.state === 'connected' && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
            <Chip
              size="small"
              icon={<UpIcon sx={{ fontSize: '14px !important' }} />}
              label={`${status.uploadSpeed != null ? status.uploadSpeed.toFixed(2) : '0.00'} Mb/s`}
              sx={{ height: 20, color: 'var(--text-strong)', backgroundColor: 'rgba(56, 189, 248, 0.12)' }}
            />
            <Chip
              size="small"
              icon={<DownIcon sx={{ fontSize: '14px !important' }} />}
              label={`${status.downloadSpeed != null ? status.downloadSpeed.toFixed(2) : '0.00'} Mb/s`}
              sx={{ height: 20, color: 'var(--text-strong)', backgroundColor: 'rgba(245, 158, 11, 0.12)' }}
            />
            {status.ping != null && (
              <Tooltip title="Latency">
                <Chip
                  size="small"
                  icon={<PingIcon sx={{ fontSize: '14px !important', color: pingColor }} />}
                  label={`${status.ping >= 0 ? status.ping : 'N/A'} ms`}
                  sx={{
                    height: 20,
                    color: pingColor,
                    backgroundColor: 'rgba(148, 163, 184, 0.12)',
                  }}
                />
              </Tooltip>
            )}
          </Box>
        )}

        {isError && status.error && (
          <Typography
            variant="caption"
            sx={{ color: 'var(--error)', maxWidth: 460, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {status.error}
          </Typography>
        )}
      </Box>

      {!isError && (
        <Button
          size="small"
          variant="contained"
          color="error"
          startIcon={<DisconnectIcon sx={{ fontSize: 15 }} />}
          onClick={handleDisconnect}
          disabled={isDisconnecting || isConnecting}
          sx={{
            px: 1.3,
            minHeight: 28,
            fontSize: '0.72rem',
            whiteSpace: 'nowrap',
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
          onClick={() => setStatus({ connected: false, state: 'disconnected' })}
          sx={{ textTransform: 'none', whiteSpace: 'nowrap' }}
        >
          Dismiss
        </Button>
      )}
    </Box>
  );
}
