import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Container,
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Switch,
  TextField,
  InputAdornment,
  CircularProgress,
  IconButton,
  Tooltip,
  Divider,
} from '@mui/material';
import {
  Search as SearchIcon,
  Apps as AppsIcon,
  Launch as LaunchIcon,
  Public as NetIcon,
  ShieldOutlined as ProxyIcon,
  DirectionsRun as BypassIcon,
} from '@mui/icons-material';

interface App {
  name: string;
  path: string;
}

interface BypassApp {
  appPath: string;
  appName: string;
  shouldBypass: boolean;
}

export default function AppRouting() {
  const [allApps, setAllApps] = useState<App[]>([]);
  const [bypassApps, setBypassApps] = useState<BypassApp[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadApps();
  }, []);

  const loadApps = async () => {
    try {
      setLoading(true);
      const [appsResult, bypassResult] = await Promise.all([
        window.electronAPI.routing.getApps(),
        window.electronAPI.routing.getBypassApps(),
      ]);

      if (appsResult.success) {
        const uniqueApps = Array.from(
          new Map(appsResult.data.map((app: App) => [app.path, app])).values()
        ) as App[];
        setAllApps(uniqueApps.sort((a, b) => a.name.localeCompare(b.name)));
      }
      if (bypassResult.success) {
        setBypassApps(bypassResult.data);
      }
    } catch (error) {
      console.error('Error loading apps:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleApp = async (appPath: string) => {
    try {
      const currentlyBypassed = bypassApps.some(app => app.appPath === appPath);
      const newBypass = !currentlyBypassed;
      const result = await window.electronAPI.routing.setAppBypass(appPath, newBypass);
      if (result.success) {
        // Optimistic update or reload
        await loadApps();
      }
    } catch (error) {
      console.error('Error toggling app:', error);
    }
  };

  const filteredApps = useMemo(() => {
    return allApps.filter(app =>
      app.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.path.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [allApps, searchTerm]);

  const handleLaunchWithProxy = async (appPath: string) => {
    try {
      const res = await window.electronAPI.routing.launchWithProxy(appPath);
      if (!res.success) {
        console.error('Failed to launch:', res.error);
      }
    } catch (error) {
      console.error('Error launching app with proxy:', error);
    }
  };

  const isBrowsersIcon = (appName: string) => {
    const browsers = ['chrome', 'firefox', 'safari', 'edge', 'brave', 'opera'];
    return browsers.some(b => appName.toLowerCase().includes(b));
  };

  const getAppIcon = (appName: string) => {
    if (isBrowsersIcon(appName)) return <NetIcon sx={{ color: '#6366f1' }} />;
    return <AppsIcon sx={{ color: '#94a3b8' }} />;
  };

  const isAppBypassed = (appPath: string) => {
    return bypassApps.some(app => app.appPath === appPath && app.shouldBypass);
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
          <Typography variant="body1" sx={{ color: '#94a3b8', mb: 3 }}>
            Fine-tune which applications use the VPN tunnel.
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
                    fontSize: '1.1rem'
                  },
                }}
              />
            </CardContent>
          </Card>
        </Box>

        {/* Bypassed Section */}
        {bypassApps.length > 0 && !searchTerm && (
          <Box sx={{ mb: 4 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <BypassIcon sx={{ fontSize: 18, color: '#f59e0b' }} />
              <Typography variant="overline" sx={{ fontWeight: 700, color: '#f59e0b', letterSpacing: '0.1em' }}>
                Bypassing VPN ({bypassApps.length})
              </Typography>
            </Box>
            <Card sx={{ backgroundColor: '#1e293b', borderRadius: 3, border: '1px solid rgba(245, 158, 11, 0.2)' }}>
              <List disablePadding>
                {bypassApps.map((app, index) => (
                  <React.Fragment key={app.appPath}>
                    {index > 0 && <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />}
                    <ListItem disablePadding>
                      <ListItemButton
                        onClick={() => handleToggleApp(app.appPath)}
                        sx={{ py: 2, '&:hover': { backgroundColor: 'rgba(245, 158, 11, 0.05)' } }}
                      >
                        <ListItemIcon sx={{ minWidth: 48 }}>{getAppIcon(app.appName)}</ListItemIcon>
                        <ListItemText
                          primary={app.appName}
                          secondary={app.appPath}
                          primaryTypographyProps={{ sx: { fontWeight: 500 } }}
                          secondaryTypographyProps={{ sx: { color: '#64748b', fontSize: '0.75rem' } }}
                        />
                        <Tooltip title="Launch with Proxy">
                          <IconButton
                            onClick={(e) => { e.stopPropagation(); handleLaunchWithProxy(app.appPath); }}
                            sx={{ color: '#94a3b8', mr: 1 }}
                          >
                            <LaunchIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Switch
                          edge="end"
                          color="warning"
                          checked={!app.shouldBypass}
                          onChange={(e) => { e.stopPropagation(); handleToggleApp(app.appPath); }}
                        />
                      </ListItemButton>
                    </ListItem>
                  </React.Fragment>
                ))}
              </List>
            </Card>
          </Box>
        )}

        {/* All Apps Section */}
        <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <ProxyIcon sx={{ fontSize: 18, color: '#6366f1' }} />
          <Typography variant="overline" sx={{ fontWeight: 700, color: '#6366f1', letterSpacing: '0.1em' }}>
            Available Applications ({filteredApps.length})
          </Typography>
        </Box>
        <Card sx={{ backgroundColor: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
          <List disablePadding>
            {filteredApps.length > 0 ? (
              filteredApps.map((app, index) => {
                const bypassed = isAppBypassed(app.path);
                return (
                  <React.Fragment key={app.path}>
                    {index > 0 && <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />}
                    <ListItem disablePadding>
                      <ListItemButton
                        onClick={() => handleToggleApp(app.path)}
                        sx={{ py: 2, '&:hover': { backgroundColor: 'rgba(99, 102, 241, 0.05)' } }}
                      >
                        <ListItemIcon sx={{ minWidth: 48 }}>{getAppIcon(app.name)}</ListItemIcon>
                        <ListItemText
                          primary={app.name}
                          secondary={app.path}
                          primaryTypographyProps={{ sx: { fontWeight: 500, color: bypassed ? '#64748b' : '#f8fafc' } }}
                          secondaryTypographyProps={{ sx: { color: '#475569', fontSize: '0.75rem' } }}
                        />
                        <Tooltip title="Launch with Proxy">
                          <IconButton
                            onClick={(e) => { e.stopPropagation(); handleLaunchWithProxy(app.path); }}
                            sx={{ color: '#475569', mr: 1 }}
                          >
                            <LaunchIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Switch
                          edge="end"
                          checked={!bypassed}
                          onChange={(e) => { e.stopPropagation(); handleToggleApp(app.path); }}
                        />
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
