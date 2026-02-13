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
    disableSystemProxy: jest.fn(),
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
    test('should only include localhost bypass rule by default', () => {
      // Access the private method via type assertion for testing
      const config = (service as any).generateV2RayConfig(
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

      // Should have exactly 1 routing rule (localhost bypass)
      expect(config.routing.rules).toHaveLength(1);
      expect(config.routing.rules[0]).toEqual({
        type: 'field',
        outboundTag: 'direct',
        ip: ['127.0.0.0/8'],
      });
    });

    test('should include ad-blocking rule when blockAds is enabled', () => {
      const config = (service as any).generateV2RayConfig(
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

      // Should have 2 routing rules (localhost bypass + ad blocking)
      expect(config.routing.rules).toHaveLength(2);
      expect(config.routing.rules[0]).toEqual({
        type: 'field',
        outboundTag: 'direct',
        ip: ['127.0.0.0/8'],
      });
      expect(config.routing.rules[1]).toEqual({
        type: 'field',
        outboundTag: 'block',
        domain: ['geosite:category-ads-all'],
      });
    });

    test('should NOT include private IP bypass rules', () => {
      const config = (service as any).generateV2RayConfig(
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

    test('should have proxy outbound as first outbound (default)', () => {
      const config = (service as any).generateV2RayConfig(
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

    test('should set domainStrategy to IPIfNonMatch', () => {
      const config = (service as any).generateV2RayConfig(
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

    test('should include DNS outbound with tag dns_out', () => {
      const config = (service as any).generateV2RayConfig(
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

    test('should configure DNS with tag dns_out for proxy routing', () => {
      const config = (service as any).generateV2RayConfig(
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
  });
});
