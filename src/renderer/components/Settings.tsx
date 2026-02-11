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
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Checkbox,
} from '@mui/material';

export default function Settings() {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apps, setApps] = useState<any[]>([]);
  const [bypassApps, setBypassApps] = useState<string[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [routingMode, setRoutingMode] = useState<'full' | 'bypass' | 'rule'>('full');
  const [proxyMode, setProxyMode] = useState<'global' | 'per-app' | 'pac'>('global');

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    loadApps();
    loadBypassApps();
  }, []);

  const loadApps = async () => {
    try {
      setLoadingApps(true);
      const result = await window.electronAPI.routing.getApps();
      if (result.success) {
        setApps(result.data);
      }
    } catch (error) {
      console.error('Error loading apps:', error);
    } finally {
      setLoadingApps(false);
    }
  };

  const loadBypassApps = async () => {
    try {
      const result = await window.electronAPI.routing.getBypassApps();
      if (result.success) {
        setBypassApps(result.data.map((app: any) => app.appPath));
      }
    } catch (error) {
      console.error('Error loading bypass apps:', error);
    }
  };

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

  const handleToggleAppBypass = async (appPath: string) => {
    try {
      const isBypass = bypassApps.includes(appPath);
      await window.electronAPI.routing.setAppBypass(appPath, !isBypass);
      if (isBypass) {
        setBypassApps(bypassApps.filter(p => p !== appPath));
      } else {
        setBypassApps([...bypassApps, appPath]);
      }
    } catch (error) {
      console.error('Error toggling app bypass:', error);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ py: 3 }}>
      <Container maxWidth="sm">
        <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
          Settings
        </Typography>

        <Card sx={{ backgroundColor: '#1e293b', mb: 2 }}>
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

        <Card sx={{ backgroundColor: '#1e293b', mb: 2 }}>
          <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
              DNS Settings
            </Typography>
            <FormControl fullWidth margin="normal">
              <InputLabel>DNS Provider</InputLabel>
              <Select
                value={settings.dnsProvider || 'cloudflare'}
                label="DNS Provider"
                onChange={(e) => handleSettingChange('dnsProvider', e.target.value)}
              >
                <MenuItem value="cloudflare">Cloudflare (1.1.1.1)</MenuItem>
                <MenuItem value="google">Google (8.8.8.8)</MenuItem>
                <MenuItem value="quad9">Quad9 (9.9.9.9)</MenuItem>
                <MenuItem value="custom">Custom</MenuItem>
              </Select>
            </FormControl>

            {settings.dnsProvider === 'custom' && (
              <>
                <TextField
                  fullWidth
                  label="Primary DNS"
                  value={settings.primaryDns || ''}
                  onChange={(e) => handleSettingChange('primaryDns', e.target.value)}
                  margin="normal"
                />
                <TextField
                  fullWidth
                  label="Secondary DNS"
                  value={settings.secondaryDns || ''}
                  onChange={(e) => handleSettingChange('secondaryDns', e.target.value)}
                  margin="normal"
                />
              </>
            )}
          </CardContent>
        </Card>

        <Card sx={{ backgroundColor: '#1e293b', mb: 2 }}>
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
              </Box>
            </Box>
          </CardContent>
        </Card>

        <Card sx={{ backgroundColor: '#1e293b', mb: 3 }}>
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

        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            onClick={loadSettings}
            sx={{ flex: 1 }}
          >
            Reset
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveSettings}
            disabled={saving}
            sx={{
              flex: 1,
              background: 'linear-gradient(90deg, #6366f1, #ec4899)',
            }}
          >
            {saving ? <CircularProgress size={24} /> : 'Save Settings'}
          </Button>
        </Box>
      </Container>
    </Box>
  );
}
