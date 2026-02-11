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
    launchWithProxy: (appPath: string) => ipcRenderer.invoke('routing:launchWithProxy', appPath),
  },

  // Settings
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (settings: any) => ipcRenderer.invoke('settings:save', settings),
    togglePing: (enable: boolean) => ipcRenderer.invoke('settings:togglePing', enable),
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}
