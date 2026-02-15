import { contextBridge, ipcRenderer } from 'electron';

const electronAPI = {
  // V2Ray connection
  v2ray: {
    connect: (serverId: string) => ipcRenderer.invoke('v2ray:connect', serverId),
    disconnect: () => ipcRenderer.invoke('v2ray:disconnect'),
    getStatus: () => ipcRenderer.invoke('v2ray:getStatus'),
  },

  // Server management
  server: {
    add: (config: any) => ipcRenderer.invoke('server:add', config),
    list: () => ipcRenderer.invoke('server:list'),
    delete: (serverId: string) => ipcRenderer.invoke('server:delete', serverId),
    update: (serverId: string, config: any) => ipcRenderer.invoke('server:update', serverId, config),
    ping: (serverId: string) => ipcRenderer.invoke('server:ping', serverId),
  },

  // App routing
  routing: {
    getApps: () => ipcRenderer.invoke('routing:getApps'),
    setAppBypass: (appPath: string, shouldBypass: boolean) =>
      ipcRenderer.invoke('routing:setAppBypass', appPath, shouldBypass),
    getBypassApps: () => ipcRenderer.invoke('routing:getBypassApps'),
    setAppPolicy: (appPath: string, policy: 'none' | 'bypass' | 'vpn') =>
      ipcRenderer.invoke('routing:setAppPolicy', appPath, policy),
    getAppPolicies: () => ipcRenderer.invoke('routing:getAppPolicies'),
    launchWithProxy: (appPath: string) => ipcRenderer.invoke('routing:launchWithProxy', appPath),
  },

  // Settings
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (settings: any) => ipcRenderer.invoke('settings:save', settings),
    togglePing: (enable: boolean) => ipcRenderer.invoke('settings:togglePing', enable),
  },

  // Debug logger
  debug: {
    getLogs: (filter?: any) => ipcRenderer.invoke('debug:getLogs', filter),
    clearLogs: () => ipcRenderer.invoke('debug:clearLogs'),
    exportLogs: () => ipcRenderer.invoke('debug:exportLogs'),
    getLogFile: () => ipcRenderer.invoke('debug:getLogFile'),
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}
