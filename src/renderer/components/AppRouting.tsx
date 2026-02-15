import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
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
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Apps as AppsIcon,
  DirectionsRun as BypassIcon,
  Launch as LaunchIcon,
  Public as NetIcon,
  Search as SearchIcon,
  ShieldOutlined as ProxyIcon,
} from '@mui/icons-material';

type AppRoutePolicy = 'none' | 'bypass' | 'vpn';

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadApps();
  }, []);

  const loadApps = async () => {
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
    } catch (error) {
      console.error('Error loading app routing data:', error);
    } finally {
      setLoading(false);
    }
  };

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
    return allApps.filter(app =>
      app.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.path.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [allApps, searchTerm]);

  const setPolicy = async (appPath: string, policy: AppRoutePolicy) => {
    try {
      const result = await window.electronAPI.routing.setAppPolicy(appPath, policy);
      if (result.success) {
        setAppPolicies(prev => {
          const withoutCurrent = prev.filter(rule => rule.appPath !== appPath);
          if (policy === 'none') {
            return withoutCurrent;
          }
          const app = allApps.find(item => item.path === appPath);
          return [...withoutCurrent, { appPath, appName: app?.name || appPath, policy }];
        });
      }
    } catch (error) {
      console.error('Error setting app policy:', error);
    }
  };

  const handleLaunchWithProxy = async (appPath: string) => {
    try {
      const res = await window.electronAPI.routing.launchWithProxy(appPath);
      if (!res.success) {
        console.error('Failed to launch with proxy:', res.error);
      }
    } catch (error) {
      console.error('Error launching app with proxy:', error);
    }
  };

  const isBrowserLike = (appName: string) => {
    const browsers = ['chrome', 'firefox', 'safari', 'edge', 'brave', 'opera'];
    return browsers.some(b => appName.toLowerCase().includes(b));
  };

  const getAppIcon = (appName: string) => {
    if (isBrowserLike(appName)) return <NetIcon sx={{ color: '#6366f1' }} />;
    return <AppsIcon sx={{ color: '#94a3b8' }} />;
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

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 8 }}>
        <CircularProgress size={40} thickness={4} sx={{ color: '#6366f1' }} />
      </Box>
    );
  }

  return (
    <Box sx={{ py: 4, minHeight: '100%' }}>
      <Container maxWidth="md">
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, letterSpacing: '-0.02em' }}>
            Application Routing
          </Typography>
          <Typography variant="body1" sx={{ color: '#94a3b8', mb: 1 }}>
            Define per-app network policy independent from global VPN mode.
          </Typography>
          <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mb: 3 }}>
            Bypass: {bypassCount} apps | Use VPN: {vpnCount} apps
          </Typography>

          <Card className="glass" sx={{ border: 'none', background: 'rgba(30, 41, 59, 0.4)' }}>
            <CardContent sx={{ p: '12px !important' }}>
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
                      <SearchIcon sx={{ color: '#6366f1', ml: 1, mr: 1 }} />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  '& .MuiInputBase-input': {
                    color: '#f8fafc',
                    py: 1.5,
                    fontSize: '1.1rem',
                  },
                }}
              />
            </CardContent>
          </Card>
        </Box>

        <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <ProxyIcon sx={{ fontSize: 18, color: '#6366f1' }} />
          <Typography variant="overline" sx={{ fontWeight: 700, color: '#6366f1', letterSpacing: '0.1em' }}>
            Application Policies ({filteredApps.length})
          </Typography>
        </Box>

        <Card sx={{ backgroundColor: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
          <List disablePadding>
            {filteredApps.length > 0 ? (
              filteredApps.map((app, index) => {
                const policy = policyByPath.get(app.path) || 'none';
                const isBypass = policy === 'bypass';
                return (
                  <React.Fragment key={app.path}>
                    {index > 0 && <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />}
                    <ListItem disablePadding>
                      <ListItemButton sx={{ py: 2, '&:hover': { backgroundColor: 'rgba(99, 102, 241, 0.05)' } }}>
                        <ListItemIcon sx={{ minWidth: 48 }}>{getAppIcon(app.name)}</ListItemIcon>
                        <ListItemText
                          primary={app.name}
                          secondary={`${app.path} · ${getPolicyLabel(policy)}`}
                          primaryTypographyProps={{ sx: { fontWeight: 500, color: isBypass ? '#fbbf24' : '#f8fafc' } }}
                          secondaryTypographyProps={{ sx: { color: '#64748b', fontSize: '0.75rem' } }}
                        />
                        <Tooltip title="Launch with Proxy">
                          <IconButton
                            onClick={(e) => {
                              e.stopPropagation();
                              handleLaunchWithProxy(app.path);
                            }}
                            sx={{ color: '#94a3b8', mr: 1 }}
                          >
                            <LaunchIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Select
                          size="small"
                          value={policy}
                          onChange={(e) => {
                            e.stopPropagation();
                            setPolicy(app.path, e.target.value as AppRoutePolicy);
                          }}
                          sx={{
                            minWidth: 160,
                            color: '#e2e8f0',
                            '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(148, 163, 184, 0.35)' },
                            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(148, 163, 184, 0.6)' },
                          }}
                        >
                          <MenuItem value="none">Follow Global</MenuItem>
                          <MenuItem value="bypass">
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <BypassIcon sx={{ fontSize: 16, color: '#f59e0b' }} />
                              Bypass VPN
                            </Box>
                          </MenuItem>
                          <MenuItem value="vpn">
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <ProxyIcon sx={{ fontSize: 16, color: '#22c55e' }} />
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
                <Typography color="textSecondary">No applications found matching your search.</Typography>
              </Box>
            )}
          </List>
        </Card>
      </Container>
    </Box>
  );
}
