import { ServerManager, Server } from './serverManager.js';

export class ConfigImportExport {
  private serverManager: ServerManager;

  constructor() {
    this.serverManager = new ServerManager();
  }

  /**
   * Parse server configuration from various formats
   */
  async parseServerConfig(configString: string): Promise<Server | null> {
    // Try JSON format
    try {
      const config = JSON.parse(configString);
      if (this.isValidServerConfig(config)) {
        return config;
      }
    } catch {
      // Not JSON
    }

    // Try V2RayNG/V2Box format (base64 encoded)
    try {
      const decoded = Buffer.from(configString, 'base64').toString('utf-8');
      const config = JSON.parse(decoded);
      if (this.isValidServerConfig(config)) {
        return config;
      }
    } catch {
      // Not base64
    }

    // Try direct URL parsing (vmess://, vless://, trojan://, ss://)
    return this.parseShareUrl(configString);
  }

  /**
   * Parse share URLs (vmess://, vless://, etc.)
   */
  parseShareUrl(url: string): Server | null {
    try {
      if (url.startsWith('vmess://')) {
        return this.parseVmessUrl(url);
      } else if (url.startsWith('vless://')) {
        return this.parseVlessUrl(url);
      } else if (url.startsWith('trojan://')) {
        return this.parseTrojanUrl(url);
      } else if (url.startsWith('ss://')) {
        return this.parseShadowsocksUrl(url);
      }
    } catch (error) {
      console.error('Error parsing share URL:', error);
    }
    return null;
  }

  private parseVmessUrl(url: string): Server {
    const base64 = url.replace('vmess://', '');
    const decoded = JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'));

    return {
      id: decoded.id || this.generateId(),
      name: decoded.ps || 'Vmess Server',
      protocol: 'vmess',
      address: decoded.add,
      port: parseInt(decoded.port || '443'),
      config: {
        id: decoded.id,
        alterId: decoded.aid || 0,
        security: decoded.scy || 'auto',
      },
      remarks: decoded.ps,
    };
  }

  private parseVlessUrl(url: string): Server {
    const urlObj = new URL(url);
    const uuid = urlObj.username;
    const address = urlObj.hostname;
    const port = parseInt(urlObj.port) || 443;
    const name = urlObj.searchParams.get('remarks') || 
                 Buffer.from(urlObj.hash.slice(1), 'base64').toString('utf-8').split('?')[0] ||
                 'VLESS Server';

    return {
      id: this.generateId(),
      name,
      protocol: 'vless',
      address,
      port,
      config: {
        id: uuid,
        encryption: urlObj.searchParams.get('encryption') || 'none',
      },
      remarks: name,
    };
  }

  private parseTrojanUrl(url: string): Server {
    const urlObj = new URL(url);
    const password = urlObj.username;
    const address = urlObj.hostname;
    const port = parseInt(urlObj.port) || 443;
    const name = Buffer.from(urlObj.hash.slice(1), 'base64').toString('utf-8') || 'Trojan Server';

    return {
      id: this.generateId(),
      name,
      protocol: 'trojan',
      address,
      port,
      config: {
        password,
      },
      remarks: name,
    };
  }

  private parseShadowsocksUrl(url: string): Server {
    const urlObj = new URL(url);
    const [method, password] = Buffer.from(urlObj.username, 'base64').toString('utf-8').split(':');
    const address = urlObj.hostname;
    const port = parseInt(urlObj.port) || 443;
    const name = Buffer.from(urlObj.hash.slice(1), 'base64').toString('utf-8') || 'Shadowsocks Server';

    return {
      id: this.generateId(),
      name,
      protocol: 'shadowsocks',
      address,
      port,
      config: {
        method,
        password,
      },
      remarks: name,
    };
  }

  /**
   * Export server to share URL format
   */
  exportToShareUrl(server: Server): string {
    switch (server.protocol) {
      case 'vmess':
        return this.exportVmessUrl(server);
      case 'vless':
        return this.exportVlessUrl(server);
      case 'trojan':
        return this.exportTrojanUrl(server);
      case 'shadowsocks':
        return this.exportShadowsocksUrl(server);
      default:
        throw new Error(`Unsupported protocol: ${server.protocol}`);
    }
  }

  private exportVmessUrl(server: Server): string {
    const config = {
      v: '2',
      ps: server.name,
      add: server.address,
      port: server.port,
      id: server.config.id,
      aid: server.config.alterId || 0,
      scy: server.config.security || 'auto',
      net: 'tcp',
      type: 'none',
    };

    const base64 = Buffer.from(JSON.stringify(config)).toString('base64');
    return `vmess://${base64}`;
  }

  private exportVlessUrl(server: Server): string {
    const params = new URLSearchParams();
    params.append('encryption', server.config.encryption || 'none');

    const encoded = Buffer.from(server.name).toString('base64');
    return `vless://${server.config.id}@${server.address}:${server.port}?${params.toString()}#${encoded}`;
  }

  private exportTrojanUrl(server: Server): string {
    const encoded = Buffer.from(server.name).toString('base64');
    return `trojan://${server.config.password}@${server.address}:${server.port}#${encoded}`;
  }

  private exportShadowsocksUrl(server: Server): string {
    const userinfo = Buffer.from(`${server.config.method}:${server.config.password}`).toString('base64');
    const encoded = Buffer.from(server.name).toString('base64');
    return `ss://${userinfo}@${server.address}:${server.port}#${encoded}`;
  }

  /**
   * Export servers to JSON
   */
  exportToJson(servers: Server[]): string {
    return JSON.stringify(servers, null, 2);
  }

  /**
   * Import servers from JSON
   */
  async importFromJson(jsonString: string): Promise<Server[]> {
    const servers: Server[] = JSON.parse(jsonString);
    const imported: Server[] = [];

    for (const server of servers) {
      if (this.isValidServerConfig(server)) {
        const added = await this.serverManager.addServer(server);
        imported.push(added);
      }
    }

    return imported;
  }

  private isValidServerConfig(config: any): boolean {
    return (
      config.name &&
      config.protocol &&
      ['vless', 'vmess', 'trojan', 'shadowsocks'].includes(config.protocol) &&
      config.address &&
      config.port &&
      config.config
    );
  }

  private generateId(): string {
    return require('uuid').v4();
  }
}
