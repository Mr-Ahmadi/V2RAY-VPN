import { BRIDGE_DEFAULTS } from './constants.js';
import { ShadeConfig, ScriptConfig } from './types.js';

const normalizeScriptConfigs = (value: unknown): ScriptConfig[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): ScriptConfig | null => {
      if (!item || typeof item !== 'object') return null;
      const raw = item as Partial<ScriptConfig>;
      const id = String(raw.id || '').trim();
      const key = String(raw.key || '').trim();
      if (!id || !key) return null;
      return { id, key, isCf: Boolean(raw.isCf) };
    })
    .filter((item): item is ScriptConfig => item !== null);
};

export const buildShadeConfig = (input: Record<string, unknown>): ShadeConfig => {
  const scriptConfigs = normalizeScriptConfigs(input.scriptConfigs);
  if (!scriptConfigs.length) {
    throw new Error('At least one script config is required');
  }
  const httpHost = String(input.httpHost || input.listenHost || BRIDGE_DEFAULTS.listenHost);
  const httpPort = Number(input.httpPort || input.listenPort || BRIDGE_DEFAULTS.listenPort);
  const socks5Enabled = input.socks5Enabled !== false;
  const socks5Host = String(input.socks5Host || httpHost || BRIDGE_DEFAULTS.socks5Host);
  const socks5Port = Number(input.socks5Port || BRIDGE_DEFAULTS.socks5Port);
  const frontDomain = String(input.frontDomain || BRIDGE_DEFAULTS.frontDomain);
  const frontDomains = Array.isArray(input.frontDomains)
    ? input.frontDomains.map(String).map((value) => value.trim()).filter(Boolean)
    : [frontDomain];
  return {
    httpHost,
    httpPort,
    socks5Enabled,
    socks5Host,
    socks5Port,
    frontDomain,
    frontDomains,
    googleIp: String(input.googleIp || BRIDGE_DEFAULTS.googleIp),
    scriptConfigs,
    relayTimeoutMs: Number(input.relayTimeoutMs || BRIDGE_DEFAULTS.relayTimeoutMs),
    tlsConnectTimeoutMs: Number(input.tlsConnectTimeoutMs || BRIDGE_DEFAULTS.tlsConnectTimeoutMs),
    maxRequestBodyBytes: Number(input.maxRequestBodyBytes || BRIDGE_DEFAULTS.maxRequestBodyBytes),
    maxResponseBodyBytes: Number(input.maxResponseBodyBytes || BRIDGE_DEFAULTS.maxResponseBodyBytes),
    verifySsl: input.verifySsl !== false,
    lanSharing: input.lanSharing === true,
    applySystemProxy: input.applySystemProxy !== false,
    caCertFile: String(input.caCertFile || '').trim() || undefined,
    caKeyFile: String(input.caKeyFile || '').trim() || undefined,
  };
};
