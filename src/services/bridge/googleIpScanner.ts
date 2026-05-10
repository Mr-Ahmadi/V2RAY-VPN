import tls from 'tls';
import { BRIDGE_GOOGLE_CANDIDATE_IPS } from './constants.js';
import { ProbeResult } from './types.js';

const probeIp = (ip: string, sni: string, timeoutMs: number): Promise<ProbeResult> =>
  new Promise((resolve) => {
    const start = Date.now();
    const socket = tls.connect({
      host: ip,
      port: 443,
      servername: sni,
      rejectUnauthorized: false,
    });

    const onDone = (result: ProbeResult) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs, () => onDone({ ip, error: 'timeout' }));
    socket.once('secureConnect', () => onDone({ ip, latencyMs: Date.now() - start }));
    socket.once('error', (error: Error) => onDone({ ip, error: error.message }));
  });

export const scanGoogleIps = async (
  frontDomain: string,
  timeoutMs = 4000,
): Promise<ProbeResult[]> => {
  const results = await Promise.all(
    BRIDGE_GOOGLE_CANDIDATE_IPS.map((ip) => probeIp(ip, frontDomain, timeoutMs)),
  );
  return results.sort((a, b) => {
    if (a.latencyMs == null && b.latencyMs == null) return 0;
    if (a.latencyMs == null) return 1;
    if (b.latencyMs == null) return -1;
    return a.latencyMs - b.latencyMs;
  });
};
