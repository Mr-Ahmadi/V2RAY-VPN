import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Card,
  CardContent,
  Typography,
  Switch,
  FormControlLabel,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  Grid,
} from '@mui/material';

export default function Settings() {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [routingMode, setRoutingMode] = useState<'full' | 'bypass' | 'rule'>('full');
  const [proxyMode, setProxyMode] = useState<'global' | 'per-app' | 'pac'>('global');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const result = await window.electronAPI.settings.get();
      if (result.success) {
        setSettings(result.data);
        setRoutingMode(result.data.routingMode || 'full');
        setProxyMode(result.data.proxyMode || 'global');
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setSaving(true);
      const settingsToSave = { ...settings, routingMode, proxyMode };
      const result = await window.electronAPI.settings.save(settingsToSave);
      if (result.success) {
        // Show success message
        console.log('Settings saved successfully');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleSettingChange = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ py: { xs: 2, sm: 3 } }}>
      <Container maxWidth="lg">
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>
          Settings
        </Typography>

        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Card sx={{ backgroundColor: 'var(--bg-card)', height: '100%' }}>
              <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
              Connection
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.autoConnect || false}
                  onChange={(e) => handleSettingChange('autoConnect', e.target.checked)}
                />
              }
              label="Auto connect on startup"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={settings.reconnectOnDisconnect || false}
                  onChange={(e) => handleSettingChange('reconnectOnDisconnect', e.target.checked)}
                />
              }
              label="Auto reconnect if disconnected"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={settings.enablePingCalculation !== false}
                  onChange={async (e) => {
                    const v = e.target.checked;
                    handleSettingChange('enablePingCalculation', v);
                    await window.electronAPI.settings.togglePing(v);
                  }}
                />
              }
              label="Show ping when connected"
            />
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card sx={{ backgroundColor: 'var(--bg-card)', height: '100%' }}>
              <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
              DNS Settings
            </Typography>
            <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mb: 2 }}>
              DNS queries are routed through the VPN to prevent DNS leaks
            </Typography>
            <FormControl fullWidth margin="normal">
              <InputLabel>DNS Provider</InputLabel>
              <Select
                value={settings.dnsProvider || 'cloudflare'}
                label="DNS Provider"
                onChange={(e) => handleSettingChange('dnsProvider', e.target.value)}
              >
                <MenuItem value="cloudflare">Cloudflare (1.1.1.1) - Fast & Private</MenuItem>
                <MenuItem value="google">Google (8.8.8.8) - Reliable</MenuItem>
                <MenuItem value="quad9">Quad9 (9.9.9.9) - Security Focused</MenuItem>
                <MenuItem value="opendns">OpenDNS (208.67.222.222) - Family Safe</MenuItem>
                <MenuItem value="custom">Custom DNS Servers</MenuItem>
              </Select>
            </FormControl>

            {settings.dnsProvider === 'custom' && (
              <>
                <TextField
                  fullWidth
                  label="Primary DNS"
                  placeholder="1.1.1.1"
                  value={settings.primaryDns || ''}
                  onChange={(e) => handleSettingChange('primaryDns', e.target.value)}
                  margin="normal"
                />
                <TextField
                  fullWidth
                  label="Secondary DNS"
                  placeholder="8.8.8.8"
                  value={settings.secondaryDns || ''}
                  onChange={(e) => handleSettingChange('secondaryDns', e.target.value)}
                  margin="normal"
                />
              </>
            )}
            
            <FormControlLabel
              control={
                <Switch
                  checked={settings.blockAds !== false}
                  onChange={(e) => handleSettingChange('blockAds', e.target.checked)}
                />
              }
              label="Block ads and trackers"
              sx={{ mt: 2 }}
            />
            <Typography variant="caption" color="textSecondary">
              Uses V2Ray's built-in ad blocking rules
            </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card sx={{ backgroundColor: 'var(--bg-card)', height: '100%' }}>
              <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
              Security
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.killSwitch || false}
                  onChange={(e) => handleSettingChange('killSwitch', e.target.checked)}
                />
              }
              label="Kill Switch (Block internet if VPN disconnects)"
            />
            <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mb: 2 }}>
              Prevents data leaks by blocking all traffic when VPN is disconnected
            </Typography>
            
            <FormControlLabel
              control={
                <Switch
                  checked={settings.ipv6Disable || false}
                  onChange={(e) => handleSettingChange('ipv6Disable', e.target.checked)}
                />
              }
              label="Disable IPv6 (Prevent IPv6 leaks)"
            />
            <Typography variant="caption" color="textSecondary">
              Recommended if your VPN server doesn't support IPv6
            </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card sx={{ backgroundColor: 'var(--bg-card)', height: '100%' }}>
              <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
              Network
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.allowInsecure || false}
                  onChange={(e) => handleSettingChange('allowInsecure', e.target.checked)}
                />
              }
              label="Allow insecure connections"
            />
            <Typography variant="caption" color="textSecondary">
              Not recommended for security reasons
            </Typography>

            <Box sx={{ mt: 2 }}>
              <FormControl fullWidth>
                <InputLabel>Connection Timeout (seconds)</InputLabel>
                <Select
                  value={settings.connectionTimeout || 30}
                  label="Connection Timeout (seconds)"
                  onChange={(e) => handleSettingChange('connectionTimeout', e.target.value)}
                >
                  <MenuItem value={10}>10 seconds</MenuItem>
                  <MenuItem value={30}>30 seconds</MenuItem>
                  <MenuItem value={60}>60 seconds</MenuItem>
                  <MenuItem value={120}>120 seconds</MenuItem>
                </Select>
              </FormControl>

              <Box sx={{ mt: 2 }}>
                <FormControl fullWidth>
                  <InputLabel>Proxy Mode</InputLabel>
                  <Select
                    value={proxyMode}
                    label="Proxy Mode"
                    onChange={(e) => setProxyMode(e.target.value as any)}
                  >
                    <MenuItem value="global">Global (system proxy)</MenuItem>
                    <MenuItem value="per-app">Per-app (launch apps with proxy)</MenuItem>
                    <MenuItem value="pac">PAC (auto proxy configuration)</MenuItem>
                  </Select>
                </FormControl>
              </Box>

              <Box sx={{ mt: 2 }}>
                <FormControl fullWidth>
                  <InputLabel>Routing Strategy</InputLabel>
                  <Select
                    value={routingMode}
                    label="Routing Strategy"
                    onChange={(e) => setRoutingMode(e.target.value as any)}
                  >
                    <MenuItem value="full">Route all traffic through proxy</MenuItem>
                    <MenuItem value="bypass">Bypass selected apps (in Routing tab)</MenuItem>
                    <MenuItem value="rule">Route selected apps through proxy (in Routing tab)</MenuItem>
                  </Select>
                </FormControl>
                <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.secondary' }}>
                  Some apps ignore system proxy settings. Use the Routing tab to launch apps directly with the
                  desired policy.
                </Typography>
              </Box>
            </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12}>
            <Card sx={{ backgroundColor: 'var(--bg-card)' }}>
              <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
              Privacy
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.shareUsageData || false}
                  onChange={(e) => handleSettingChange('shareUsageData', e.target.checked)}
                />
              }
              label="Help improve by sharing anonymous usage data"
            />
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Box sx={{ display: 'flex', gap: 2, mt: 3, flexDirection: { xs: 'column', sm: 'row' } }}>
          <Button
            variant="outlined"
            onClick={loadSettings}
            sx={{ flex: 1, minHeight: 44 }}
          >
            Reset
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveSettings}
            disabled={saving}
            sx={{
              flex: 1,
              minHeight: 44,
              background: 'linear-gradient(90deg, var(--primary), var(--accent))',
            }}
          >
            {saving ? <CircularProgress size={24} /> : 'Save Settings'}
          </Button>
        </Box>
      </Container>
    </Box>
  );
}
