declare global {
  interface Window {
    electronAPI: {
      v2ray: {
        connect: (serverId: string) => Promise<any>;
        disconnect: () => Promise<any>;
        getStatus: () => Promise<any>;
      };
      server: {
        add: (config: any) => Promise<any>;
        list: () => Promise<any>;
        delete: (serverId: string) => Promise<any>;
        update: (serverId: string, config: any) => Promise<any>;
        ping: (serverId: string) => Promise<{ success: boolean; latency?: number; error?: string }>;
      };
      routing: {
        getApps: () => Promise<any>;
        setAppBypass: (appPath: string, shouldBypass: boolean) => Promise<any>;
        getBypassApps: () => Promise<any>;
        setAppPolicy: (appPath: string, policy: 'none' | 'bypass' | 'vpn') => Promise<any>;
        getAppPolicies: () => Promise<any>;
        launchWithProxy: (appPath: string) => Promise<any>;
      };
      settings: {
        get: () => Promise<any>;
        save: (settings: any) => Promise<any>;
        togglePing: (enable: boolean) => Promise<any>;
      };
    };
  }
}

export {};
