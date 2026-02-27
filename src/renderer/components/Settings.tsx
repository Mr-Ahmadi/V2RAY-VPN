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
  Alert,
} from '@mui/material';

type RoutingMode = 'full' | 'bypass' | 'rule';
type ProxyMode = 'global' | 'per-app' | 'pac';

const normalizeProxyMode = (mode: unknown): ProxyMode => {
  if (mode === 'per-app' || mode === 'pac') return mode;
  return 'global';
};

const deriveRoutingModeFromProxyMode = (mode: ProxyMode): RoutingMode => {
  if (mode === 'per-app') return 'rule';
  return 'full';
};

export default function Settings() {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [routingMode, setRoutingMode] = useState<RoutingMode>('full');
  const [proxyMode, setProxyMode] = useState<ProxyMode>('global');
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [downloadingUpdate, setDownloadingUpdate] = useState(false);
  const [appInfo, setAppInfo] = useState<{
    version: string;
    platform: string;
    arch: string;
    electron: string;
  } | null>(null);
  const [updateInfo, setUpdateInfo] = useState<{
    owner: string;
    repo: string;
    currentVersion: string;
    latestVersion: string;
    hasUpdate: boolean;
    releaseName: string;
    releaseUrl: string;
    downloadUrl: string | null;
    assetName: string | null;
    publishedAt: string | null;
  } | null>(null);
  const [updateError, setUpdateError] = useState<string>('');
  const sectionCardSx = {
    background: 'linear-gradient(180deg, rgba(15, 23, 33, 0.96), rgba(16, 25, 35, 0.92))',
    border: '1px solid var(--border-light)',
    borderRadius: 2.5,
    height: '100%',
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const result = await window.electronAPI.settings.get();
      if (result.success) {
        const loadedSettings = {
          githubRepoOwner: 'Mr-Ahmadi',
          githubRepoName: 'V2RAY-VPN',
          ...result.data,
        };
        setSettings(loadedSettings);
        const loadedProxyMode = normalizeProxyMode(loadedSettings.proxyMode);
        setProxyMode(loadedProxyMode);
        setRoutingMode(deriveRoutingModeFromProxyMode(loadedProxyMode));
      }
      const appInfoResult = await window.electronAPI.updates.getAppInfo();
      if (appInfoResult?.success) {
        setAppInfo(appInfoResult.data);
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
      const normalizedRoutingMode = deriveRoutingModeFromProxyMode(proxyMode);
      setRoutingMode(normalizedRoutingMode);
      const settingsToSave = {
        ...settings,
        routingMode: normalizedRoutingMode,
        proxyMode,
      };
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

  const handleCheckUpdates = async () => {
    try {
      setCheckingUpdates(true);
      setUpdateError('');
      const owner = String(settings.githubRepoOwner || 'Mr-Ahmadi').trim();
      const repo = String(settings.githubRepoName || 'V2RAY-VPN').trim();
      const result = await window.electronAPI.updates.checkGithub({ owner, repo });
      if (!result.success) {
        setUpdateInfo(null);
        setUpdateError(result.error || 'Failed to check for updates');
        return;
      }
      setUpdateInfo(result.data);
    } catch (error) {
      setUpdateInfo(null);
      setUpdateError(error instanceof Error ? error.message : 'Failed to check for updates');
    } finally {
      setCheckingUpdates(false);
    }
  };

  const handleOpenGithubUpdate = async () => {
    const owner = String(settings.githubRepoOwner || 'Mr-Ahmadi').trim();
    const repo = String(settings.githubRepoName || 'V2RAY-VPN').trim();
    try {
      setDownloadingUpdate(true);
      setUpdateError('');
      const result = await window.electronAPI.updates.downloadAndInstallGithub({ owner, repo });
      if (!result?.success) {
        const targetUrl = updateInfo?.downloadUrl || updateInfo?.releaseUrl || `https://github.com/${owner}/${repo}/releases/latest`;
        await window.electronAPI.updates.openGithubRelease(targetUrl);
      }
    } catch (error) {
      setUpdateError(error instanceof Error ? error.message : 'Failed to open GitHub release page');
    } finally {
      setDownloadingUpdate(false);
    }
  };

  const proxyModeGuidance =
    proxyMode === 'per-app'
      ? 'Per-app: system proxy stays off. Choose apps as "Use VPN" in Routing tab, then click "Apply Now".'
      : proxyMode === 'pac'
        ? 'PAC: system auto-proxy is enabled. Most traffic is proxied; use Routing tab to bypass supported apps.'
        : 'Global: all traffic uses VPN by default. Use Routing tab to bypass selected apps.';

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ py: 2 }}>
      <Container maxWidth="lg">
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, letterSpacing: 0.2 }}>
          Settings
        </Typography>

        <Grid container spacing={1.25}>
          <Grid item xs={12} md={6}>
            <Card sx={sectionCardSx}>
              <CardContent sx={{ p: '12px !important' }}>
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 1.25, px: 0.25, pt: 0.25 }}>
              Connection
            </Typography>
            <FormControlLabel
              sx={{ my: 0.15, '& .MuiFormControlLabel-label': { fontSize: '0.84rem' } }}
              control={
                <Switch
                  checked={settings.autoConnect || false}
                  onChange={(e) => handleSettingChange('autoConnect', e.target.checked)}
                />
              }
              label="Auto connect on startup"
            />
            <FormControlLabel
              sx={{ my: 0.15, '& .MuiFormControlLabel-label': { fontSize: '0.84rem' } }}
              control={
                <Switch
                  checked={settings.reconnectOnDisconnect || false}
                  onChange={(e) => handleSettingChange('reconnectOnDisconnect', e.target.checked)}
                />
              }
              label="Auto reconnect if disconnected"
            />
            <FormControlLabel
              sx={{ my: 0.15, '& .MuiFormControlLabel-label': { fontSize: '0.84rem' } }}
              control={
                <Switch
                  checked={settings.enablePingCalculation !== false}
                  onChange={async (e) => {
                    const v = e.target.checked;
                    handleSettingChange('enablePingCalculation', v);
                    try {
                      await window.electronAPI.settings.togglePing(v);
                    } catch (error) {
                      console.error('Error toggling ping calculation:', error);
                    }
                  }}
                />
              }
              label="Show ping when connected"
            />
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card sx={sectionCardSx}>
              <CardContent sx={{ p: '12px !important' }}>
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 1.25, px: 0.25, pt: 0.25 }}>
              DNS Settings
            </Typography>
            <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mb: 1 }}>
              DNS queries are routed through the VPN to prevent DNS leaks
            </Typography>
            <FormControl fullWidth margin="dense" size="small">
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
                  size="small"
                  label="Primary DNS"
                  placeholder="1.1.1.1"
                  value={settings.primaryDns || ''}
                  onChange={(e) => handleSettingChange('primaryDns', e.target.value)}
                  margin="dense"
                />
                <TextField
                  fullWidth
                  size="small"
                  label="Secondary DNS"
                  placeholder="8.8.8.8"
                  value={settings.secondaryDns || ''}
                  onChange={(e) => handleSettingChange('secondaryDns', e.target.value)}
                  margin="dense"
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
              sx={{ mt: 1, '& .MuiFormControlLabel-label': { fontSize: '0.84rem' } }}
            />
            <Typography variant="caption" color="textSecondary">
              Uses V2Ray's built-in ad blocking rules
            </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card sx={sectionCardSx}>
              <CardContent sx={{ p: '12px !important' }}>
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 1.25, px: 0.25, pt: 0.25 }}>
              Security
            </Typography>
            <FormControlLabel
              sx={{ my: 0.15, '& .MuiFormControlLabel-label': { fontSize: '0.84rem' } }}
              control={
                <Switch
                  checked={settings.killSwitch || false}
                  onChange={(e) => handleSettingChange('killSwitch', e.target.checked)}
                />
              }
              label="Kill Switch (Block internet if VPN disconnects)"
            />
            <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mb: 1 }}>
              Prevents data leaks by blocking all traffic when VPN is disconnected
            </Typography>
            
            <FormControlLabel
              sx={{ my: 0.15, '& .MuiFormControlLabel-label': { fontSize: '0.84rem' } }}
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
            <Card sx={sectionCardSx}>
              <CardContent sx={{ p: '12px !important' }}>
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 1.25, px: 0.25, pt: 0.25 }}>
              Network
            </Typography>
            <FormControlLabel
              sx={{ my: 0.15, '& .MuiFormControlLabel-label': { fontSize: '0.84rem' } }}
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

            <Box sx={{ mt: 1 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Connection Timeout (seconds)</InputLabel>
                <Select
                  value={settings.connectionTimeout || 30}
                  label="Connection Timeout (seconds)"
                  onChange={(e) => handleSettingChange('connectionTimeout', Number(e.target.value))}
                >
                  <MenuItem value={10}>10 seconds</MenuItem>
                  <MenuItem value={30}>30 seconds</MenuItem>
                  <MenuItem value={60}>60 seconds</MenuItem>
                  <MenuItem value={120}>120 seconds</MenuItem>
                </Select>
              </FormControl>

              <Box sx={{ mt: 1.25 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Proxy Mode</InputLabel>
                  <Select
                    value={proxyMode}
                    label="Proxy Mode"
                    onChange={(e) => {
                      const nextProxyMode = normalizeProxyMode(e.target.value);
                      setProxyMode(nextProxyMode);
                      setRoutingMode(deriveRoutingModeFromProxyMode(nextProxyMode));
                    }}
                  >
                    <MenuItem value="global">Global (system proxy)</MenuItem>
                    <MenuItem value="per-app">Per-app (launch apps with proxy)</MenuItem>
                    <MenuItem value="pac">PAC (auto proxy configuration)</MenuItem>
                  </Select>
                </FormControl>
              </Box>

              <Box sx={{ mt: 1.25 }}>
                <Typography variant="caption" sx={{ display: 'block', color: 'var(--text-secondary)' }}>
                  Effective routing strategy: <strong>{routingMode}</strong>
                </Typography>
                <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.secondary' }}>
                  {proxyModeGuidance}
                </Typography>
              </Box>
            </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12}>
            <Card sx={sectionCardSx}>
              <CardContent sx={{ p: '12px !important' }}>
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 1.25, px: 0.25, pt: 0.25 }}>
              Privacy
            </Typography>
            <FormControlLabel
              sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.84rem' } }}
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

          <Grid item xs={12}>
            <Card sx={sectionCardSx}>
              <CardContent sx={{ p: '12px !important' }}>
                <Typography variant="body2" sx={{ fontWeight: 700, mb: 1.25, px: 0.25, pt: 0.25 }}>
                  Builds & Updates
                </Typography>
                <Typography variant="caption" sx={{ color: 'var(--text-secondary)', display: 'block', mb: 1.25 }}>
                  Check releases from GitHub and update from the latest published build.
                </Typography>

                <Box sx={{ mb: 1 }}>
                  <Typography variant="caption">
                    App version: <strong>{appInfo?.version || '-'}</strong>
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'var(--text-secondary)' }}>
                    Platform: {appInfo?.platform || '-'} | Arch: {appInfo?.arch || '-'} | Electron: {appInfo?.electron || '-'}
                  </Typography>
                </Box>

                <Grid container spacing={1}>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      size="small"
                      label="GitHub Owner"
                      value={settings.githubRepoOwner || ''}
                      onChange={(e) => handleSettingChange('githubRepoOwner', e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      size="small"
                      label="GitHub Repository"
                      value={settings.githubRepoName || ''}
                      onChange={(e) => handleSettingChange('githubRepoName', e.target.value)}
                    />
                  </Grid>
                </Grid>

                <Box sx={{ display: 'flex', gap: 1, mt: 1.25, flexWrap: 'wrap' }}>
                  <Button variant="outlined" size="small" sx={{ minHeight: 32 }} onClick={handleCheckUpdates} disabled={checkingUpdates}>
                    {checkingUpdates ? <CircularProgress size={18} /> : 'Check for Updates'}
                  </Button>
                  <Button variant="contained" size="small" sx={{ minHeight: 32 }} onClick={handleOpenGithubUpdate} disabled={downloadingUpdate}>
                    {downloadingUpdate ? <CircularProgress size={18} /> : 'Update from GitHub'}
                  </Button>
                </Box>

                {updateInfo && (
                  <Alert severity={updateInfo.hasUpdate ? 'success' : 'info'} sx={{ mt: 2 }}>
                    {updateInfo.hasUpdate
                      ? `Update available: ${updateInfo.latestVersion} (current: ${updateInfo.currentVersion})`
                      : `You are up to date (${updateInfo.currentVersion}).`}
                    {updateInfo.assetName ? ` Asset: ${updateInfo.assetName}.` : ''}
                  </Alert>
                )}

                {updateError && (
                  <Alert severity="error" sx={{ mt: 2 }}>
                    {updateError}
                  </Alert>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Box sx={{ display: 'flex', gap: 1, mt: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
          <Button
            variant="outlined"
            size="small"
            onClick={loadSettings}
            sx={{ flex: 1, minHeight: 34 }}
          >
            Reset
          </Button>
          <Button
            variant="contained"
            size="small"
            onClick={handleSaveSettings}
            disabled={saving}
            sx={{
              flex: 1,
              minHeight: 34,
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
