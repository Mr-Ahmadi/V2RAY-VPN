import https from 'https';
import zlib from 'zlib';
import { RelayRequest, RelayResponse, ShadeConfig } from './types.js';
import debugLogger from '../debugLogger.js';

const toBuffer = (value?: string): Buffer => (value ? Buffer.from(value, 'base64') : Buffer.alloc(0));
const STABILITY_PROBE_URL = 'https://www.google.com/generate_204';
const MAX_REDIRECTS = 5;
type AppsScriptRelayResponse = {
  s?: number;
  h?: Record<string, string | string[]>;
  b?: string;
  e?: string;
};

export class RelayClient {
  private index = 0;
  private sniIndex = 0;

  constructor(private readonly config: ShadeConfig) {}

  private nextScript() {
    const current = this.config.scriptConfigs[this.index % this.config.scriptConfigs.length];
    this.index = (this.index + 1) % this.config.scriptConfigs.length;
    return current;
  }

  private nextSni(): string {
    const sni = this.config.frontDomains[this.sniIndex % this.config.frontDomains.length];
    this.sniIndex = (this.sniIndex + 1) % this.config.frontDomains.length;
    return sni;
  }

  async relay(request: RelayRequest): Promise<RelayResponse> {
    debugLogger.info('RelayClient', `Relaying ${request.method} ${request.url}`);
    const script = this.nextScript();
    let path = `/macros/s/${script.id}/exec`;
    let hostHeader = 'script.google.com';
    let method: 'POST' | 'GET' = 'POST';
    const contentTypeHeaderKey = Object.keys(request.headers).find((header) => header.toLowerCase() === 'content-type');
    const contentType = contentTypeHeaderKey ? request.headers[contentTypeHeaderKey] : undefined;
    const payload = JSON.stringify({
      k: script.key,
      m: request.method,
      u: request.url,
      h: request.headers,
      b: request.bodyBase64 || '',
      ct: contentType,
      r: true,
    });
    let body: string | null = payload;
    let redirectCount = 0;

    while (redirectCount <= MAX_REDIRECTS) {
      const response = await this.performRelayHttpRequest({
        hostHeader,
        method,
        path,
        body,
      });
      const statusCode = response.statusCode;
      const text = this.decodeResponseText(response.body, response.headers['content-encoding']);
      const location = this.getRedirectLocation(response.headers, text);
      if ((statusCode >= 300 && statusCode < 400) || Boolean(location)) {
        if (!location) {
          throw new Error(`Relay redirect (${statusCode}) without Location header`);
        }
        const resolved = new URL(location, `https://${hostHeader}${path.startsWith('/') ? path : `/${path}`}`);
        hostHeader = resolved.host;
        path = `${resolved.pathname}${resolved.search || ''}`;
        method = 'GET';
        body = null;
        redirectCount += 1;
        continue;
      }

      let raw: AppsScriptRelayResponse;
      try {
        raw = this.parseRelayResponseJson(text);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Invalid relay response (HTTP ${statusCode} from ${hostHeader}${path}): ${message}`,
        );
      }
      if (raw?.e) {
        throw new Error(`Relay error: ${raw.e}`);
      }
      if (typeof raw?.s !== 'number') {
        throw new Error('Relay response missing status code');
      }
      debugLogger.info('RelayClient', `Relay response: ${raw.s} for ${request.url}`);
      const normalizedHeaders = Object.fromEntries(
        Object.entries(raw.h || {}).map(([name, value]) => [
          name,
          Array.isArray(value) ? value.join(', ') : String(value ?? ''),
        ]),
      );
      return {
        status: raw.s,
        headers: normalizedHeaders,
        bodyBase64: String(raw.b || ''),
      };
    }

    throw new Error(`Too many relay redirects (>${MAX_REDIRECTS})`);
  }

  private performRelayHttpRequest(options: {
    hostHeader: string;
    method: 'POST' | 'GET';
    path: string;
    body: string | null;
  }): Promise<{ statusCode: number; headers: Record<string, string | string[] | undefined>; body: Buffer }> {
    return new Promise((resolve, reject) => {
      const headers: Record<string, string | number> = {
        host: options.hostHeader,
        accept: '*/*',
        'accept-encoding': 'identity',
        connection: 'close',
        'user-agent': 'ShadeBridge/1.0',
      };
      if (options.method === 'POST') {
        headers['content-type'] = 'application/json';
      }
      if (options.body !== null) {
        headers['content-length'] = Buffer.byteLength(options.body);
      }
      const req = https.request(
        {
          host: this.config.googleIp,
          port: 443,
          path: options.path,
          method: options.method,
          headers,
          timeout: this.config.relayTimeoutMs,
          rejectUnauthorized: this.config.verifySsl,
          // Domain fronting: connect to Google IP, SNI shows front domain, Host header is script.google.com/script.googleusercontent.com
          servername: this.nextSni(),
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          res.on('end', () => {
            resolve({
              statusCode: Number(res.statusCode || 0),
              headers: res.headers,
              body: Buffer.concat(chunks),
            });
          });
        },
      );
      req.on('timeout', () => req.destroy(new Error('Relay timeout')));
      req.on('error', reject);
      if (options.body !== null) {
        req.write(options.body);
      }
      req.end();
    });
  }

  private decodeResponseText(
    body: Buffer,
    contentEncoding: string | string[] | undefined,
  ): string {
    const encodingRaw = Array.isArray(contentEncoding) ? contentEncoding[0] : contentEncoding;
    const encoding = String(encodingRaw || '').toLowerCase().trim();
    try {
      if (encoding.includes('gzip')) {
        return zlib.gunzipSync(body).toString('utf-8');
      }
      if (encoding.includes('deflate')) {
        return zlib.inflateSync(body).toString('utf-8');
      }
      if (encoding.includes('br')) {
        return zlib.brotliDecompressSync(body).toString('utf-8');
      }
    } catch {
      // If decode fails, use raw payload text below.
    }
    return body.toString('utf-8');
  }

  private getRedirectLocation(
    headers: Record<string, string | string[] | undefined>,
    bodyText: string,
  ): string | null {
    const locationRaw = headers.location;
    const locationFromHeader = Array.isArray(locationRaw) ? locationRaw[0] : locationRaw;
    if (locationFromHeader && String(locationFromHeader).trim()) {
      return String(locationFromHeader).trim();
    }

    const html = bodyText.trim();
    if (!html) return null;
    if (!/^<html/i.test(html) && !/<title>\s*moved temporarily\s*<\/title>/i.test(html)) {
      return null;
    }

    const hrefMatch = html.match(/<a[^>]+href=["']([^"']+)["']/i);
    if (!hrefMatch?.[1]) return null;
    return hrefMatch[1].replace(/&amp;/g, '&').trim();
  }

  private parseRelayResponseJson(text: string): AppsScriptRelayResponse {
    const body = text.trim();
    if (!body) {
      throw new Error('Relay returned empty body');
    }

    try {
      return JSON.parse(body) as AppsScriptRelayResponse;
    } catch {
      const match = body.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]) as AppsScriptRelayResponse;
        } catch {
          // Fall through to descriptive error below.
        }
      }
      const snippet = body.slice(0, 180).replace(/\s+/g, ' ');
      throw new Error(`Invalid relay response body (non-JSON): ${snippet}`);
    }
  }

  async probeStability(options: { attempts?: number; intervalMs?: number } = {}): Promise<void> {
    const attempts = Math.max(1, Number(options.attempts || 3));
    const intervalMs = Math.max(100, Number(options.intervalMs || 200));
    let stableHits = 0;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await this.relay({
          method: 'GET',
          url: STABILITY_PROBE_URL,
          headers: {
            host: 'www.google.com',
            'user-agent': 'ShadeBridge/1.0',
            accept: '*/*',
            connection: 'close',
          },
        });
        const successful = response.status >= 200 && response.status < 400;
        if (!successful) {
          throw new Error(`Probe returned HTTP ${response.status}`);
        }
        stableHits += 1;
        if (stableHits >= attempts) {
          return;
        }
      } catch (error) {
        stableHits = 0;
        lastError = error instanceof Error ? error : new Error(String(error));
      }

      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }

    throw lastError || new Error('Bridge stability probe failed');
  }

  decodeBody(response: RelayResponse): Buffer {
    return toBuffer(response.bodyBase64);
  }
}
