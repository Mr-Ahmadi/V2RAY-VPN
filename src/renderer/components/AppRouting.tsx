import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Apps as AppsIcon,
  Circle as DotIcon,
  DirectionsRun as BypassIcon,
  Launch as LaunchIcon,
  OpenInNew as DirectIcon,
  Public as NetIcon,
  Search as SearchIcon,
  ShieldOutlined as ProxyIcon,
} from '@mui/icons-material';

type AppRoutePolicy = 'none' | 'bypass' | 'vpn';
type PolicyFilter = 'all' | AppRoutePolicy;
type Notice = { severity: 'success' | 'error' | 'info'; message: string };

interface App {
  name: string;
  path: string;
}

interface AppPolicyRule {
  appPath: string;
  appName: string;
  policy: AppRoutePolicy;
}

export default function AppRouting() {
  const [allApps, setAllApps] = useState<App[]>([]);
  const [appPolicies, setAppPolicies] = useState<AppPolicyRule[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [policyFilter, setPolicyFilter] = useState<PolicyFilter>('all');
  const [loading, setLoading] = useState(true);
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [loadingDiagnostics, setLoadingDiagnostics] = useState(false);
  const [busyAppPath, setBusyAppPath] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const loadDiagnostics = useCallback(async () => {
    try {
      setLoadingDiagnostics(true);
      const result = await window.electronAPI.routing.getDiagnostics();
      if (result.success) {
        setDiagnostics(result.data);
      }
    } catch (error) {
      console.error('Error loading routing diagnostics:', error);
    } finally {
      setLoadingDiagnostics(false);
    }
  }, []);

  const loadApps = useCallback(async () => {
    try {
      setLoading(true);
      const [appsResult, policyResult] = await Promise.all([
        window.electronAPI.routing.getApps(),
        window.electronAPI.routing.getAppPolicies(),
      ]);

      if (appsResult.success) {
        const uniqueApps = Array.from(
          new Map(appsResult.data.map((app: App) => [app.path, app])).values()
        ) as App[];
        setAllApps(uniqueApps.sort((a, b) => a.name.localeCompare(b.name)));
      }
      if (policyResult.success) {
        setAppPolicies(policyResult.data);
      }
      await loadDiagnostics();
    } catch (error) {
      console.error('Error loading app routing data:', error);
      setNotice({ severity: 'error', message: 'Could not load application routing data.' });
    } finally {
      setLoading(false);
    }
  }, [loadDiagnostics]);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  const policyByPath = useMemo(() => {
    const map = new Map<string, AppRoutePolicy>();
    for (const rule of appPolicies) {
      map.set(rule.appPath, rule.policy);
    }
    return map;
  }, [appPolicies]);

  const bypassCount = useMemo(
    () => appPolicies.filter(rule => rule.policy === 'bypass').length,
    [appPolicies]
  );
  const vpnCount = useMemo(
    () => appPolicies.filter(rule => rule.policy === 'vpn').length,
    [appPolicies]
  );

  const filteredApps = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return allApps.filter(app => {
      const policy = policyByPath.get(app.path) || 'none';
      const matchesSearch =
        normalizedSearch.length === 0 ||
        app.name.toLowerCase().includes(normalizedSearch) ||
        app.path.toLowerCase().includes(normalizedSearch);
      const matchesPolicy = policyFilter === 'all' ? true : policy === policyFilter;
      return matchesSearch && matchesPolicy;
    });
  }, [allApps, policyByPath, policyFilter, searchTerm]);

  const setPolicy = async (appPath: string, policy: AppRoutePolicy) => {
    setBusyAppPath(appPath);
    try {
      const result = await window.electronAPI.routing.setAppPolicy(appPath, policy);
      if (!result.success) {
        setNotice({ severity: 'error', message: result.error || 'Failed to update routing policy.' });
        return;
      }

      setAppPolicies(prev => {
        const withoutCurrent = prev.filter(rule => rule.appPath !== appPath);
        if (policy === 'none') {
          return withoutCurrent;
        }
        const app = allApps.find(item => item.path === appPath);
        return [...withoutCurrent, { appPath, appName: app?.name || appPath, policy }];
      });

      await loadDiagnostics();
      setNotice({ severity: 'success', message: 'Routing policy updated.' });
    } catch (error) {
      console.error('Error setting app policy:', error);
      setNotice({ severity: 'error', message: 'Failed to update routing policy.' });
    } finally {
      setBusyAppPath(null);
    }
  };

  const handleLaunchWithProxy = async (appPath: string) => {
    setBusyAppPath(appPath);
    try {
      const res = await window.electronAPI.routing.launchWithProxy(appPath);
      if (!res.success) {
        setNotice({ severity: 'error', message: res.error || 'Failed to launch with VPN.' });
        return;
      }
      await loadDiagnostics();
      setNotice({ severity: 'success', message: 'Application launched with VPN routing.' });
    } catch (error) {
      console.error('Error launching app with proxy:', error);
      setNotice({ severity: 'error', message: 'Failed to launch with VPN routing.' });
    } finally {
      setBusyAppPath(null);
    }
  };

  const handleLaunchDirect = async (appPath: string) => {
    setBusyAppPath(appPath);
    try {
      const res = await window.electronAPI.routing.launchDirect(appPath);
      if (!res.success) {
        setNotice({ severity: 'error', message: res.error || 'Failed to launch in bypass mode.' });
        return;
      }
      await loadDiagnostics();
      setNotice({ severity: 'info', message: 'Application launched in bypass mode.' });
    } catch (error) {
      console.error('Error launching app directly:', error);
      setNotice({ severity: 'error', message: 'Failed to launch in bypass mode.' });
    } finally {
      setBusyAppPath(null);
    }
  };

  const isBrowserLike = (appName: string) => {
    const browsers = ['chrome', 'firefox', 'safari', 'edge', 'brave', 'opera'];
    return browsers.some(b => appName.toLowerCase().includes(b));
  };

  const getAppIcon = (appName: string) => {
    if (isBrowserLike(appName)) return <NetIcon sx={{ color: 'var(--accent)' }} />;
    return <AppsIcon sx={{ color: 'var(--text-secondary)' }} />;
  };

  const getPolicyLabel = (policy: AppRoutePolicy): string => {
    switch (policy) {
      case 'bypass':
        return 'Bypass VPN';
      case 'vpn':
        return 'Use VPN';
      default:
        return 'Follow Global Mode';
    }
  };

  const getEngineIndicator = (appName: string): { label: string; color: string } => {
    const lowerName = appName.toLowerCase();
    const chromiumNames = ['chrome', 'edge', 'brave', 'opera', 'vivaldi', 'chromium', 'arc'];
    if (chromiumNames.some(b => lowerName.includes(b))) {
      return { label: 'CLI flags (reliable)', color: 'var(--success)' };
    }
    if (lowerName.includes('firefox')) {
      return { label: 'Env vars (restart needed)', color: 'var(--secondary)' };
    }
    if (lowerName.includes('telegram')) {
      return { label: 'SOCKS URL scheme', color: 'var(--secondary)' };
    }
    if (lowerName.includes('safari')) {
      return { label: 'System proxy/PAC (best-effort direct)', color: 'var(--accent)' };
    }
    return { label: 'Env vars (best-effort)', color: 'var(--secondary)' };
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 8 }}>
        <CircularProgress size={40} thickness={4} sx={{ color: 'var(--primary)' }} />
      </Box>
    );
  }

  return (
    <Box sx={{ py: 3, minHeight: '100%' }}>
      <Container maxWidth="lg">
        <Box sx={{ mb: 3 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, letterSpacing: '-0.02em' }}>
            Application Routing
          </Typography>
          <Typography variant="body1" sx={{ color: 'var(--text-secondary)', mb: 2 }}>
            Define per-app network policy independent from global VPN mode.
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Chip label={`Bypass: ${bypassCount}`} size="small" sx={{ backgroundColor: 'rgba(245,158,11,0.12)', color: 'var(--secondary)' }} />
            <Chip label={`Use VPN: ${vpnCount}`} size="small" sx={{ backgroundColor: 'rgba(34,197,94,0.12)', color: 'var(--success)' }} />
            <Chip label={`Global: ${Math.max(allApps.length - appPolicies.length, 0)}`} size="small" sx={{ backgroundColor: 'rgba(56,189,248,0.1)', color: 'var(--accent)' }} />
          </Stack>
        </Box>

        <Card className="glass" sx={{ border: 'none', background: 'var(--bg-glass)', mb: 2 }}>
          <CardContent sx={{ p: '12px !important' }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
              <TextField
                fullWidth
                variant="standard"
                placeholder="Find an application..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  disableUnderline: true,
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: 'var(--primary)', ml: 1, mr: 1 }} />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  '& .MuiInputBase-input': {
                    color: 'var(--text-primary)',
                    py: 1.5,
                    fontSize: '1rem',
                  },
                }}
              />
              <ToggleButtonGroup
                size="small"
                value={policyFilter}
                exclusive
                onChange={(_, value: PolicyFilter | null) => {
                  if (value) setPolicyFilter(value);
                }}
                sx={{
                  width: { xs: '100%', md: 'auto' },
                  '& .MuiToggleButton-root': {
                    flex: { xs: 1, md: 'unset' },
                    whiteSpace: 'nowrap',
                  },
                }}
              >
                <ToggleButton value="all">All</ToggleButton>
                <ToggleButton value="bypass">Bypass</ToggleButton>
                <ToggleButton value="vpn">Use VPN</ToggleButton>
                <ToggleButton value="none">Global</ToggleButton>
              </ToggleButtonGroup>
            </Stack>
            <Typography variant="caption" sx={{ color: 'var(--text-muted)', display: 'block', mt: 1.5 }}>
              Dot color indicates launch reliability by app engine.
            </Typography>
          </CardContent>
        </Card>

        <Card sx={{ backgroundColor: 'var(--bg-card)', borderRadius: 3, mb: 2 }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2" sx={{ color: 'var(--text-secondary)', fontWeight: 700 }}>
                Routing Diagnostics
              </Typography>
              <Button size="small" onClick={loadDiagnostics} disabled={loadingDiagnostics}>
                {loadingDiagnostics ? 'Refreshing...' : 'Refresh'}
              </Button>
            </Box>
            {!diagnostics?.connected ? (
              <Alert severity="info" sx={{ mb: 1.5 }}>
                VPN is currently disconnected. Policies are saved and will apply after connection.
              </Alert>
            ) : null}
            <Typography variant="caption" sx={{ color: 'var(--text-muted)', display: 'block', mb: 0.5 }}>
              Last check: {diagnostics?.recordedAt || 'N/A'}
            </Typography>
            <Typography variant="caption" sx={{ color: 'var(--text-muted)', display: 'block', mb: 0.5 }}>
              Connected: {diagnostics?.connected ? 'Yes' : 'No'} | Decisions logged: {diagnostics?.decisions?.length || 0}
            </Typography>
            <Typography variant="caption" sx={{ color: 'var(--text-muted)', display: 'block', mb: 1.5 }}>
              Proxy mode: {diagnostics?.proxyMode || 'N/A'} | PAC: {diagnostics?.pac?.pacUrl || 'Not active'}
            </Typography>
            {diagnostics?.decisions?.slice?.(0, 5)?.map((decision: any) => (
              <Typography
                key={`${decision.timestamp}-${decision.appPath}-${decision.policy}`}
                variant="caption"
                sx={{ color: decision.success ? 'var(--success)' : 'var(--secondary)', display: 'block' }}
              >
                {decision.timestamp} | {decision.appName} | {decision.policy} | {decision.action}
              </Typography>
            ))}
          </CardContent>
        </Card>

        <Box sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
          <ProxyIcon sx={{ fontSize: 18, color: 'var(--primary)' }} />
          <Typography variant="overline" sx={{ fontWeight: 700, color: 'var(--primary)', letterSpacing: '0.1em' }}>
            Application Policies ({filteredApps.length})
          </Typography>
        </Box>

        <Card sx={{ backgroundColor: 'var(--bg-card)', borderRadius: 3, overflow: 'hidden' }}>
          <List disablePadding>
            {filteredApps.length > 0 ? (
              filteredApps.map((app, index) => {
                const policy = policyByPath.get(app.path) || 'none';
                const isBusy = busyAppPath === app.path;
                const engineInfo = getEngineIndicator(app.name);
                return (
                  <React.Fragment key={app.path}>
                    {index > 0 && <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />}
                    <ListItem disablePadding>
                      <ListItemButton sx={{ py: 1.75, '&:hover': { backgroundColor: 'rgba(20, 184, 166, 0.08)' } }}>
                        <ListItemIcon sx={{ minWidth: 44 }}>{getAppIcon(app.name)}</ListItemIcon>
                        <ListItemText
                          primary={
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Typography component="span" sx={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                                {app.name}
                              </Typography>
                              <Tooltip title={engineInfo.label} arrow>
                                <DotIcon sx={{ fontSize: 10, color: engineInfo.color }} />
                              </Tooltip>
                            </Stack>
                          }
                          secondary={`${app.path} | ${getPolicyLabel(policy)}`}
                          secondaryTypographyProps={{ sx: { color: 'var(--text-muted)', fontSize: '0.75rem' } }}
                        />
                        <Tooltip title="Launch with VPN">
                          <span>
                            <IconButton
                              disabled={isBusy}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleLaunchWithProxy(app.path);
                              }}
                              sx={{ color: 'var(--text-secondary)', mr: 0.5 }}
                            >
                              {isBusy ? <CircularProgress size={16} /> : <LaunchIcon fontSize="small" />}
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Launch Direct (Bypass)">
                          <span>
                            <IconButton
                              disabled={isBusy}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleLaunchDirect(app.path);
                              }}
                              sx={{ color: 'var(--text-secondary)', mr: 1 }}
                            >
                              <DirectIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Select
                          size="small"
                          value={policy}
                          disabled={isBusy}
                          onChange={(e) => {
                            e.stopPropagation();
                            setPolicy(app.path, e.target.value as AppRoutePolicy);
                          }}
                          sx={{
                            minWidth: 158,
                            color: 'var(--text-strong)',
                            '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(148, 163, 184, 0.35)' },
                            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(148, 163, 184, 0.6)' },
                          }}
                        >
                          <MenuItem value="none">Follow Global</MenuItem>
                          <MenuItem value="bypass">
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <BypassIcon sx={{ fontSize: 16, color: 'var(--secondary)' }} />
                              Bypass VPN
                            </Box>
                          </MenuItem>
                          <MenuItem value="vpn">
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <ProxyIcon sx={{ fontSize: 16, color: 'var(--success)' }} />
                              Use VPN
                            </Box>
                          </MenuItem>
                        </Select>
                      </ListItemButton>
                    </ListItem>
                  </React.Fragment>
                );
              })
            ) : (
              <Box sx={{ py: 6, textAlign: 'center' }}>
                <Typography sx={{ color: 'var(--text-secondary)' }}>
                  No applications found for this filter.
                </Typography>
              </Box>
            )}
          </List>
        </Card>
      </Container>

      <Snackbar
        open={Boolean(notice)}
        autoHideDuration={2800}
        onClose={() => setNotice(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={() => setNotice(null)} severity={notice?.severity || 'info'} variant="filled">
          {notice?.message || ''}
        </Alert>
      </Snackbar>
    </Box>
  );
}
