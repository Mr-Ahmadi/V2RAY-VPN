import { ChildProcess, spawn, spawnSync } from 'child_process';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { buildShadeConfig } from './config.js';
import { scanGoogleIps } from './googleIpScanner.js';
import { ProbeResult, ShadeConfig, ShadeStartResult, ShadeStatus } from './types.js';
import systemProxyManager from '../systemProxyManager.js';
import debugLogger from '../debugLogger.js';

type PythonRunner = {
  command: string;
  prefixArgs: string[];
};

type ShadeDependencyProbe = {
  python: string;
  executable: string;
  missingRequired: string[];
  missingOptional: string[];
};

export type ShadeRuntimeDiagnostics = {
  ready: boolean;
  pythonCommand?: string;
  pythonVersion?: string;
  pythonExecutable?: string;
  coreEntry?: string;
  caDir?: string;
  caCertFile?: string;
  caKeyFile?: string;
  caCertExists?: boolean;
  caKeyExists?: boolean;
  missingRequired: string[];
  missingOptional: string[];
  issues: string[];
};

export type ShadeRuntimeSetupResult = {
  ok: boolean;
  pythonCommand?: string;
  pythonVersion?: string;
  installed: string[];
  skipped: string[];
  message: string;
};

export class BridgeService {
  private static readonly MAX_PORT_TRIES = 50;
  private static readonly LISTENER_READY_TIMEOUT_MS = 30_000;
  private static readonly PROCESS_STOP_TIMEOUT_MS = 2_000;

  private coreProcess: ChildProcess | null = null;
  private userInitiatedStop = false;
  private config: ShadeConfig | null = null;
  private lastStatus: ShadeStatus = {
    running: false,
    http: null,
    socks5: null,
    applySystemProxy: false,
  };

  async configure(raw: Record<string, unknown>): Promise<ShadeConfig> {
    const config = buildShadeConfig(raw);
    this.config = config;
    return config;
  }

  async start(): Promise<ShadeStartResult> {
    if (!this.config) {
      throw new Error('Shade service is not configured');
    }

    await this.stop();

    const runtime = await this.withAvailablePorts(this.config);
    const coreEntry = this.resolveCoreEntryPath();
    const runner = this.resolvePythonRunner();
    this.verifyRuntimeDependencies(runner);
    const configPath = this.writeCoreConfig(runtime);
    const args = [...runner.prefixArgs, coreEntry, '-c', configPath];

    try {
      this.spawnCoreProcess(runner.command, args);
      await this.waitForCoreListeners(runtime);

      if (runtime.applySystemProxy) {
        await this.applySystemProxy(runtime);
      }

      const http = { host: runtime.httpHost, port: runtime.httpPort };
      const socks5 = runtime.socks5Enabled
        ? { host: runtime.socks5Host, port: runtime.socks5Port }
        : null;

      this.lastStatus = {
        running: true,
        http,
        socks5,
        applySystemProxy: runtime.applySystemProxy,
      };

      return { http, socks5 };
    } catch (error) {
      await this.stop();
      debugLogger.error('BridgeService', 'Failed to start bridge core', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async stop(): Promise<void> {
    debugLogger.info('BridgeService', 'Stopping bridge core');
    await systemProxyManager.disableSystemProxy().catch(() => undefined);

    const proc = this.coreProcess;
    if (proc) {
      this.userInitiatedStop = true;
      try {
        if (!proc.killed) {
          proc.kill('SIGTERM');
        }
      } catch {
        // Ignore and continue to hard-kill path.
      }

      const exitedGracefully = await this.waitForProcessExit(proc, BridgeService.PROCESS_STOP_TIMEOUT_MS);
      if (!exitedGracefully && this.coreProcess === proc) {
        try {
          proc.kill('SIGKILL');
        } catch {
          // Ignore force-kill errors.
        }
        await this.waitForProcessExit(proc, 800).catch(() => undefined);
      }
    }

    this.coreProcess = null;
    this.userInitiatedStop = false;
    this.lastStatus = {
      running: false,
      http: null,
      socks5: null,
      applySystemProxy: this.config?.applySystemProxy === true,
    };
  }

  async scan(frontDomain?: string): Promise<ProbeResult[]> {
    const domain = frontDomain || this.config?.frontDomain || 'www.google.com';
    return scanGoogleIps(domain);
  }

  getRuntimeDiagnostics(): ShadeRuntimeDiagnostics {
    const issues: string[] = [];
    const missingRequired: string[] = [];
    const missingOptional: string[] = [];
    let pythonCommand: string | undefined;
    let pythonVersion: string | undefined;
    let pythonExecutable: string | undefined;
    let coreEntry: string | undefined;
    const { caDir, caCertFile, caKeyFile } = this.resolveCaPaths();
    fs.mkdirSync(caDir, { recursive: true });

    try {
      coreEntry = this.resolveCoreEntryPath();
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }

    try {
      const runner = this.resolvePythonRunner();
      pythonCommand = [runner.command, ...runner.prefixArgs].join(' ').trim();
      const dep = this.readRuntimeDependencyProbe(runner);
      pythonVersion = dep.python;
      pythonExecutable = dep.executable;
      missingRequired.push(...dep.missingRequired);
      missingOptional.push(...dep.missingOptional);
      const [major, minor] = String(dep.python || '0.0.0').split('.').map((v) => Number(v) || 0);
      if (major < 3 || (major === 3 && minor < 10)) {
        issues.push(`Bridge core requires Python 3.10 or newer (found ${dep.python || 'unknown'}).`);
      }
      if (dep.missingRequired.length > 0) {
        issues.push(
          `Missing required Python module(s): ${dep.missingRequired.join(', ')}. Install with: ${this.buildPipInstallCommand(runner, dep.missingRequired)}`,
        );
      }
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }

    const ready = issues.length === 0 && missingRequired.length === 0;
    return {
      ready,
      pythonCommand,
      pythonVersion,
      pythonExecutable,
      coreEntry,
      caDir,
      caCertFile,
      caKeyFile,
      caCertExists: fs.existsSync(caCertFile),
      caKeyExists: fs.existsSync(caKeyFile),
      missingRequired,
      missingOptional,
      issues,
    };
  }

  ensureCaFiles(): { caDir: string; caCertFile: string; caKeyFile: string } {
    const { caDir, caCertFile, caKeyFile } = this.resolveCaPaths();
    fs.mkdirSync(caDir, { recursive: true });

    const runner = this.resolvePythonRunner();
    const coreEntry = this.resolveCoreEntryPath();
    const coreRoot = path.dirname(coreEntry);
    const mitmSrc = path.join(coreRoot, 'src');
    const script = [
      'import os, sys',
      `sys.path.insert(0, ${JSON.stringify(mitmSrc)})`,
      'from mitm import MITMCertManager',
      'MITMCertManager()',
      'print("ok")',
    ].join('\n');
    const probe = spawnSync(runner.command, [...runner.prefixArgs, '-c', script], {
      encoding: 'utf-8',
      timeout: 15000,
      env: {
        ...process.env,
        BRIDGE_CA_DIR: caDir,
        BRIDGE_CA_CERT_FILE: caCertFile,
        BRIDGE_CA_KEY_FILE: caKeyFile,
      },
    });
    if (probe.error || probe.status !== 0) {
      const details = (probe.stderr || probe.stdout || probe.error?.message || 'unknown error').trim();
      throw new Error(`Failed to generate CA files: ${details}`);
    }
    return { caDir, caCertFile, caKeyFile };
  }

  private resolveCaPaths(): { caDir: string; caCertFile: string; caKeyFile: string } {
    const baseDir = process.env.BRIDGE_USER_DATA_PATH || path.join(os.homedir(), '.v2ray-vpn');
    const caDir = process.env.BRIDGE_CA_DIR || path.join(baseDir, 'bridge', 'ca');
    const caCertFile = this.config?.caCertFile || process.env.BRIDGE_CA_CERT_FILE || path.join(caDir, 'ca.crt');
    const caKeyFile = this.config?.caKeyFile || process.env.BRIDGE_CA_KEY_FILE || path.join(caDir, 'ca.key');
    return { caDir, caCertFile, caKeyFile };
  }

  getStatus(): ShadeStatus {
    return { ...this.lastStatus };
  }

  setupRuntimeDependencies(includeOptional = true): ShadeRuntimeSetupResult {
    const runner = this.resolvePythonRunner();
    const probe = this.readRuntimeDependencyProbe(runner);
    const pythonVersion = probe.python || '0.0.0';
    const [major, minor] = pythonVersion.split('.').map((v) => Number(v) || 0);
    if (major < 3 || (major === 3 && minor < 10)) {
      throw new Error(`Bridge core requires Python 3.10 or newer (found ${pythonVersion}).`);
    }

    const modules = Array.from(
      new Set([
        ...probe.missingRequired,
        ...(includeOptional ? probe.missingOptional : []),
      ]),
    );

    if (modules.length === 0) {
      return {
        ok: true,
        pythonCommand: [runner.command, ...runner.prefixArgs].join(' ').trim(),
        pythonVersion,
        installed: [],
        skipped: [],
        message: 'Python runtime is already ready. No missing modules.',
      };
    }

    const install = spawnSync(
      runner.command,
      [...runner.prefixArgs, '-m', 'pip', 'install', '--upgrade', ...modules],
      {
        encoding: 'utf-8',
        timeout: 180000,
      },
    );

    if (install.error || install.status !== 0) {
      const details = (install.stderr || install.stdout || install.error?.message || 'unknown error').trim();
      throw new Error(`Failed to install Python modules (${modules.join(', ')}): ${details}`);
    }

    const verified = this.readRuntimeDependencyProbe(runner);
    const stillMissing = Array.from(
      new Set([
        ...verified.missingRequired,
        ...(includeOptional ? verified.missingOptional : []),
      ]),
    );
    const installed = modules.filter((value) => !stillMissing.includes(value));

    return {
      ok: stillMissing.length === 0,
      pythonCommand: [runner.command, ...runner.prefixArgs].join(' ').trim(),
      pythonVersion: verified.python,
      installed,
      skipped: stillMissing,
      message:
        stillMissing.length === 0
          ? `Installed ${installed.length} module(s): ${installed.join(', ')}`
          : `Installed ${installed.length} module(s), but still missing: ${stillMissing.join(', ')}`,
    };
  }

  getAppsScriptCode(authKey?: string): { code: string; templatePath: string } {
    const templatePath = this.resolveAppsScriptTemplatePath();
    let code = fs.readFileSync(templatePath, 'utf-8');
    const trimmedAuthKey = String(authKey || '').trim();
    if (trimmedAuthKey) {
      code = code.replace(
        /const\s+AUTH_KEY\s*=\s*["'][^"']*["'];/,
        `const AUTH_KEY = ${JSON.stringify(trimmedAuthKey)};`,
      );
    }
    return { code, templatePath };
  }

  private resolveCoreEntryPath(): string {
    const envPath = process.env.BRIDGE_CORE_ENTRY?.trim();
    const rootFromSrcOrDist = path.resolve(__dirname, '../../../..');
    const appRoot = path.resolve(process.cwd());
    const candidates = [
      envPath || '',
      path.join(appRoot, 'bridge-core', 'main.py'),
      path.join(rootFromSrcOrDist, 'bridge-core', 'main.py'),
      path.join(process.resourcesPath || '', 'bridge-core', 'main.py'),
      path.join(process.resourcesPath || '', 'app.asar.unpacked', 'bridge-core', 'main.py'),
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    throw new Error(
      `Bridge core entry not found. Tried: ${candidates.join(', ')}`,
    );
  }

  private resolveAppsScriptTemplatePath(): string {
    const envPath = process.env.BRIDGE_APPS_SCRIPT_TEMPLATE?.trim();
    const rootFromSrcOrDist = path.resolve(__dirname, '../../../..');
    const appRoot = path.resolve(process.cwd());
    const candidates = [
      envPath || '',
      path.join(appRoot, 'bridge-core', 'apps_script', 'Code.gs'),
      path.join(rootFromSrcOrDist, 'bridge-core', 'apps_script', 'Code.gs'),
      path.join(process.resourcesPath || '', 'bridge-core', 'apps_script', 'Code.gs'),
      path.join(process.resourcesPath || '', 'app.asar.unpacked', 'bridge-core', 'apps_script', 'Code.gs'),
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    throw new Error(
      `Bridge Apps Script template not found. Tried: ${candidates.join(', ')}`,
    );
  }

  private resolvePythonRunner(): PythonRunner {
    const envCandidate = process.env.BRIDGE_PYTHON_BIN?.trim();
    const candidates: PythonRunner[] = [];

    if (envCandidate) {
      candidates.push({ command: envCandidate, prefixArgs: [] });
    }
    if (process.env.PYTHON?.trim()) {
      candidates.push({ command: String(process.env.PYTHON).trim(), prefixArgs: [] });
    }

    if (process.platform !== 'win32') {
      const absoluteCandidates = [
        '/opt/anaconda3/bin/python3',
        '/opt/anaconda3/bin/python',
        '/opt/homebrew/bin/python3',
        '/usr/local/bin/python3',
      ];
      for (const absPath of absoluteCandidates) {
        if (fs.existsSync(absPath)) {
          candidates.push({ command: absPath, prefixArgs: [] });
        }
      }
    }

    if (process.platform === 'win32') {
      candidates.push({ command: 'py', prefixArgs: ['-3'] });
      candidates.push({ command: 'python', prefixArgs: [] });
    } else {
      candidates.push({ command: 'python3', prefixArgs: [] });
      candidates.push({ command: 'python', prefixArgs: [] });
    }

    const dedup = new Set<string>();
    const uniqueCandidates = candidates.filter((candidate) => {
      const key = `${candidate.command}::${candidate.prefixArgs.join(' ')}`;
      if (dedup.has(key)) return false;
      dedup.add(key);
      return true;
    });

    let firstRunnable: PythonRunner | null = null;
    for (const candidate of uniqueCandidates) {
      const probe = spawnSync(candidate.command, [...candidate.prefixArgs, '--version'], {
        encoding: 'utf-8',
        timeout: 4000,
      });
      if (probe.error || probe.status !== 0) {
        continue;
      }

      if (!firstRunnable) {
        firstRunnable = candidate;
      }

      try {
        const dep = this.readRuntimeDependencyProbe(candidate);
        const [major, minor] = String(dep.python || '0.0.0').split('.').map((v) => Number(v) || 0);
        if ((major > 3 || (major === 3 && minor >= 10)) && dep.missingRequired.length === 0) {
          return candidate;
        }
      } catch {
        // Try next candidate.
      }
    }

    if (firstRunnable) {
      return firstRunnable;
    }

    const tried = uniqueCandidates.map((value) => `${value.command} ${value.prefixArgs.join(' ')}`.trim()).join(', ');
    throw new Error(`Python runtime not found for Shade core. Tried: ${tried}`);
  }

  private verifyRuntimeDependencies(runner: PythonRunner): ShadeDependencyProbe {
    const result = this.readRuntimeDependencyProbe(runner);
    const pythonVersion = result.python || '0.0.0';
    const [major, minor] = pythonVersion.split('.').map((v) => Number(v) || 0);
    if (major < 3 || (major === 3 && minor < 10)) {
      throw new Error(
        `Bridge core requires Python 3.10 or newer (found ${pythonVersion}).`,
      );
    }

    if (result.missingRequired.length > 0) {
      const installCmd = this.buildPipInstallCommand(runner, result.missingRequired);
      throw new Error(
        `Bridge is missing required Python module(s): ${result.missingRequired.join(', ')}. Install them with: ${installCmd}`,
      );
    }

    if (result.missingOptional.length > 0) {
      debugLogger.warn('BridgeService', 'Optional Bridge Python module(s) missing', {
        missing: result.missingOptional.join(', '),
        note: 'Bridge can run, but performance/features may be reduced.',
      });
    }

    return result;
  }

  private readRuntimeDependencyProbe(runner: PythonRunner): ShadeDependencyProbe {
    const probeScript = `
import importlib.util, json, platform, sys
required = ["cryptography"]
optional = ["h2", "certifi"]
result = {
  "python": platform.python_version(),
  "executable": sys.executable,
  "missingRequired": [m for m in required if importlib.util.find_spec(m) is None],
  "missingOptional": [m for m in optional if importlib.util.find_spec(m) is None],
}
print(json.dumps(result))
`.trim();

    const probe = spawnSync(runner.command, [...runner.prefixArgs, '-c', probeScript], {
      encoding: 'utf-8',
      timeout: 7000,
    });

    if (probe.error || probe.status !== 0) {
      const details = (probe.stderr || probe.stdout || probe.error?.message || 'unknown error').trim();
      throw new Error(
        `Unable to verify Bridge Python dependencies using '${runner.command}'. ${details}`,
      );
    }

    let result: ShadeDependencyProbe | null = null;
    try {
      result = JSON.parse(String(probe.stdout || '').trim()) as ShadeDependencyProbe;
    } catch {
      throw new Error(
        `Dependency check returned unexpected output: ${String(probe.stdout || '').trim() || 'empty output'}`,
      );
    }

    if (!result) {
      throw new Error('Dependency check failed with empty result.');
    }

    return result;
  }

  private buildPipInstallCommand(runner: PythonRunner, modules: string[]): string {
    const moduleList = modules.join(' ');
    if (runner.command === 'py') {
      return `py -3 -m pip install ${moduleList}`;
    }
    return `${runner.command} -m pip install ${moduleList}`;
  }

  private writeCoreConfig(config: ShadeConfig): string {
    const baseDir = process.env.BRIDGE_USER_DATA_PATH || path.join(os.homedir(), '.v2ray-vpn');
    const bridgeDir = path.join(baseDir, 'bridge');
    fs.mkdirSync(bridgeDir, { recursive: true });

    const firstScript = config.scriptConfigs[0];
    const payload = {
      mode: 'apps_script',
      google_ip: config.googleIp,
      front_domain: config.frontDomain,
      front_domains: config.frontDomains,
      script_id: firstScript?.id || '',
      auth_key: firstScript?.key || '',
      script_configs: config.scriptConfigs.map((item) => ({
        id: item.id,
        key: item.key,
        is_cf: item.isCf === true,
      })),
      parallel_relay: Math.max(1, config.scriptConfigs.length),
      listen_host: config.httpHost,
      listen_port: config.httpPort,
      socks5_enabled: config.socks5Enabled,
      socks5_host: config.socks5Host,
      socks5_port: config.socks5Port,
      verify_ssl: config.verifySsl,
      relay_timeout: Math.max(1, Math.floor(config.relayTimeoutMs / 1000)),
      tls_connect_timeout: Math.max(1, Math.floor(config.tlsConnectTimeoutMs / 1000)),
      max_response_body_bytes: config.maxResponseBodyBytes,
      lan_sharing: config.lanSharing,
      log_level: 'INFO',
      youtube_via_relay: false,
      ca_cert_file: config.caCertFile || '',
      ca_key_file: config.caKeyFile || '',
    };

    const configPath = path.join(bridgeDir, 'config.bridge.json');
    fs.writeFileSync(configPath, JSON.stringify(payload, null, 2), 'utf-8');
    return configPath;
  }

  private spawnCoreProcess(command: string, args: string[]): void {
    const baseDir = process.env.BRIDGE_USER_DATA_PATH || path.join(os.homedir(), '.v2ray-vpn');
    const caDir = path.join(baseDir, 'bridge', 'ca');
    fs.mkdirSync(caDir, { recursive: true });

    const envOverrides: Record<string, string> = {};
    envOverrides.BRIDGE_CA_DIR = caDir;
    envOverrides.BRIDGE_CA_CERT_FILE = this.config?.caCertFile || path.join(caDir, 'ca.crt');
    envOverrides.BRIDGE_CA_KEY_FILE = this.config?.caKeyFile || path.join(caDir, 'ca.key');
    const proc = spawn(command, args, {
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        ...envOverrides,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.coreProcess = proc;
    this.userInitiatedStop = false;

    proc.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      debugLogger.info('ShadeCore', text.trim() || '[stdout]');
    });

    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      debugLogger.warn('ShadeCore', text.trim() || '[stderr]');
    });

    proc.once('error', (error: Error) => {
      this.coreProcess = null;
      this.userInitiatedStop = false;
      debugLogger.error('BridgeService', 'Bridge core process error', { error: error.message });
    });

    proc.once('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      const intentional = this.userInitiatedStop;
      this.coreProcess = null;
      this.userInitiatedStop = false;

      const cleanSignal = signal === 'SIGTERM' || signal === 'SIGKILL';
      const cleanExit = code === 0 || cleanSignal;
      if (intentional || cleanExit) {
        debugLogger.info('BridgeService', `Bridge core stopped (code=${String(code)}, signal=${String(signal)})`);
        return;
      }

      debugLogger.error('BridgeService', 'Bridge core exited unexpectedly', {
        code: code ?? -1,
        signal: signal ?? 'none',
      });

      this.lastStatus = {
        running: false,
        http: null,
        socks5: null,
        applySystemProxy: this.config?.applySystemProxy === true,
      };
    });
  }

  private async waitForCoreListeners(config: ShadeConfig): Promise<void> {
    const httpReady = await this.waitForListener(config.httpHost, config.httpPort, BridgeService.LISTENER_READY_TIMEOUT_MS);
    if (!httpReady) {
      throw new Error(`Bridge HTTP listener did not become ready on ${config.httpHost}:${config.httpPort}`);
    }

    if (!config.socks5Enabled) {
      return;
    }

    const socksReady = await this.waitForListener(config.socks5Host, config.socks5Port, BridgeService.LISTENER_READY_TIMEOUT_MS);
    if (!socksReady) {
      throw new Error(`Bridge SOCKS5 listener did not become ready on ${config.socks5Host}:${config.socks5Port}`);
    }
  }

  private async waitForListener(host: string, port: number, timeoutMs: number): Promise<boolean> {
    const probeHost = this.normalizeProbeHost(host);
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      if (!this.coreProcess) {
        return false;
      }

      const connected = await this.tryConnect(probeHost, port);
      if (connected) {
        return true;
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    return false;
  }

  private normalizeProbeHost(host: string): string {
    const normalized = (host || '').trim();
    if (!normalized || normalized === '0.0.0.0' || normalized === '::' || normalized === '::1') {
      return '127.0.0.1';
    }
    return normalized;
  }

  private async tryConnect(host: string, port: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const socket = net.connect({ host, port });
      let done = false;

      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        if (!socket.destroyed) {
          socket.destroy();
        }
        resolve(ok);
      };

      socket.setTimeout(1000);
      socket.once('connect', () => finish(true));
      socket.once('timeout', () => finish(false));
      socket.once('error', () => finish(false));
    });
  }

  private async withAvailablePorts(config: ShadeConfig): Promise<ShadeConfig> {
    const httpPort = await this.findAvailablePort(config.httpHost, config.httpPort, 'HTTP');

    let socksPort = config.socks5Port;
    if (config.socks5Enabled && config.socks5Host === config.httpHost && socksPort === httpPort) {
      socksPort += 1;
    }

    if (config.socks5Enabled) {
      socksPort = await this.findAvailablePort(config.socks5Host, socksPort, 'SOCKS5');
    }

    return {
      ...config,
      httpPort,
      socks5Port: socksPort,
    };
  }

  private async findAvailablePort(host: string, startPort: number, label: 'HTTP' | 'SOCKS5'): Promise<number> {
    let port = startPort;
    let lastError = '';

    for (let attempt = 0; attempt < BridgeService.MAX_PORT_TRIES; attempt += 1) {
      const probe = await this.probePortAvailability(host, port);
      if (probe.available) {
        return port;
      }
      lastError = probe.error || 'unknown error';

      const retriable = probe.code === 'EADDRINUSE' || probe.code === 'EACCES' || probe.code === 'EADDRNOTAVAIL';
      if (!retriable) {
        throw new Error(`${label} port probe failed on ${host}:${port} (${lastError})`);
      }

      port += 1;
    }

    throw new Error(`No available ${label} port found after ${BridgeService.MAX_PORT_TRIES} tries (${host}:${startPort}+): ${lastError}`);
  }

  private async probePortAvailability(host: string, port: number): Promise<{ available: boolean; code?: string; error?: string }> {
    return new Promise((resolve) => {
      const server = net.createServer();

      const finish = (result: { available: boolean; code?: string; error?: string }) => {
        server.removeAllListeners();
        try {
          server.close();
        } catch {
          // ignore close errors for probe server
        }
        resolve(result);
      };

      server.once('error', (error: NodeJS.ErrnoException) => {
        finish({
          available: false,
          code: error.code,
          error: error.message,
        });
      });

      server.once('listening', () => {
        server.close(() => {
          resolve({ available: true });
        });
      });

      server.listen(port, host);
    });
  }

  private async applySystemProxy(config: ShadeConfig): Promise<void> {
    try {
      if (config.socks5Enabled) {
        const host = this.normalizeProbeHost(config.socks5Host);
        await systemProxyManager.enableSocksProxy({
          host,
          port: config.socks5Port,
        });
        return;
      }

      await systemProxyManager.setHttpProxy({
        host: this.normalizeProbeHost(config.httpHost),
        port: config.httpPort,
      });
    } catch (error) {
      debugLogger.warn('BridgeService', 'System proxy setup failed (bridge remains running)', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async waitForProcessExit(proc: ChildProcess, timeoutMs: number): Promise<boolean> {
    if (proc.exitCode !== null || proc.signalCode !== null) {
      return true;
    }

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const done = (value: boolean) => {
        if (settled) return;
        settled = true;
        proc.removeListener('exit', onExit);
        resolve(value);
      };

      const onExit = () => done(true);
      proc.once('exit', onExit);

      setTimeout(() => done(false), timeoutMs);
    });
  }
}

export default BridgeService;
