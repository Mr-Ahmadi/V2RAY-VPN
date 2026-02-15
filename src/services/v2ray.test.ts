// Mock dependencies before importing V2RayService
jest.mock('../db/database', () => ({
  queryAsync: jest.fn(),
  runAsync: jest.fn(),
}));

jest.mock('./serverManager', () => ({
  ServerManager: jest.fn(),
}));

jest.mock('./appRouting', () => ({
  AppRoutingService: jest.fn(),
}));

jest.mock('./systemProxyManager', () => ({
  default: {
    enableSystemProxy: jest.fn(),
    enableDynamicPac: jest.fn(),
    enableAutoProxy: jest.fn(),
    disableSystemProxy: jest.fn(),
    getPacSnapshot: jest.fn(() => null),
    getSystemProxySnapshot: jest.fn(() => ({ services: [] })),
  },
}));

jest.mock('electron', () => ({
  app: {
    getPath: jest.fn((name: string) => '/tmp/test'),
    getAppPath: jest.fn(() => '/tmp/test'),
    isPackaged: false,
  },
}));

import { V2RayService } from './v2ray';

describe('V2RayService - Routing Rules', () => {
  let service: V2RayService;

  beforeEach(() => {
    service = new V2RayService();
  });

  describe('generateV2RayConfig routing rules', () => {
    test('should include localhost bypass and Telegram proxy rules by default', async () => {
      // Access the private method via type assertion for testing
      const config = await (service as any).generateV2RayConfig(
        {
          id: 'test-server',
          name: 'Test Server',
          protocol: 'vless',
          address: 'example.com',
          port: 443,
          config: {
            id: 'test-uuid',
            encryption: 'none',
          },
        },
        'full',
        [],
        { blockAds: false }
      );

      // Should have localhost bypass + Telegram domain + Telegram IP rules
      expect(config.routing.rules).toHaveLength(3);
      expect(config.routing.rules[0]).toEqual({
        type: 'field',
        outboundTag: 'direct',
        ip: ['127.0.0.0/8', '::1/128'],
        domain: ['domain:localhost'],
      });
      expect(config.routing.rules[1]).toEqual({
        type: 'field',
        outboundTag: 'proxy',
        domain: [
          'geosite:telegram',
          'domain:telegram.org',
          'domain:t.me',
          'domain:telegra.ph',
          'domain:telegram.me',
          'domain:tdesktop.com',
        ],
      });
      expect(config.routing.rules[2]).toEqual({
        type: 'field',
        outboundTag: 'proxy',
        ip: [
          '91.108.4.0/22',
          '91.108.8.0/21',
          '91.108.16.0/22',
          '91.108.56.0/22',
          '149.154.160.0/20',
        ],
      });
    });

    test('should include ad-blocking rule when blockAds is enabled', async () => {
      const config = await (service as any).generateV2RayConfig(
        {
          id: 'test-server',
          name: 'Test Server',
          protocol: 'vless',
          address: 'example.com',
          port: 443,
          config: {
            id: 'test-uuid',
            encryption: 'none',
          },
        },
        'full',
        [],
        { blockAds: true }
      );

      // Should have 4 routing rules (localhost bypass + Telegram domain + Telegram IP + ad blocking)
      expect(config.routing.rules).toHaveLength(4);
      expect(config.routing.rules[0]).toEqual({
        type: 'field',
        outboundTag: 'direct',
        ip: ['127.0.0.0/8', '::1/128'],
        domain: ['domain:localhost'],
      });
      expect(config.routing.rules[1]).toEqual({
        type: 'field',
        outboundTag: 'proxy',
        domain: [
          'geosite:telegram',
          'domain:telegram.org',
          'domain:t.me',
          'domain:telegra.ph',
          'domain:telegram.me',
          'domain:tdesktop.com',
        ],
      });
      expect(config.routing.rules[2]).toEqual({
        type: 'field',
        outboundTag: 'proxy',
        ip: [
          '91.108.4.0/22',
          '91.108.8.0/21',
          '91.108.16.0/22',
          '91.108.56.0/22',
          '149.154.160.0/20',
        ],
      });
      expect(config.routing.rules[3]).toEqual({
        type: 'field',
        outboundTag: 'block',
        domain: ['geosite:category-ads-all'],
      });
    });

    test('should NOT include private IP bypass rules', async () => {
      const config = await (service as any).generateV2RayConfig(
        {
          id: 'test-server',
          name: 'Test Server',
          protocol: 'vless',
          address: 'example.com',
          port: 443,
          config: {
            id: 'test-uuid',
            encryption: 'none',
          },
        },
        'full',
        [],
        { blockAds: false }
      );

      // Verify no private IP ranges are in routing rules
      const privateIpRanges = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'];
      const allIpRules = config.routing.rules
        .filter((rule: any) => rule.ip)
        .flatMap((rule: any) => rule.ip);

      for (const privateRange of privateIpRanges) {
        expect(allIpRules).not.toContain(privateRange);
      }
    });

    test('should have proxy outbound as first outbound (default)', async () => {
      const config = await (service as any).generateV2RayConfig(
        {
          id: 'test-server',
          name: 'Test Server',
          protocol: 'vless',
          address: 'example.com',
          port: 443,
          config: {
            id: 'test-uuid',
            encryption: 'none',
          },
        },
        'full',
        [],
        { blockAds: false }
      );

      // First outbound should be the proxy
      expect(config.outbounds).toBeDefined();
      expect(config.outbounds.length).toBeGreaterThan(0);
      expect(config.outbounds[0].tag).toBe('proxy');
    });

    test('should disable outbound mux by default for stability', async () => {
      const config = await (service as any).generateV2RayConfig(
        {
          id: 'test-server',
          name: 'Test Server',
          protocol: 'vless',
          address: 'example.com',
          port: 443,
          config: {
            id: 'test-uuid',
            encryption: 'none',
            type: 'tcp',
          },
        },
        'full',
        [],
        { blockAds: false }
      );

      expect(config.outbounds[0].mux).toBeUndefined();
    });

    test('should not force ws Host header when host query param is empty', async () => {
      const config = await (service as any).generateV2RayConfig(
        {
          id: 'test-server',
          name: 'Test Server',
          protocol: 'vless',
          address: 'speed.endless1service.fun',
          port: 2095,
          config: {
            id: 'test-uuid',
            encryption: 'none',
            type: 'ws',
            security: 'none',
            path: '/',
            host: '',
          },
        },
        'full',
        [],
        { blockAds: false }
      );

      expect(config.outbounds[0].streamSettings.wsSettings).toEqual({
        path: '/',
      });
    });

    test('should keep custom ws Host header when host query param is set', async () => {
      const config = await (service as any).generateV2RayConfig(
        {
          id: 'test-server',
          name: 'Test Server',
          protocol: 'vless',
          address: 'speed.endless1service.fun',
          port: 2095,
          config: {
            id: 'test-uuid',
            encryption: 'none',
            type: 'ws',
            security: 'none',
            path: '/',
            host: 'cdn.example.com',
          },
        },
        'full',
        [],
        { blockAds: false }
      );

      expect(config.outbounds[0].streamSettings.wsSettings).toEqual({
        path: '/',
        headers: {
          Host: 'cdn.example.com',
        },
      });
    });

    test('should allow enabling outbound mux explicitly', async () => {
      const config = await (service as any).generateV2RayConfig(
        {
          id: 'test-server',
          name: 'Test Server',
          protocol: 'vless',
          address: 'example.com',
          port: 443,
          config: {
            id: 'test-uuid',
            encryption: 'none',
            type: 'tcp',
          },
        },
        'full',
        [],
        { blockAds: false, enableMux: true }
      );

      expect(config.outbounds[0].mux).toEqual({
        enabled: true,
        concurrency: 8,
      });
    });

    test('should set domainStrategy to IPIfNonMatch', async () => {
      const config = await (service as any).generateV2RayConfig(
        {
          id: 'test-server',
          name: 'Test Server',
          protocol: 'vless',
          address: 'example.com',
          port: 443,
          config: {
            id: 'test-uuid',
            encryption: 'none',
          },
        },
        'full',
        [],
        { blockAds: false }
      );

      expect(config.routing.domainStrategy).toBe('IPIfNonMatch');
    });

    test('should include DNS outbound with tag dns_out', async () => {
      const config = await (service as any).generateV2RayConfig(
        {
          id: 'test-server',
          name: 'Test Server',
          protocol: 'vless',
          address: 'example.com',
          port: 443,
          config: {
            id: 'test-uuid',
            encryption: 'none',
          },
        },
        'full',
        [],
        { blockAds: false }
      );

      const dnsOutbound = config.outbounds.find((ob: any) => ob.tag === 'dns_out');
      expect(dnsOutbound).toBeDefined();
      expect(dnsOutbound.protocol).toBe('dns');
    });

    test('should configure DNS with tag dns_out for proxy routing', async () => {
      const config = await (service as any).generateV2RayConfig(
        {
          id: 'test-server',
          name: 'Test Server',
          protocol: 'vless',
          address: 'example.com',
          port: 443,
          config: {
            id: 'test-uuid',
            encryption: 'none',
          },
        },
        'full',
        [],
        { blockAds: false }
      );

      expect(config.dns.tag).toBe('dns_out');
    });

    test('should not generate invalid process-based routing fields from bypass apps', async () => {
      const config = await (service as any).generateV2RayConfig(
        {
          id: 'test-server',
          name: 'Test Server',
          protocol: 'vless',
          address: 'example.com',
          port: 443,
          config: {
            id: 'test-uuid',
            encryption: 'none',
          },
        },
        'bypass',
        [{ appPath: '/Applications/Telegram.app', appName: 'Telegram.app', shouldBypass: true }],
        { blockAds: false }
      );

      const hasInvalidProcessField = config.routing.rules.some((rule: any) => 'process' in rule);
      expect(hasInvalidProcessField).toBe(false);
    });
  });

  describe('split tunneling launcher behavior', () => {
    const makeAppRoutingMock = () => ({
      ensureAppBypassesProxy: jest.fn().mockResolvedValue(undefined),
      ensureAppUsesProxy: jest.fn().mockResolvedValue(undefined),
      findTelegramAppPath: jest.fn().mockResolvedValue('/Applications/Telegram.app'),
      bootstrapTelegramLocalSocksProxy: jest.fn().mockResolvedValue(undefined),
      isAppRunning: jest.fn().mockReturnValue(true),
      getAppRoutingCapability: jest.fn((appPath: string) => ({
        appPath,
        appName: 'Mock',
        engine: appPath.toLowerCase().includes('safari') ? 'safari' : 'generic',
        canForceProxy: true,
        canForceDirect: true,
        reason: appPath.toLowerCase().includes('safari')
          ? 'Safari follows macOS proxy/PAC settings. Direct mode is best-effort.'
          : 'mock-capable',
      })),
    });

    test('bypass mode relaunches selected apps in direct mode by default', async () => {
      const appRoutingMock = makeAppRoutingMock();
      (service as any).appRoutingService = appRoutingMock;

      await (service as any).applyLauncherSplitTunnel(
        'global',
        [
          { appPath: '/Applications/Firefox.app', appName: 'Firefox.app', policy: 'bypass' },
          { appPath: '/Applications/Brave Browser.app', appName: 'Brave Browser.app', policy: 'bypass' },
        ],
        {}
      );

      expect(appRoutingMock.ensureAppBypassesProxy).toHaveBeenCalledTimes(2);
      expect(appRoutingMock.ensureAppBypassesProxy).toHaveBeenCalledWith('/Applications/Firefox.app', true);
      expect(appRoutingMock.ensureAppBypassesProxy).toHaveBeenCalledWith('/Applications/Brave Browser.app', true);
    });

    test('rule mode relaunches selected apps with proxy', async () => {
      const appRoutingMock = makeAppRoutingMock();
      (service as any).appRoutingService = appRoutingMock;

      await (service as any).applyLauncherSplitTunnel(
        'per-app',
        [{ appPath: '/Applications/Firefox.app', appName: 'Firefox.app', policy: 'vpn' }],
        {}
      );

      expect(appRoutingMock.ensureAppUsesProxy).toHaveBeenCalledWith('/Applications/Firefox.app', true);
    });

    test('telegram is forced to proxy when not bypassed', async () => {
      const appRoutingMock = makeAppRoutingMock();
      (service as any).appRoutingService = appRoutingMock;

      await (service as any).applyLauncherSplitTunnel('global', [], { restartTelegramOnConnect: true });

      expect(appRoutingMock.ensureAppUsesProxy).toHaveBeenCalledWith('/Applications/Telegram.app', true);
      expect(appRoutingMock.bootstrapTelegramLocalSocksProxy).toHaveBeenCalledWith('127.0.0.1', 10808);
    });

    test('telegram is not force-proxied when selected for bypass', async () => {
      const appRoutingMock = makeAppRoutingMock();
      (service as any).appRoutingService = appRoutingMock;

      await (service as any).applyLauncherSplitTunnel(
        'global',
        [{ appPath: '/Applications/Telegram.app', appName: 'Telegram.app', policy: 'bypass' }],
        {}
      );

      expect(appRoutingMock.ensureAppBypassesProxy).toHaveBeenCalledWith('/Applications/Telegram.app', true);
      expect(appRoutingMock.ensureAppUsesProxy).not.toHaveBeenCalledWith('/Applications/Telegram.app', true);
      expect(appRoutingMock.bootstrapTelegramLocalSocksProxy).not.toHaveBeenCalled();
    });

    test('full mode with no bypass keeps regular proxy behavior (no bypass launches)', async () => {
      const appRoutingMock = makeAppRoutingMock();
      (service as any).appRoutingService = appRoutingMock;

      await (service as any).applyLauncherSplitTunnel('global', [], { restartTelegramOnConnect: true });

      expect(appRoutingMock.ensureAppBypassesProxy).not.toHaveBeenCalled();
      // Telegram enforcement is expected in full mode unless explicitly disabled.
      expect(appRoutingMock.ensureAppUsesProxy).toHaveBeenCalledWith('/Applications/Telegram.app', true);
    });

    test('skips protected current app path to avoid self-termination', async () => {
      const appRoutingMock = makeAppRoutingMock();
      (service as any).appRoutingService = appRoutingMock;

      await (service as any).applyLauncherSplitTunnel(
        'global',
        [{ appPath: process.execPath, appName: 'self', policy: 'bypass' }],
        {}
      );

      expect(appRoutingMock.ensureAppBypassesProxy).not.toHaveBeenCalled();
    });
  });

  describe('dns provider configuration', () => {
    test('applies configured DNS provider servers when building config', async () => {
      const config = await (service as any).generateV2RayConfig(
        {
          id: 'test-server',
          name: 'Test Server',
          protocol: 'vless',
          address: 'example.com',
          port: 443,
          config: {
            id: 'test-uuid',
            encryption: 'none',
          },
        },
        'full',
        [],
        { dnsProvider: 'cloudflare', blockAds: false }
      );

      expect(config.dns.servers).toEqual([
        { address: '1.1.1.1', port: 53 },
        { address: '1.0.0.1', port: 53 },
      ]);
    });
  });
});
