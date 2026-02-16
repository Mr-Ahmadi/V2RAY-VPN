import { app, BrowserWindow, Menu, ipcMain, protocol } from 'electron';
import * as path from 'path';
import * as net from 'net';
import * as fs from 'fs';
import { initializeDatabase, saveMemoryStorage } from '../db/database';
import { V2RayService } from '../services/v2ray';
import { AppRoutingService } from '../services/appRouting';
import debugLogger from '../services/debugLogger';

// Handle EPIPE errors (when stdout/stderr pipe closes)
// This prevents the application from crashing if the console output pipe is broken
// This commonly happens when the app is launched from a terminal and the terminal is closed
const ignoreEpipe = (err: any) => {
  if (err.code === 'EPIPE') return;
  throw err;
};
if (process.stdout && process.stdout.on) process.stdout.on('error', ignoreEpipe);
if (process.stderr && process.stderr.on) process.stderr.on('error', ignoreEpipe);

// Make the custom `app://` scheme behave like a standard, secure scheme so
// relative asset requests and Fetch/XHR/CSP work correctly in production.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

const PING_TIMEOUT_MS = 5000;


// Check if we're in development mode
const isDev = process.env.NODE_ENV === 'development';
const isPackaged = app.isPackaged;

// Enable logging
console.log('[Main] App starting in', isDev ? 'DEVELOPMENT' : 'PRODUCTION', 'mode');
console.log('[Main] __dirname:', __dirname);
console.log('[Main] Process platform:', process.platform);
console.log('[Main] Electron version:', process.versions.electron);

let mainWindow: BrowserWindow | null = null;
let v2rayService: V2RayService;
let appRoutingService: AppRoutingService;

// Register custom protocol handler for serving static assets
const registerProtocolHandler = () => {
  protocol.registerFileProtocol('app', (request, callback) => {
    // Normalize the incoming URL into a build-relative path. Handle cases like:
    // - app://index.html/static/js/...    (when base was app://index.html)
    // - app://./static/js/...            (when base is app://./index.html)
    // - app://./index.html               (root)
    let filePath = request.url.substring('app://'.length);

    // Strip any leading './' or '/' and remove accidental 'index.html/' prefix
    filePath = filePath.replace(/^\.?\/*/, '');
    filePath = filePath.replace(/^index\.html\//, '');

    // Default to index.html if root is requested
    if (filePath === '' || filePath === '/') {
      filePath = 'index.html';
    }

    const appRoot = app.getAppPath();
    const buildDirPath = path.join(appRoot, 'build', filePath);

    // Verify file exists before returning
    if (fs.existsSync(buildDirPath)) {
      callback({ path: buildDirPath });
    } else {
      console.warn('[Main] File not found:', buildDirPath);
      // Fall back to index.html for SPA routing
      callback({ path: path.join(appRoot, 'build', 'index.html') });
    }
  });
};

const createWindow = async () => {
  console.log('[Main] Creating window...');
  console.log('[Main] isDev:', isDev);
  console.log('[Main] isPackaged:', isPackaged);
  console.log('[Main] __dirname:', __dirname);

  // The preload script is in the same directory since both index.ts and preload.ts compile to dist/main/
  const preloadPath = path.join(__dirname, 'preload.js');
  console.log('[Main] Preload path:', preloadPath);

  console.log('[Main] About to create BrowserWindow...');
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
    },
  });
  console.log('[Main] BrowserWindow created');

  if (isDev) {
    console.log('[Main] Loading URL: http://localhost:3000 (dev)');
    try {
      await mainWindow.loadURL('http://localhost:3000');
      console.log('[Main] loadURL (dev) completed');
    } catch (error) {
      console.error('[Main] Failed to load dev URL:', error);
      throw error;
    }
  } else {
    // Attach renderer diagnostics so we can capture console logs and errors from the
    // renderer process into the main process logs. This greatly helps diagnosing
    // ‘blank page’ problems in packaged builds.
    mainWindow.webContents.on('did-finish-load', () => {
      console.log('[Main] Renderer did-finish-load URL:', mainWindow?.webContents.getURL());
    });

    mainWindow.webContents.on('console-message', (_e: any, level: number, message: string, line: number, sourceId: string) => {
      console.log(`[Renderer console (level ${level})] ${message} (${sourceId}:${line})`);
    });

    mainWindow.webContents.on('render-process-gone', (event, details) => {
      console.error('[Main] Renderer process gone:', details);
    });
    // Try the custom app:// protocol first (works well when properly registered).
    // If for any reason it doesn't actually render the app (e.g., protocol not
    // resolving correctly in some packaged setups), fall back to loading the
    // built `index.html` directly from the filesystem.
    console.log('[Main] Attempting to load via app:// protocol');
    let loaded = false;
    try {
      await mainWindow.loadURL('app://./index.html');
      const loadedUrl = mainWindow.webContents.getURL();
      console.log('[Main] loadURL completed, webContents.getURL():', loadedUrl);
      // If the renderer ends up at about:blank or an empty url, treat as failure
      if (loadedUrl && loadedUrl !== 'about:blank') {
        loaded = true;
      }
    } catch (error) {
      console.warn('[Main] app:// protocol load failed:', error);
    }

    if (!loaded) {
      // Fallback to loading file directly from the packaged build directory
      try {
        const indexPath = path.join(app.getAppPath(), 'build', 'index.html');
        console.warn('[Main] Falling back to loadFile for index.html:', indexPath);
        await mainWindow.loadFile(indexPath);
        console.log('[Main] loadFile fallback completed');
      } catch (err) {
        console.error('[Main] Failed to load index.html via fallback loadFile:', err);
        throw err;
      }
    }
  }

  console.log('[Main] After loadURL');

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Add error handling
  mainWindow.webContents.on('crashed', () => {
    console.error('[Main] Renderer process crashed!');
    if (mainWindow) {
      mainWindow.reload();
    }
  });

  mainWindow.webContents.on('unresponsive', () => {
    console.warn('[Main] Renderer process unresponsive');
  });

  mainWindow.on('unresponsive', () => {
    console.warn('[Main] Main window unresponsive');
  });

  mainWindow.on('closed', () => {
    console.log('[Main] Window closed');
    mainWindow = null;
  });

  console.log('[Main] Window setup complete');
};

app.on('ready', async () => {
  console.log('[Main] App ready event fired');

  try {
    // Register protocol handler FIRST
    if (!isDev) {
      console.log('[Main] Registering custom protocol handler...');
      registerProtocolHandler();
      console.log('[Main] Protocol handler registered');
    }

    // Initialize services
    console.log('[Main] Initializing database...');
    await initializeDatabase();
    console.log('[Main] Database initialized successfully');

    console.log('[Main] Initializing V2RayService...');
    v2rayService = new V2RayService();
    await v2rayService.initialize();
    console.log('[Main] V2RayService initialized successfully');

    console.log('[Main] Initializing AppRoutingService...');
    appRoutingService = new AppRoutingService();
    console.log('[Main] AppRoutingService initialized successfully');

    // Setup IPC handlers BEFORE creating window
    setupIPCHandlers();
    console.log('[Main] IPC handlers setup complete');

    // NOW create the window
    console.log('[Main] Creating window...');
    await createWindow();
    console.log('[Main] Window created successfully');
  } catch (error) {
    console.error('[Main] Failed to create window:', error);
    app.quit();
    return;
  }

  createMenu();
});

app.on('window-all-closed', () => {
  // Don't quit the app or disconnect VPN on macOS when window is closed
  // (app continues running in background)
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  // Save data before quitting
  console.log('[Main] Saving persistent storage before quit...');
  saveMemoryStorage();

  // Only disconnect VPN when app is actually quitting
  if (v2rayService) {
    await v2rayService.stop();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

const createMenu = () => {
  const template: any = [
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          role: 'undo',
        },
        {
          label: 'Redo',
          accelerator: 'CmdOrCtrl+Shift+Z',
          role: 'redo',
        },
        { type: 'separator' },
        {
          label: 'Cut',
          accelerator: 'CmdOrCtrl+X',
          role: 'cut',
        },
        {
          label: 'Copy',
          accelerator: 'CmdOrCtrl+C',
          role: 'copy',
        },
        {
          label: 'Paste',
          accelerator: 'CmdOrCtrl+V',
          role: 'paste',
        },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

const setupIPCHandlers = () => {
  console.log('[Main] Setting up IPC handlers...');
  const isVpnConnected = async (): Promise<boolean> => {
    if (!v2rayService) return false;
    try {
      const status = await v2rayService.getStatus();
      return Boolean(status?.connected);
    } catch {
      return false;
    }
  };

  ipcMain.handle('v2ray:connect', async (_: any, serverId: string) => {
    try {
      if (!v2rayService) throw new Error('V2Ray service not initialized');
      const result = await v2rayService.connect(serverId);
      return { success: true, data: result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('v2ray:disconnect', async () => {
    try {
      if (!v2rayService) throw new Error('V2Ray service not initialized');
      await v2rayService.disconnect();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('v2ray:getStatus', async () => {
    try {
      if (!v2rayService) {
        return { success: true, data: { connected: false } };
      }
      const status = await v2rayService.getStatus();
      return { success: true, data: status };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Server management handlers
  ipcMain.handle('server:add', async (_: any, serverConfig: any) => {
    try {
      if (!v2rayService) throw new Error('V2Ray service not initialized');
      const result = await v2rayService.addServer(serverConfig);
      return { success: true, data: result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('server:list', async () => {
    try {
      if (!v2rayService) throw new Error('V2Ray service not initialized');
      const servers = await v2rayService.listServers();
      return { success: true, data: servers };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('server:delete', async (_: any, serverId: string) => {
    try {
      if (!v2rayService) throw new Error('V2Ray service not initialized');
      await v2rayService.deleteServer(serverId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('server:update', async (_: any, serverId: string, config: any) => {
    try {
      if (!v2rayService) throw new Error('V2Ray service not initialized');
      const result = await v2rayService.updateServer(serverId, config);
      return { success: true, data: result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('server:ping', async (_: any, serverId: string) => {
    try {
      if (!v2rayService) throw new Error('V2Ray service not initialized');
      return await v2rayService.testServerRealDelay(serverId);
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // App routing handlers
  ipcMain.handle('routing:getApps', async () => {
    try {
      if (!appRoutingService) throw new Error('AppRouting service not initialized');
      const apps = await appRoutingService.getInstalledApps();
      return { success: true, data: apps };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('routing:setAppBypass', async (_: any, appPath: string, shouldBypass: boolean) => {
    try {
      if (!appRoutingService) throw new Error('AppRouting service not initialized');
      await appRoutingService.setAppBypass(appPath, shouldBypass);
      if (await isVpnConnected()) {
        await v2rayService.applyAppPolicyNow(appPath, shouldBypass ? 'bypass' : 'none');
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('routing:getBypassApps', async () => {
    try {
      if (!appRoutingService) throw new Error('AppRouting service not initialized');
      const apps = await appRoutingService.getBypassApps();
      return { success: true, data: apps };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('routing:launchWithProxy', async (_: any, appPath: string) => {
    try {
      if (!appRoutingService) throw new Error('AppRouting service not initialized');
      // Deterministic behavior: if already running, relaunch so proxy override is applied.
      await appRoutingService.ensureAppUsesProxy(appPath, true);
      // Keep stored policy in sync with the explicit launch action.
      await appRoutingService.setAppPolicy(appPath, 'vpn');
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('routing:launchDirect', async (_: any, appPath: string) => {
    try {
      if (!appRoutingService) throw new Error('AppRouting service not initialized');
      // Deterministic behavior: if already running, relaunch so direct override is applied.
      await appRoutingService.ensureAppBypassesProxy(appPath, true);
      // Keep stored policy in sync with the explicit launch action.
      await appRoutingService.setAppPolicy(appPath, 'bypass');
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('routing:setAppPolicy', async (_: any, appPath: string, policy: 'none' | 'bypass' | 'vpn') => {
    try {
      if (!appRoutingService) throw new Error('AppRouting service not initialized');
      await appRoutingService.setAppPolicy(appPath, policy);
      if (await isVpnConnected()) {
        await v2rayService.applyAppPolicyNow(appPath, policy);
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('routing:getAppPolicies', async () => {
    try {
      if (!appRoutingService) throw new Error('AppRouting service not initialized');
      const apps = await appRoutingService.getAppRoutingRules();
      return { success: true, data: apps };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('routing:getDiagnostics', async () => {
    try {
      if (!v2rayService) throw new Error('V2Ray service not initialized');
      return { success: true, data: v2rayService.getRoutingDiagnostics() };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Advanced Routing Handlers
  ipcMain.handle('routing:getRules', async () => {
    try {
      if (!v2rayService) throw new Error('V2Ray service not initialized');
      const rules = v2rayService.getRoutingManager().getRules();
      return { success: true, data: rules };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('routing:addRule', async (_: any, rule: any) => {
    try {
      if (!v2rayService) throw new Error('V2Ray service not initialized');
      const id = await v2rayService.getRoutingManager().addRule(rule);
      return { success: true, data: { id } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('routing:removeRule', async (_: any, ruleId: number) => {
    try {
      if (!v2rayService) throw new Error('V2Ray service not initialized');
      await v2rayService.getRoutingManager().removeRule(ruleId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Settings handlers
  ipcMain.handle('settings:get', async () => {
    try {
      if (!v2rayService) throw new Error('V2Ray service not initialized');
      const settings = await v2rayService.getSettings();
      return { success: true, data: settings };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('settings:save', async (_: any, settings: any) => {
    try {
      if (!v2rayService) throw new Error('V2Ray service not initialized');
      await v2rayService.saveSettings(settings);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('settings:togglePing', async (_: any, enable: boolean) => {
    try {
      if (!v2rayService) throw new Error('V2Ray service not initialized');
      await v2rayService.saveSettings({ enablePingCalculation: enable });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Debug logger handlers
  ipcMain.handle('debug:getLogs', async (_: any, filter?: any) => {
    try {
      const logs = debugLogger.getLogs(filter);
      return { success: true, data: logs };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('debug:clearLogs', async () => {
    try {
      debugLogger.clearLogs();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });



  ipcMain.handle('debug:exportLogs', async () => {
    try {
      const logs = debugLogger.exportLogs();
      return { success: true, data: logs };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('debug:getLogFile', async () => {
    try {
      const filePath = debugLogger.getLogFilePath();
      return { success: true, data: filePath };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  console.log('[Main] IPC handlers setup complete');
};
