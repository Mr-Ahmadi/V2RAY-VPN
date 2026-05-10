export interface ScriptConfig {
  id: string;
  key: string;
  isCf?: boolean;
}

export interface ShadeConfig {
  httpHost: string;
  httpPort: number;
  socks5Enabled: boolean;
  socks5Host: string;
  socks5Port: number;
  frontDomain: string;
  frontDomains: string[];
  googleIp: string;
  scriptConfigs: ScriptConfig[];
  relayTimeoutMs: number;
  tlsConnectTimeoutMs: number;
  maxRequestBodyBytes: number;
  maxResponseBodyBytes: number;
  verifySsl: boolean;
  lanSharing: boolean;
  applySystemProxy: boolean;
  caCertFile?: string;
  caKeyFile?: string;
}

export interface RelayRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  bodyBase64?: string;
}

export interface RelayResponse {
  status: number;
  headers: Record<string, string>;
  bodyBase64: string;
}

export interface ProbeResult {
  ip: string;
  latencyMs?: number;
  error?: string;
}

export interface ShadeStartResult {
  http: { host: string; port: number };
  socks5?: { host: string; port: number } | null;
}

export interface ShadeStatus {
  running: boolean;
  http: { host: string; port: number } | null;
  socks5: { host: string; port: number } | null;
  applySystemProxy: boolean;
}
