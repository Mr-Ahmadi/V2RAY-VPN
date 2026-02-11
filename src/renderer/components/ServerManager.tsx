import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Card,
  CardContent,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Typography,
  IconButton,
  Chip,
  Grid,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  Add as AddIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Link as LinkIcon,
  VpnKey as ConnectIcon,
  CallEnd as DisconnectIcon,
  Speed as SpeedIcon,
} from '@mui/icons-material';

interface Server {
  id: string;
  name: string;
  protocol: 'vless' | 'vmess' | 'trojan' | 'shadowsocks';
  address: string;
  port: number;
  config: Record<string, any>;
  remarks?: string;
}

interface ConnectionStatus {
  connected: boolean;
  currentServer?: { id: string; name: string; protocol: string; address: string; port: number };
}

export default function ServerManager() {
  const [servers, setServers] = useState<Server[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({ connected: false });
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [openUriDialog, setOpenUriDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [uriInput, setUriInput] = useState('');
  const [uriError, setUriError] = useState('');
  const [uriLoading, setUriLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [connectError, setConnectError] = useState('');
  const [pingResults, setPingResults] = useState<Record<string, { latency?: number; error?: string }>>({});
  const [pingingId, setPingingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    protocol: 'vless' as 'vless' | 'vmess' | 'trojan' | 'shadowsocks',
    address: '',
    port: 443,
    remarks: '',
    id: '', // for VLESS/Vmess
    password: '', // for Trojan/Shadowsocks
    encryption: 'none',
    method: 'aes-256-gcm',
  });

  useEffect(() => {
    loadServers();
  }, []);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const result = await window.electronAPI.v2ray.getStatus();
        if (result.success) setConnectionStatus(result.data);
      } catch {
        // ignore
      }
    };
    checkStatus();
    const interval = setInterval(checkStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  const loadServers = async () => {
    try {
      setLoading(true);
      const result = await window.electronAPI.server.list();
      if (result.success) {
        setServers(result.data);
      }
    } catch (error) {
      console.error('Error loading servers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (server?: Server) => {
    if (server) {
      setEditingId(server.id);
      setFormData({
        name: server.name,
        protocol: server.protocol,
        address: server.address,
        port: server.port,
        remarks: server.remarks || '',
        id: server.config.id || '',
        password: server.config.password || '',
        encryption: server.config.encryption || 'none',
        method: server.config.method || 'aes-256-gcm',
      });
    } else {
      setEditingId(null);
      setFormData({
        name: '',
        protocol: 'vless',
        address: '',
        port: 443,
        remarks: '',
        id: '',
        password: '',
        encryption: 'none',
        method: 'aes-256-gcm',
      });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingId(null);
    setFormError('');
  };

  const handleCloseUriDialog = () => {
    setOpenUriDialog(false);
    setUriInput('');
    setUriError('');
  };

  const parseUri = (uri: string): Partial<Server> | null => {
    try {
      // Handle vless:// and vmess:// URIs
      if (uri.startsWith('vless://')) {
        return parseVlessUri(uri);
      } else if (uri.startsWith('vmess://')) {
        return parseVmessUri(uri);
      } else if (uri.startsWith('trojan://')) {
        return parseTrojanUri(uri);
      } else if (uri.startsWith('ss://')) {
        return parseShadowsocksUri(uri);
      }
      return null;
    } catch (error) {
      console.error('Error parsing URI:', error);
      return null;
    }
  };

  const parseVlessUri = (uri: string): Partial<Server> => {
    // vless://uuid@address:port?query#remarks
    try {
      // Split URI into main parts and fragment (remarks)
      const [mainUri, fragment] = uri.split('#');
      
      // Match the main structure: vless://uuid@address:port?querystring
      const match = mainUri.match(/vless:\/\/([^@]+)@([^:/?]+):(\d+)(.*)$/);
      if (!match) {
        console.error('VLESS URI regex failed for:', uri);
        throw new Error('Invalid VLESS URI format');
      }

      const [, id, address, port, queryPart] = match;
      
      // Parse query parameters - handle both ? and # separators
      let params = new URLSearchParams();
      if (queryPart) {
        // Remove leading ? if present
        const queryString = queryPart.startsWith('?') ? queryPart.substring(1) : queryPart;
        params = new URLSearchParams(queryString);
      }

      // Decode fragment if it exists (remarks are often in the fragment)
      let remarks = '';
      if (fragment) {
        try {
          remarks = decodeURIComponent(fragment);
        } catch (e) {
          remarks = fragment;
        }
      }

      const name = params.get('remarks') || remarks || address;

      console.log('Parsed VLESS URI:', { id, address, port: parseInt(port), name });

      return {
        protocol: 'vless',
        address,
        port: parseInt(port),
        config: { 
          id, 
          encryption: params.get('encryption') || 'none',
          // Store other relevant parameters
          hiddify: params.get('hiddify'),
          sni: params.get('sni'),
          type: params.get('type'),
          alpn: params.get('alpn'),
          path: params.get('path'),
          host: params.get('host'),
          serviceName: params.get('serviceName'),
          mode: params.get('mode'),
          fp: params.get('fp'),
          headerType: params.get('headerType'),
          security: params.get('security'),
          allowInsecure: params.get('allowInsecure'),
          insecure: params.get('insecure'),
        },
        name: name,
        remarks: remarks,
      };
    } catch (error) {
      console.error('Error parsing VLESS URI:', uri, error);
      throw error;
    }
  };

  const parseVmessUri = (uri: string): Partial<Server> => {
    // vmess://base64encoded
    const encoded = uri.replace('vmess://', '');
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    const config = JSON.parse(decoded);

    return {
      protocol: 'vmess',
      address: config.add || config.address,
      port: config.port || 443,
      config: {
        id: config.id,
        alterId: config.aid ?? config.alterId ?? 0,
        security: config.scy || config.security || 'auto',
        type: config.net || 'tcp',
        path: config.path || '',
        host: config.host || config.sni || '',
        sni: config.sni || config.host || '',
        tls: config.tls === 'tls' ? 'tls' : 'none',
        allowInsecure: config.allowInsecure === true || config.allowInsecure === 'true',
      },
      name: config.ps || config.name || config.add,
      remarks: config.ps || '',
    };
  };

  const parseTrojanUri = (uri: string): Partial<Server> => {
    // trojan://password@address:port?remarks=name&sni=...
    const match = uri.match(/trojan:\/\/([^@]+)@([^:]+):(\d+)(.*)$/);
    if (!match) throw new Error('Invalid Trojan URI format');

    const [, password, address, port, queryString] = match;
    const params = new URLSearchParams(queryString.split('?')[1] || '');
    const sni = params.get('sni') || params.get('peer') || '';

    return {
      protocol: 'trojan',
      address,
      port: parseInt(port),
      config: {
        password,
        sni: sni || address,
        allowInsecure: params.get('allowInsecure') === '1' || params.get('allowInsecure') === 'true',
      },
      name: params.get('remarks') ? decodeURIComponent(params.get('remarks')!) : address,
      remarks: params.get('remarks') ? decodeURIComponent(params.get('remarks')!) : '',
    };
  };

  const parseShadowsocksUri = (uri: string): Partial<Server> => {
    // ss://method:password@address:port#remarks
    const [schemeContent, remarks] = uri.split('#');
    const match = schemeContent.match(/ss:\/\/([^:]+):([^@]+)@([^:]+):(\d+)/);
    if (!match) throw new Error('Invalid Shadowsocks URI format');

    const [, method, password, address, port] = match;

    return {
      protocol: 'shadowsocks',
      address,
      port: parseInt(port),
      config: { password, method },
      name: remarks ? decodeURIComponent(remarks) : address,
      remarks: remarks ? decodeURIComponent(remarks) : '',
    };
  };

  const handleImportUri = async () => {
    try {
      setUriError('');
      setUriLoading(true);

      console.log('Attempting to parse URI:', uriInput.trim().substring(0, 50) + '...');
      
      const parsed = parseUri(uriInput.trim());
      if (!parsed) {
        setUriError('Invalid URI format. Supported: vless://, vmess://, trojan://, ss://');
        console.error('URI parsing returned null');
        return;
      }

      console.log('Successfully parsed URI:', { protocol: parsed.protocol, address: parsed.address, port: parsed.port, name: parsed.name });

      // Auto-fill the form with parsed data
      setFormData({
        name: parsed.name || '',
        protocol: (parsed.protocol || 'vless') as any,
        address: parsed.address || '',
        port: parsed.port || 443,
        remarks: parsed.remarks || '',
        id: parsed.config?.id || '',
        password: parsed.config?.password || '',
        encryption: parsed.config?.encryption || 'none',
        method: parsed.config?.method || 'aes-256-gcm',
      });

      setOpenUriDialog(false);
      setUriInput('');
      setOpenDialog(true);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error in handleImportUri:', errorMsg, error);
      setUriError(`Error: ${errorMsg}`);
    } finally {
      setUriLoading(false);
    }
  };

  const handleSaveServer = async () => {
    try {
      setFormError('');
      setSaveLoading(true);

      // Validation
      if (!formData.name.trim()) {
        setFormError('Server name is required');
        return;
      }
      if (!formData.address.trim()) {
        setFormError('Address is required');
        return;
      }
      if (!formData.port || formData.port <= 0 || formData.port > 65535) {
        setFormError('Port must be between 1 and 65535');
        return;
      }

      if (['vless', 'vmess'].includes(formData.protocol)) {
        if (!formData.id.trim()) {
          setFormError('UUID/ID is required for ' + formData.protocol.toUpperCase());
          return;
        }
      } else if (['trojan', 'shadowsocks'].includes(formData.protocol)) {
        if (!formData.password.trim()) {
          setFormError('Password is required for ' + formData.protocol.toUpperCase());
          return;
        }
      }

      const config: any = {};

      if (['vless', 'vmess'].includes(formData.protocol)) {
        config.id = formData.id;
        if (formData.protocol === 'vmess') {
          config.encryption = formData.encryption;
        } else {
          config.encryption = formData.encryption;
        }
      } else if (formData.protocol === 'trojan') {
        config.password = formData.password;
      } else if (formData.protocol === 'shadowsocks') {
        config.password = formData.password;
        config.method = formData.method;
      }

      const serverData = {
        name: formData.name,
        protocol: formData.protocol,
        address: formData.address,
        port: formData.port,
        config,
        remarks: formData.remarks,
      };

      if (editingId) {
        const result = await window.electronAPI.server.update(editingId, serverData);
        if (result.success) {
          await loadServers();
          handleCloseDialog();
        } else {
          setFormError(result.error || 'Failed to update server');
        }
      } else {
        const result = await window.electronAPI.server.add(serverData);
        if (result.success) {
          await loadServers();
          handleCloseDialog();
        } else {
          setFormError(result.error || 'Failed to add server');
        }
      }
    } catch (error) {
      console.error('Error saving server:', error);
      setFormError(error instanceof Error ? error.message : 'An unexpected error occurred');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDeleteServer = async (id: string) => {
    try {
      const result = await window.electronAPI.server.delete(id);
      if (result.success) {
        await loadServers();
      }
    } catch (error) {
      console.error('Error deleting server:', error);
    }
  };

  const handlePing = async (serverId: string) => {
    try {
      setPingingId(serverId);
      setPingResults(prev => ({ ...prev, [serverId]: {} }));
      const result = await window.electronAPI.server.ping(serverId);
      setPingResults(prev => ({
        ...prev,
        [serverId]: result.success
          ? { latency: result.latency }
          : { error: result.error || 'Failed' },
      }));
    } catch (error) {
      setPingResults(prev => ({
        ...prev,
        [serverId]: { error: error instanceof Error ? error.message : 'Failed' },
      }));
    } finally {
      setPingingId(null);
    }
  };

  const handleConnect = async (serverId: string) => {
    try {
      setConnectError('');
      setConnectingId(serverId);
      const result = await window.electronAPI.v2ray.connect(serverId);
      if (result.success) {
        setConnectionStatus(prev => ({ ...prev, connected: true, currentServer: result.data?.currentServer }));
      } else {
        setConnectError(result.error || 'Failed to connect');
      }
    } catch (error) {
      setConnectError(error instanceof Error ? error.message : 'Connection failed');
    } finally {
      setConnectingId(null);
    }
  };

  const handleDisconnect = async () => {
    try {
      setConnectError('');
      setDisconnectingId(connectionStatus.currentServer?.id ?? null);
      const result = await window.electronAPI.v2ray.disconnect();
      if (result.success) {
        setConnectionStatus({ connected: false });
      } else {
        setConnectError(result.error || 'Failed to disconnect');
      }
    } catch (error) {
      setConnectError(error instanceof Error ? error.message : 'Disconnect failed');
    } finally {
      setDisconnectingId(null);
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
      <Container maxWidth="lg">
        {connectError && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setConnectError('')}>
            {connectError.includes('not found at')
              ? `${connectError} Run: chmod +x setup.sh && ./setup.sh in the app folder to download the V2Ray core.`
              : connectError}
          </Alert>
        )}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            Servers
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              startIcon={<LinkIcon />}
              onClick={() => setOpenUriDialog(true)}
              sx={{
                borderColor: '#6366f1',
                color: '#6366f1',
                '&:hover': {
                  backgroundColor: 'rgba(99, 102, 241, 0.1)',
                },
              }}
            >
              Import URI
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => handleOpenDialog()}
              sx={{
                background: 'linear-gradient(90deg, #6366f1, #ec4899)',
              }}
            >
              Add Server
            </Button>
          </Box>
        </Box>

        <Grid container spacing={2}>
          {servers.map(server => {
            const isConnected = connectionStatus.connected && connectionStatus.currentServer?.id === server.id;
            return (
              <Grid item xs={12} key={server.id}>
                <Card
                  sx={{
                    backgroundColor: '#1e293b',
                    border: isConnected
                      ? '2px solid rgba(16, 185, 129, 0.5)'
                      : '1px solid rgba(99, 102, 241, 0.1)',
                    '&:hover': {
                      borderColor: isConnected ? 'rgba(16, 185, 129, 0.7)' : 'rgba(99, 102, 241, 0.3)',
                    },
                  }}
                >
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: 1 }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <Typography variant="h6" sx={{ fontWeight: 600 }}>
                            {server.name}
                          </Typography>
                          {isConnected && (
                            <Chip label="Connected" size="small" sx={{ backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#10b981' }} />
                          )}
                        </Box>
                        <Typography variant="body2" color="textSecondary">
                          {server.address}:{server.port}
                        </Typography>
                        <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <Chip
                            label={server.protocol.toUpperCase()}
                            size="small"
                            sx={{ backgroundColor: 'rgba(99, 102, 241, 0.2)', color: '#6366f1' }}
                          />
                          {pingResults[server.id]?.latency != null && (
                            <Chip
                              label={`${pingResults[server.id].latency} ms`}
                              size="small"
                              sx={{ backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#10b981' }}
                            />
                          )}
                          {pingResults[server.id]?.error && !pingResults[server.id]?.latency && (
                            <Chip label="Unreachable" size="small" sx={{ backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }} />
                          )}
                        </Box>
                        {server.remarks && (
                          <Typography variant="caption" sx={{ display: 'block', mt: 1, color: '#94a3b8' }}>
                            {server.remarks}
                          </Typography>
                        )}
                      </Box>
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={pingingId === server.id ? <CircularProgress size={16} /> : <SpeedIcon />}
                          onClick={() => handlePing(server.id)}
                          disabled={pingingId === server.id}
                          sx={{ borderColor: '#10b981', color: '#10b981' }}
                        >
                          {pingingId === server.id ? '…' : 'Test'}
                        </Button>
                        {isConnected ? (
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            startIcon={disconnectingId === server.id ? <CircularProgress size={16} /> : <DisconnectIcon />}
                            onClick={handleDisconnect}
                            disabled={disconnectingId === server.id}
                          >
                            {disconnectingId === server.id ? '…' : 'Disconnect'}
                          </Button>
                        ) : (
                          <Button
                            size="small"
                            variant="contained"
                            startIcon={connectingId === server.id ? <CircularProgress size={20} /> : <ConnectIcon />}
                            onClick={() => handleConnect(server.id)}
                            disabled={connectingId === server.id}
                            sx={{
                              background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                              minWidth: 100,
                            }}
                          >
                            {connectingId === server.id ? '…' : 'Connect'}
                          </Button>
                        )}
                        <IconButton size="small" onClick={() => handleOpenDialog(server)} sx={{ color: '#6366f1' }} aria-label="Edit">
                          <EditIcon />
                        </IconButton>
                        <IconButton size="small" onClick={() => handleDeleteServer(server.id)} sx={{ color: '#ef4444' }} aria-label="Delete">
                          <DeleteIcon />
                        </IconButton>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>

        {servers.length === 0 && (
          <Card sx={{ backgroundColor: '#1e293b', textAlign: 'center', py: 6 }}>
            <Box sx={{ mb: 2 }}>
              <Typography color="textSecondary" sx={{ mb: 2 }}>
                No servers added yet. Get started by adding a server:
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                startIcon={<LinkIcon />}
                onClick={() => setOpenUriDialog(true)}
                sx={{
                  background: 'linear-gradient(90deg, #6366f1, #ec4899)',
                }}
              >
                Import from URI
              </Button>
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={() => handleOpenDialog()}
                sx={{
                  borderColor: '#6366f1',
                  color: '#6366f1',
                }}
              >
                Add Manually
              </Button>
            </Box>
          </Card>
        )}
      </Container>

      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingId ? 'Edit Server' : 'Add Server'}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {formError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {formError}
            </Alert>
          )}
          
          <TextField
            fullWidth
            label="Server Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            margin="normal"
            disabled={saveLoading}
          />

          <FormControl fullWidth margin="normal">
            <InputLabel>Protocol</InputLabel>
            <Select
              value={formData.protocol}
              label="Protocol"
              onChange={(e) => setFormData({ ...formData, protocol: e.target.value as any })}
              disabled={saveLoading}
            >
              <MenuItem value="vless">VLESS</MenuItem>
              <MenuItem value="vmess">Vmess</MenuItem>
              <MenuItem value="trojan">Trojan</MenuItem>
              <MenuItem value="shadowsocks">Shadowsocks</MenuItem>
            </Select>
          </FormControl>

          <TextField
            fullWidth
            label="Address"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            margin="normal"
            disabled={saveLoading}
          />

          <TextField
            fullWidth
            label="Port"
            type="number"
            value={formData.port}
            onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
            margin="normal"
            disabled={saveLoading}
          />

          {['vless', 'vmess'].includes(formData.protocol) && (
            <TextField
              fullWidth
              label="UUID/ID"
              value={formData.id}
              onChange={(e) => setFormData({ ...formData, id: e.target.value })}
              margin="normal"
              disabled={saveLoading}
            />
          )}

          {['trojan', 'shadowsocks'].includes(formData.protocol) && (
            <TextField
              fullWidth
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              margin="normal"
              disabled={saveLoading}
              InputProps={{
                endAdornment: (
                  <IconButton
                    size="small"
                    onClick={() => setShowPassword(!showPassword)}
                    edge="end"
                  >
                    {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </IconButton>
                ),
              }}
            />
          )}

          <TextField
            fullWidth
            label="Remarks"
            value={formData.remarks}
            onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
            margin="normal"
            disabled={saveLoading}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} disabled={saveLoading}>Cancel</Button>
          <Button onClick={handleSaveServer} variant="contained" disabled={saveLoading}>
            {saveLoading ? (
              <>
                <CircularProgress size={20} sx={{ mr: 1 }} />
                {editingId ? 'Updating...' : 'Adding...'}
              </>
            ) : (
              editingId ? 'Update' : 'Add'
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {/* URI Import Dialog */}
      <Dialog open={openUriDialog} onClose={handleCloseUriDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Import Server from URI</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            Paste your server sharing link or URI. Supported formats: VLESS, Vmess, Trojan, Shadowsocks.
          </Alert>

          <TextField
            fullWidth
            label="Paste Server URI"
            placeholder="vless://uuid@address:port or vmess://... or trojan://... or ss://..."
            value={uriInput}
            onChange={(e) => {
              setUriInput(e.target.value);
              setUriError('');
            }}
            multiline
            rows={4}
            sx={{ mb: 2 }}
          />

          {uriError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {uriError}
            </Alert>
          )}

          <Typography variant="caption" color="textSecondary">
            Examples:
            <br />• vless://uuid@example.com:443
            <br />• vmess://base64encoded
            <br />• trojan://password@example.com:443
            <br />• ss://method:password@example.com:443
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseUriDialog}>Cancel</Button>
          <Button
            onClick={handleImportUri}
            variant="contained"
            disabled={uriLoading}
            sx={{
              background: 'linear-gradient(90deg, #6366f1, #ec4899)',
            }}
          >
            {uriLoading ? 'Parsing...' : 'Import'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
