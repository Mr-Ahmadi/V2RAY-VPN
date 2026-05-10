export const BRIDGE_DEFAULTS = {
  listenHost: '127.0.0.1',
  listenPort: 8080,
  socks5Enabled: true,
  socks5Host: '127.0.0.1',
  socks5Port: 1080,
  frontDomain: 'www.google.com',
  googleIp: '216.239.38.120',
  relayTimeoutMs: 12_000,
  tlsConnectTimeoutMs: 8_000,
  maxRequestBodyBytes: 100 * 1024 * 1024,
  maxResponseBodyBytes: 200 * 1024 * 1024,
  verifySsl: true,
  lanSharing: false,
} as const;

export const BRIDGE_GOOGLE_CANDIDATE_IPS = [
  '216.239.32.120',
  '216.239.34.120',
  '216.239.36.120',
  '216.239.38.120',
  '142.250.80.142',
  '142.250.80.138',
  '172.217.1.206',
  '172.217.14.206',
  '34.107.221.82',
  '142.251.32.110',
] as const;
