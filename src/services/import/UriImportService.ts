import { ServerManager, Server } from '../serverManager.js';

export interface ParsedServerInput {
  protocol: Server['protocol'];
  name: string;
  address: string;
  port: number;
  remarks?: string;
  config: Record<string, any>;
}

export interface ImportUrisResult {
  imported: Server[];
  skipped: Array<{ uri: string; reason: string }>;
  errors: Array<{ uri: string; error: string }>;
}

export interface PreviewUriItem {
  uri: string;
  parsed?: ParsedServerInput;
  error?: string;
}

export class UriImportService {
  constructor(private readonly serverManager: ServerManager) {}

  splitUriInput(input: string): string[] {
    const normalized = String(input || '').replace(/\r/g, '\n');
    const matches = normalized.match(/(?:vless|vmess|trojan|ss):\/\/\S+/gi) || [];
    return matches.map((value) => value.trim()).filter(Boolean);
  }

  parseUri(uri: string): ParsedServerInput {
    const trimmed = String(uri || '').trim();
    if (!trimmed) {
      throw new Error('URI is empty');
    }

    if (trimmed.startsWith('vless://')) {
      return this.parseVlessUri(trimmed);
    }
    if (trimmed.startsWith('vmess://')) {
      return this.parseVmessUri(trimmed);
    }
    if (trimmed.startsWith('trojan://')) {
      return this.parseTrojanUri(trimmed);
    }
    if (trimmed.startsWith('ss://')) {
      return this.parseShadowsocksUri(trimmed);
    }

    throw new Error('Unsupported URI protocol');
  }

  async importUris(input: string, options?: { subscriptionId?: string }): Promise<ImportUrisResult> {
    const uris = this.splitUriInput(input);
    if (uris.length === 0) {
      return {
        imported: [],
        skipped: [],
        errors: [{ uri: '', error: 'No valid URIs found in input' }],
      };
    }

    const existingServers = await this.serverManager.listServers();
    const existingKeys = new Set(existingServers.map((server) => this.makeServerKey(server)));

    const imported: Server[] = [];
    const skipped: Array<{ uri: string; reason: string }> = [];
    const errors: Array<{ uri: string; error: string }> = [];

    for (const uri of uris) {
      try {
        const parsed = this.parseUri(uri);
        const candidateKey = this.makeParsedKey(parsed);

        if (existingKeys.has(candidateKey)) {
          skipped.push({ uri, reason: 'Duplicate server' });
          continue;
        }

        const created = await this.serverManager.addServer({
          name: parsed.name,
          protocol: parsed.protocol,
          address: parsed.address,
          port: parsed.port,
          config: parsed.config,
          remarks: parsed.remarks,
          subscriptionId: options?.subscriptionId,
        });

        imported.push(created);
        existingKeys.add(candidateKey);
      } catch (error) {
        errors.push({
          uri,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { imported, skipped, errors };
  }

  previewUris(input: string): PreviewUriItem[] {
    const uris = this.splitUriInput(input);
    return uris.map((uri) => {
      try {
        const parsed = this.parseUri(uri);
        return { uri, parsed };
      } catch (error) {
        return {
          uri,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
  }

  private parseVlessUri(uri: string): ParsedServerInput {
    const url = new URL(uri);
    const fragment = url.hash ? decodeURIComponent(url.hash.slice(1)) : '';

    const address = url.hostname;
    const port = Number(url.port || 443);
    const id = url.username;

    if (!id) {
      throw new Error('VLESS URI is missing UUID');
    }
    if (!address || !Number.isFinite(port)) {
      throw new Error('Invalid VLESS host or port');
    }

    const security = url.searchParams.get('security') || 'none';

    const config: Record<string, any> = {
      id,
      encryption: url.searchParams.get('encryption') || 'none',
      type: url.searchParams.get('type') || 'tcp',
      security,
      path: url.searchParams.get('path') || '',
      host: url.searchParams.get('host') || '',
      sni: url.searchParams.get('sni') || '',
      allowInsecure: url.searchParams.get('allowInsecure') || url.searchParams.get('insecure') || '0',
      insecure: url.searchParams.get('insecure') || '0',
      flow: url.searchParams.get('flow') || '',
      headerType: url.searchParams.get('headerType') || '',
      fp: url.searchParams.get('fp') || '',
      serviceName: url.searchParams.get('serviceName') || '',
      alpn: url.searchParams.get('alpn') || '',
    };

    const publicKey = url.searchParams.get('pbk') || url.searchParams.get('publicKey');
    const shortId = url.searchParams.get('sid') || url.searchParams.get('shortId');
    if (security === 'reality') {
      config.publicKey = publicKey || '';
      config.shortId = shortId || '';
    }

    const name = fragment || url.searchParams.get('remarks') || `${address}:${port}`;

    return {
      protocol: 'vless',
      name,
      address,
      port,
      remarks: fragment || name,
      config,
    };
  }

  private parseVmessUri(uri: string): ParsedServerInput {
    const encoded = uri.replace('vmess://', '').trim();
    let decoded = '';

    try {
      decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    } catch {
      // Try URL-safe variant.
      const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
      decoded = Buffer.from(normalized, 'base64').toString('utf-8');
    }

    const configJson = JSON.parse(decoded);
    const address = configJson.add || configJson.address;
    const port = Number(configJson.port || 443);
    const id = configJson.id;

    if (!address || !id || !Number.isFinite(port)) {
      throw new Error('Invalid VMess URI payload');
    }

    return {
      protocol: 'vmess',
      name: configJson.ps || configJson.name || `${address}:${port}`,
      address,
      port,
      remarks: configJson.ps || '',
      config: {
        id,
        alterId: Number(configJson.aid ?? configJson.alterId ?? 0),
        security: configJson.scy || configJson.security || 'auto',
        type: configJson.net || 'tcp',
        path: configJson.path || '',
        host: configJson.host || '',
        sni: configJson.sni || '',
        tls: configJson.tls === 'tls' ? 'tls' : 'none',
        allowInsecure: configJson.allowInsecure === true || configJson.allowInsecure === 'true',
      },
    };
  }

  private parseTrojanUri(uri: string): ParsedServerInput {
    const url = new URL(uri);
    const password = decodeURIComponent(url.username || '');
    const address = url.hostname;
    const port = Number(url.port || 443);
    const remarks = url.hash ? decodeURIComponent(url.hash.slice(1)) : '';

    if (!password) {
      throw new Error('Trojan URI is missing password');
    }
    if (!address || !Number.isFinite(port)) {
      throw new Error('Invalid Trojan host or port');
    }

    const sni = url.searchParams.get('sni') || url.searchParams.get('peer') || address;

    return {
      protocol: 'trojan',
      name: remarks || `${address}:${port}`,
      address,
      port,
      remarks: remarks || '',
      config: {
        password,
        sni,
        allowInsecure: url.searchParams.get('allowInsecure') === '1' || url.searchParams.get('allowInsecure') === 'true',
      },
    };
  }

  private parseShadowsocksUri(uri: string): ParsedServerInput {
    const [schemeContent, fragment] = uri.split('#');
    const remarks = fragment ? decodeURIComponent(fragment) : '';
    const raw = schemeContent.replace('ss://', '');

    const atIndex = raw.lastIndexOf('@');
    if (atIndex === -1) {
      throw new Error('Invalid Shadowsocks URI format');
    }

    const credentialsPart = raw.slice(0, atIndex);
    const hostPart = raw.slice(atIndex + 1);

    let credentials = credentialsPart;
    if (!credentials.includes(':')) {
      credentials = Buffer.from(credentialsPart, 'base64').toString('utf-8');
    }

    const [method, password] = credentials.split(':');
    const [address, portValue] = hostPart.split(':');
    const port = Number(portValue);

    if (!method || !password || !address || !Number.isFinite(port)) {
      throw new Error('Invalid Shadowsocks URI payload');
    }

    return {
      protocol: 'shadowsocks',
      name: remarks || `${address}:${port}`,
      address,
      port,
      remarks: remarks || '',
      config: {
        method,
        password,
      },
    };
  }

  private makeServerKey(server: Pick<Server, 'protocol' | 'address' | 'port' | 'config'>): string {
    const principal = server.protocol === 'trojan' || server.protocol === 'shadowsocks'
      ? String(server.config?.password || '')
      : String(server.config?.id || '');

    return `${server.protocol}|${String(server.address).toLowerCase()}|${Number(server.port)}|${principal}`;
  }

  private makeParsedKey(server: ParsedServerInput): string {
    return this.makeServerKey({
      protocol: server.protocol,
      address: server.address,
      port: server.port,
      config: server.config,
    });
  }
}
