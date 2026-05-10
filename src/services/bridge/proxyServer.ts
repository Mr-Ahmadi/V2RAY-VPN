import http from 'http';
import net, { AddressInfo } from 'net';
import { RelayClient } from './relayClient.js';
import { ShadeConfig } from './types.js';
import debugLogger from '../debugLogger.js';

const hopHeaders = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

export class ShadeProxyServer {
  private server: http.Server | null = null;
  private readonly relay: RelayClient;

  constructor(private readonly config: ShadeConfig) {
    this.relay = new RelayClient(config);
  }

  async start(): Promise<{ host: string; port: number }> {
    if (this.server) throw new Error('Proxy already running');
    this.server = http.createServer(async (req, res) => {
      try {
        debugLogger.info('ProxyServer', `HTTP ${req.method} ${req.url}`);
        const url = req.url || '';
        const method = req.method || 'GET';
        const headers = Object.fromEntries(
          Object.entries(req.headers)
            .filter(([key]) => !hopHeaders.has(key.toLowerCase()))
            .map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : String(value ?? '')]),
        );
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        const bodyBase64 = Buffer.concat(chunks).toString('base64');
        const result = await this.relay.relay({ method, url, headers, bodyBase64 });
        debugLogger.info('ProxyServer', `HTTP ${method} ${url} -> ${result.status}`);
        res.writeHead(result.status, result.headers);
        res.end(this.relay.decodeBody(result));
      } catch (error) {
        debugLogger.error('ProxyServer', `HTTP ${req.method} ${req.url} failed: ${error instanceof Error ? error.message : String(error)}`);
        const message = error instanceof Error ? error.message : String(error);
        res.writeHead(502, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: message }));
      }
    });
    this.server.on('connect', (req, clientSocket, head) => {
      this.handleConnectDirect(req, clientSocket as net.Socket, head).catch((error) => {
        debugLogger.error('ProxyServer', `CONNECT error: ${error.message}`);
        if (!clientSocket.destroyed) clientSocket.destroy();
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', reject);
      this.server?.listen(this.config.httpPort, this.config.httpHost, () => resolve());
    });

    const address = this.server.address() as AddressInfo;
    debugLogger.info('ProxyServer', `HTTP proxy listening on ${address.address}:${address.port}`);
    return { host: address.address, port: address.port };
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    const server = this.server;
    this.server = null;
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
      new Promise<void>((resolve) => setTimeout(resolve, 2000))
    ]);
  }

  async probeStability(): Promise<void> {
    await this.relay.probeStability();
  }

  private async handleConnectDirect(req: http.IncomingMessage, clientSocket: net.Socket, head: Buffer): Promise<void> {
    const target = req.url || '';
    const [host, portRaw] = target.split(':');
    const port = Number(portRaw || 443);
    
    if (!host || !Number.isFinite(port)) {
      clientSocket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      clientSocket.destroy();
      return;
    }

    debugLogger.info('ProxyServer', `CONNECT request to ${host}:${port} - attempting direct connection`);

    // Try direct connection (will work for non-censored destinations)
    const upstream = net.connect(port, host);
    let connected = false;
    
    const closeAll = () => {
      if (!upstream.destroyed) upstream.destroy();
      if (!clientSocket.destroyed) clientSocket.destroy();
    };

    upstream.setTimeout(5000);
    
    upstream.on('connect', () => {
      connected = true;
      debugLogger.info('ProxyServer', `Direct CONNECT succeeded to ${host}:${port}`);
      upstream.setTimeout(0);
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head && head.length > 0) upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    
    upstream.on('timeout', () => {
      if (!connected) {
        debugLogger.warn('ProxyServer', `Direct CONNECT timeout to ${host}:${port} - destination may be blocked`);
        clientSocket.write('HTTP/1.1 504 Gateway Timeout\r\n\r\n');
        closeAll();
      }
    });
    
    upstream.on('error', (error) => {
      debugLogger.error('ProxyServer', `Direct CONNECT failed to ${host}:${port}: ${error.message}`);
      if (!connected) {
        clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      }
      closeAll();
    });
    
    clientSocket.on('error', closeAll);
  }
}
