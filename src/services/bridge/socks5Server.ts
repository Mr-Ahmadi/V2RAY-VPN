import net, { AddressInfo } from 'net';
import debugLogger from '../debugLogger.js';

const ATYP_IPV4 = 0x01;
const ATYP_DOMAIN = 0x03;
const ATYP_IPV6 = 0x04;

const parseTarget = (buffer: Buffer): { host: string; port: number; consumed: number } => {
  const atyp = buffer[0];
  if (atyp === ATYP_IPV4) {
    const host = `${buffer[1]}.${buffer[2]}.${buffer[3]}.${buffer[4]}`;
    const port = buffer.readUInt16BE(5);
    return { host, port, consumed: 7 };
  }
  if (atyp === ATYP_DOMAIN) {
    const len = buffer[1];
    const host = buffer.subarray(2, 2 + len).toString('utf-8');
    const port = buffer.readUInt16BE(2 + len);
    return { host, port, consumed: 2 + len + 2 };
  }
  if (atyp === ATYP_IPV6) {
    const hostParts: string[] = [];
    for (let index = 1; index < 17; index += 2) {
      hostParts.push(buffer.readUInt16BE(index).toString(16));
    }
    const host = hostParts.join(':');
    const port = buffer.readUInt16BE(17);
    return { host, port, consumed: 19 };
  }
  throw new Error('Unsupported SOCKS address type');
};

export class Socks5Server {
  private server: net.Server | null = null;

  async start(host: string, port: number): Promise<{ host: string; port: number }> {
    if (this.server) throw new Error('SOCKS5 server already running');

    this.server = net.createServer((client) => {
      let stage: 'method' | 'request' | 'stream' = 'method';
      let upstream: net.Socket | null = null;
      let cache = Buffer.alloc(0);

      const closeAll = () => {
        if (upstream && !upstream.destroyed) upstream.destroy();
        if (!client.destroyed) client.destroy();
      };

      client.on('data', (chunk) => {
        try {
          if (stage === 'stream') {
            if (upstream) upstream.write(chunk);
            return;
          }

          cache = Buffer.concat([cache, chunk]);

          if (stage === 'method') {
            if (cache.length < 2) return;
            const version = cache[0];
            const methodsCount = cache[1];
            if (cache.length < 2 + methodsCount) return;
            if (version !== 0x05) throw new Error('Only SOCKS5 supported');
            client.write(Buffer.from([0x05, 0x00]));
            cache = cache.subarray(2 + methodsCount);
            stage = 'request';
          }

          if (stage === 'request') {
            if (cache.length < 4) return;
            const version = cache[0];
            const command = cache[1];
            const atyp = cache[3];
            if (version !== 0x05 || command !== 0x01) throw new Error('Only CONNECT is supported');
            if (atyp === ATYP_DOMAIN && cache.length < 5) return;
            if (atyp === ATYP_IPV4 && cache.length < 10) return;
            if (atyp === ATYP_IPV6 && cache.length < 22) return;

            const target = parseTarget(cache.subarray(3));
            cache = cache.subarray(3 + target.consumed);

            upstream = net.connect(target.port, target.host, () => {
              if (upstream) {
                debugLogger.info('Socks5Server', `Direct connection to ${target.host}:${target.port}`);
                upstream.setTimeout(0);
                upstream.setNoDelay(true);
                client.setNoDelay(true);
              }
              client.write(Buffer.from([0x05, 0x00, 0x00, ATYP_IPV4, 0, 0, 0, 0, 0, 0]));
              stage = 'stream';
              if (cache.length && upstream) {
                upstream.write(cache);
                cache = Buffer.alloc(0);
              }
            });
            
            upstream.setTimeout(10000);
            upstream.on('timeout', closeAll);

            upstream.on('data', (data) => {
              if (!client.destroyed) client.write(data);
            });
            upstream.on('close', closeAll);
            upstream.on('error', () => closeAll());
          }
        } catch {
          closeAll();
        }
      });

      client.on('close', closeAll);
      client.on('error', closeAll);
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', reject);
      this.server?.listen(port, host, () => resolve());
    });

    const address = this.server.address() as AddressInfo;
    debugLogger.info('Socks5Server', `SOCKS5 proxy listening on ${address.address}:${address.port}`);
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
}
