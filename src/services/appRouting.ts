import { queryAsync, runAsync } from '../db/database.js';
import { execSync } from 'child_process';
import path from 'path';
import os from 'os';

export interface InstalledApp {
  name: string;
  path: string;
  icon?: string;
}

export interface BypassApp {
  appPath: string;
  appName: string;
  shouldBypass: boolean;
}

export type AppRoutePolicy = 'none' | 'bypass' | 'vpn';

export interface AppRoutingRule {
  appPath: string;
  appName: string;
  policy: AppRoutePolicy;
}

export class AppRoutingService {
  private static readonly TELEGRAM_APP_NAMES = ['Telegram.app', 'Telegram Desktop.app', 'Telegram'];
  private static readonly PROXY_ENV_KEYS = [
    'http_proxy',
    'https_proxy',
    'all_proxy',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'no_proxy',
    'NO_PROXY',
  ];
  private static readonly APP_EXECUTABLE_CANDIDATE_TRANSFORMS = [
    (name: string) => name,
    (name: string) => name.replace(/\s+/g, ''),
    (name: string) => name.replace(/\s+/g, '-'),
    (name: string) => name.replace(/\s+/g, '_'),
  ];

  private isExecutableFile(fsModule: any, filePath: string): boolean {
    try {
      const stat = fsModule.statSync(filePath);
      return stat.isFile() && (stat.mode & 0o111) !== 0;
    } catch {
      return false;
    }
  }

  private readMacBundleExecutableName(appPath: string): string | null {
    const infoPlistPath = path.join(appPath, 'Contents', 'Info.plist');
    const escapedInfoPath = infoPlistPath.replace(/(["\\$`])/g, '\\$1');

    try {
      const executableName = execSync(
        `/usr/libexec/PlistBuddy -c "Print :CFBundleExecutable" "${escapedInfoPath}"`,
        { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
      ).trim();
      if (executableName) {
        return executableName;
      }
    } catch {
      // fall through to XML parse fallback
    }

    try {
      const fsModule = require('fs');
      const plistContent = fsModule.readFileSync(infoPlistPath, 'utf-8');
      const match = plistContent.match(
        /<key>\s*CFBundleExecutable\s*<\/key>\s*<string>\s*([^<]+)\s*<\/string>/i
      );
      if (match?.[1]) {
        return match[1].trim();
      }
    } catch {
      // ignore
    }

    return null;
  }

  private resolveMacBundleExecutable(appPath: string): string | null {
    const fsModule = require('fs');
    const macBinDir = path.join(appPath, 'Contents', 'MacOS');

    try {
      if (!fsModule.existsSync(macBinDir)) {
        return null;
      }
      const files: string[] = fsModule.readdirSync(macBinDir).filter(Boolean);
      if (files.length === 0) {
        return null;
      }

      // Prefer the exact bundle executable from Info.plist when present.
      const bundleExecutableName = this.readMacBundleExecutableName(appPath);
      if (bundleExecutableName) {
        const bundleExecPath = path.join(macBinDir, bundleExecutableName);
        if (this.isExecutableFile(fsModule, bundleExecPath)) {
          return bundleExecPath;
        }
      }

      const appName = path.basename(appPath, '.app');
      const preferredNames = AppRoutingService.APP_EXECUTABLE_CANDIDATE_TRANSFORMS.map(fn =>
        fn(appName).toLowerCase()
      );

      for (const fileName of files) {
        const execPath = path.join(macBinDir, fileName);
        if (!this.isExecutableFile(fsModule, execPath)) {
          continue;
        }
        if (preferredNames.includes(fileName.toLowerCase())) {
          return execPath;
        }
      }

      // Last resort: any executable in bundle.
      for (const fileName of files) {
        const execPath = path.join(macBinDir, fileName);
        if (this.isExecutableFile(fsModule, execPath)) {
          return execPath;
        }
      }
    } catch {
      // ignore
    }

    return null;
  }

  async getInstalledApps(): Promise<InstalledApp[]> {
    const platform = os.platform();
    const apps: InstalledApp[] = [];

    try {
      if (platform === 'darwin') {
        // macOS
        apps.push(...this.getMacOSApps());
      } else if (platform === 'win32') {
        // Windows
        apps.push(...this.getWindowsApps());
      } else if (platform === 'linux') {
        // Linux
        apps.push(...this.getLinuxApps());
      }
    } catch (error) {
      console.error('Error getting installed apps:', error);
    }

    return apps;
  }

  private getMacOSApps(): InstalledApp[] {
    const apps: InstalledApp[] = [];
    const applicationsPath = '/Applications';

    try {
      const { readdirSync } = require('fs');
      const items = readdirSync(applicationsPath);

      const commonBrowsers = ['Google Chrome', 'Firefox', 'Safari', 'Brave Browser', 'Opera', 'Edge'];

      for (const item of items) {
        if (item.endsWith('.app')) {
          const appName = item.replace('.app', '');
          const appPath = path.join(applicationsPath, item);

          apps.push({
            name: appName,
            path: appPath,
          });
        }
      }

      // Add common browsers if not found
      for (const browser of commonBrowsers) {
        if (!apps.find(app => app.name === browser)) {
          const browserPath = path.join(applicationsPath, `${browser}.app`);
          try {
            require('fs').accessSync(browserPath);
            apps.push({ name: browser, path: browserPath });
          } catch {
            // Browser not installed
          }
        }
      }
    } catch (error) {
      console.error('Error reading macOS applications:', error);
    }

    return apps;
  }

  private getWindowsApps(): InstalledApp[] {
    const apps: InstalledApp[] = [];

    try {
      // Get browser paths on Windows
      const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
      const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
      const localAppData = process.env.LOCALAPPDATA || 'C:\\Users\\' + process.env.USERNAME + '\\AppData\\Local';

      const browserPaths = [
        { name: 'Google Chrome', path: path.join(programFilesX86, 'Google\\Chrome\\Application\\chrome.exe') },
        { name: 'Firefox', path: path.join(programFilesX86, 'Mozilla Firefox\\firefox.exe') },
        { name: 'Microsoft Edge', path: path.join(programFiles, 'Microsoft\\Edge\\Application\\msedge.exe') },
        { name: 'Opera', path: path.join(localAppData, 'Programs\\Opera\\opera.exe') },
        { name: 'Brave', path: path.join(programFiles, 'BraveSoftware\\Brave-Browser\\Application\\brave.exe') },
      ];

      const { accessSync } = require('fs');
      for (const browser of browserPaths) {
        try {
          accessSync(browser.path);
          apps.push({ name: browser.name, path: browser.path });
        } catch {
          // Browser not found
        }
      }
    } catch (error) {
      console.error('Error reading Windows applications:', error);
    }

    return apps;
  }

  private getLinuxApps(): InstalledApp[] {
    const apps: InstalledApp[] = [];

    try {
      const browsers = ['chromium', 'firefox', 'google-chrome', 'brave-browser', 'opera'];

      for (const browser of browsers) {
        try {
          const result = execSync(`which ${browser}`, { encoding: 'utf-8' }).trim();
          if (result) {
            apps.push({ name: browser, path: result });
          }
        } catch {
          // Not found
        }
      }
    } catch (error) {
      console.error('Error reading Linux applications:', error);
    }

    return apps;
  }

  async setAppBypass(appPath: string, shouldBypass: boolean): Promise<void> {
    await this.setAppPolicy(appPath, shouldBypass ? 'bypass' : 'none');
  }

  async getBypassApps(): Promise<BypassApp[]> {
    const rules = await this.getAppRoutingRules();
    return rules
      .filter(rule => rule.policy === 'bypass')
      .map(rule => ({
        appPath: rule.appPath,
        appName: rule.appName,
        shouldBypass: true,
      }));
  }

  async setAppPolicy(appPath: string, policy: AppRoutePolicy): Promise<void> {
    const appName = path.basename(appPath);
    const normalizedPolicy: AppRoutePolicy = policy === 'bypass' || policy === 'vpn' ? policy : 'none';

    if (normalizedPolicy === 'none') {
      await runAsync('DELETE FROM app_routing WHERE appPath = ?', [appPath]);
      return;
    }

    const legacyBypassFlag = normalizedPolicy === 'bypass' ? 1 : 0;
    await runAsync(
      `INSERT OR REPLACE INTO app_routing (appPath, appName, shouldBypass, policy, updatedAt)
       VALUES (?, ?, ?, ?, ?)`,
      [appPath, appName, legacyBypassFlag, normalizedPolicy, new Date().toISOString()]
    );
  }

  async getAppRoutingRules(): Promise<AppRoutingRule[]> {
    const rows = await queryAsync('SELECT appPath, appName, shouldBypass, policy FROM app_routing');
    return rows.map(row => ({
      appPath: row.appPath,
      appName: row.appName || path.basename(row.appPath || ''),
      policy: this.normalizePolicyValue(row.policy, row.shouldBypass),
    }));
  }

  private normalizePolicyValue(rawPolicy: unknown, legacyBypass: unknown): AppRoutePolicy {
    if (rawPolicy === 'bypass' || rawPolicy === 'vpn') {
      return rawPolicy;
    }
    if (legacyBypass === 1 || legacyBypass === true || legacyBypass === '1') {
      return 'bypass';
    }
    return 'none';
  }

  async getAppsByPolicy(policy: Exclude<AppRoutePolicy, 'none'>): Promise<AppRoutingRule[]> {
    const rules = await this.getAppRoutingRules();
    return rules.filter(rule => rule.policy === policy);
  }

  async getVpnApps(): Promise<AppRoutingRule[]> {
    return this.getAppsByPolicy('vpn');
  }

  async getAllAppRoutingRules(): Promise<BypassApp[]> {
    const rules = await this.getAppRoutingRules();
    return rules.map(rule => ({
      appPath: rule.appPath,
      appName: rule.appName,
      shouldBypass: rule.policy === 'bypass',
    }));
  }

  async getLegacyAppRoutingRows(): Promise<any[]> {
    const rows = await queryAsync('SELECT appPath, appName, shouldBypass, policy FROM app_routing');
    return rows.map(row => ({
      appPath: row.appPath,
      appName: row.appName,
      shouldBypass: row.shouldBypass === 1 || row.shouldBypass === true,
      policy: this.normalizePolicyValue(row.policy, row.shouldBypass),
    }));
  }

  async clearAppRouting(): Promise<void> {
    await runAsync('DELETE FROM app_routing');
  }

  async launchAppWithProxy(appPath: string): Promise<void> {
    try {
      const { spawn } = require('child_process');
      const fs = require('fs');

      // Build proxy environment variables for common proxy-aware apps
      const env = {
        ...process.env,
        // socks5h keeps DNS resolution on proxy side and reduces DNS leak risk.
        all_proxy: 'socks5h://127.0.0.1:10808',
        ALL_PROXY: 'socks5h://127.0.0.1:10808',
        http_proxy: 'http://127.0.0.1:10809',
        HTTP_PROXY: 'http://127.0.0.1:10809',
        https_proxy: 'http://127.0.0.1:10809',
        HTTPS_PROXY: 'http://127.0.0.1:10809',
        no_proxy: '127.0.0.1,localhost',
        NO_PROXY: '127.0.0.1,localhost',
      } as NodeJS.ProcessEnv;

      // macOS .app bundles: attempt to find an executable inside Contents/MacOS
      if (process.platform === 'darwin' && appPath.endsWith('.app')) {
        const executablePath = this.resolveMacBundleExecutable(appPath);
        if (executablePath) {
          const child = spawn(executablePath, [], { env, detached: true, stdio: 'ignore' });
          child.unref();
          return;
        }

        // If no executable found, fallback to using `open` without custom env (best-effort)
        try {
          spawn('open', ['-a', appPath], { detached: true, stdio: 'ignore' }).unref();
          console.warn('[AppRoutingService] Launched using open() but environment proxies may not apply');
          return;
        } catch (e) {
          throw new Error('No executable found inside .app bundle and `open` failed');
        }
      }

      // For other platforms or direct executables: ensure path points to a file
      try {
        const st = fs.statSync(appPath);
        if (st.isDirectory()) {
          throw new Error('Expected executable file but got directory');
        }
      } catch (e) {
        // stat failed or is directory
        const errorMsg = e instanceof Error ? e.message : String(e);
        throw new Error('Executable not found or not runnable: ' + errorMsg);
      }

      const child = spawn(appPath, [], { env, detached: true, stdio: 'ignore' });
      child.unref();
      return;
    } catch (error) {
      console.error('[AppRoutingService] Error launching app with proxy:', error);
      throw error;
    }
  }

  async launchAppDirect(appPath: string): Promise<void> {
    try {
      const { spawn } = require('child_process');
      const fs = require('fs');
      const appName = path.basename(appPath).replace(/\.app$/i, '').toLowerCase();
      const env = { ...process.env } as NodeJS.ProcessEnv;
      for (const key of AppRoutingService.PROXY_ENV_KEYS) {
        delete env[key];
      }
      env.no_proxy = '*';
      env.NO_PROXY = '*';

      const browserDirectArgs = this.getDirectProxyArgsForApp(appName);

      // macOS .app bundles: run through `open` and pass direct-proxy args when supported
      if (process.platform === 'darwin' && appPath.endsWith('.app')) {
        const openArgs = ['-a', appPath];
        if (browserDirectArgs.length > 0) {
          openArgs.push('--args', ...browserDirectArgs);
        }
        const child = spawn('open', openArgs, { env, detached: true, stdio: 'ignore' });
        child.unref();
        return;
      }

      try {
        const st = fs.statSync(appPath);
        if (st.isDirectory()) {
          throw new Error('Expected executable file but got directory');
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        throw new Error('Executable not found or not runnable: ' + errorMsg);
      }

      const child = spawn(appPath, browserDirectArgs, { env, detached: true, stdio: 'ignore' });
      child.unref();
      return;
    } catch (error) {
      console.error('[AppRoutingService] Error launching app without proxy:', error);
      throw error;
    }
  }

  private getDirectProxyArgsForApp(appName: string): string[] {
    // Chromium-family apps support these flags to force direct egress.
    const chromiumLike = [
      'chrome',
      'chromium',
      'edge',
      'brave',
      'opera',
      'vivaldi',
    ];
    if (chromiumLike.some(name => appName.includes(name))) {
      return ['--proxy-server=direct://', '--proxy-bypass-list=*'];
    }
    return [];
  }

  async findTelegramAppPath(): Promise<string | null> {
    const apps = await this.getInstalledApps();
    const telegram = apps.find(app =>
      AppRoutingService.TELEGRAM_APP_NAMES.some(name => app.name.toLowerCase() === name.replace('.app', '').toLowerCase())
    );

    if (telegram?.path) {
      return telegram.path;
    }

    if (process.platform === 'darwin') {
      const candidates = [
        '/Applications/Telegram.app',
        '/Applications/Telegram Desktop.app',
        path.join(process.env.HOME || '', 'Applications/Telegram.app'),
      ];
      for (const candidate of candidates) {
        try {
          require('fs').accessSync(candidate);
          return candidate;
        } catch {
          // continue
        }
      }
    }

    return null;
  }

  async bootstrapTelegramLocalSocksProxy(host: string = '127.0.0.1', port: number = 10808): Promise<void> {
    const proxyUrl = `tg://socks?server=${encodeURIComponent(host)}&port=${encodeURIComponent(String(port))}`;
    try {
      const { spawn } = require('child_process');

      if (process.platform === 'darwin') {
        spawn('open', [proxyUrl], { detached: true, stdio: 'ignore' }).unref();
        return;
      }

      if (process.platform === 'win32') {
        spawn('cmd', ['/c', 'start', '', proxyUrl], { detached: true, stdio: 'ignore' }).unref();
        return;
      }

      spawn('xdg-open', [proxyUrl], { detached: true, stdio: 'ignore' }).unref();
    } catch (error) {
      console.warn('[AppRoutingService] Could not bootstrap Telegram SOCKS proxy URL:', error);
    }
  }

  isAppRunning(appPath: string): boolean {
    try {
      const appName = path.basename(appPath).replace(/\.app$/i, '');

      if (process.platform === 'darwin') {
        execSync(`pgrep -x "${appName.replace(/"/g, '\\"')}"`, { stdio: 'ignore' });
        return true;
      }

      if (process.platform === 'win32') {
        const exeName = appPath.toLowerCase().endsWith('.exe') ? path.basename(appPath) : `${appName}.exe`;
        const output = execSync(`tasklist /FI "IMAGENAME eq ${exeName}"`, { encoding: 'utf-8' });
        return output.toLowerCase().includes(exeName.toLowerCase());
      }

      execSync(`pgrep -f "${appName.replace(/"/g, '\\"')}"`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  async stopApp(appPath: string): Promise<void> {
    try {
      const appName = path.basename(appPath).replace(/\.app$/i, '');

      if (process.platform === 'darwin') {
        execSync(`pkill -x "${appName.replace(/"/g, '\\"')}"`, { stdio: 'ignore' });
        return;
      }

      if (process.platform === 'win32') {
        const exeName = appPath.toLowerCase().endsWith('.exe') ? path.basename(appPath) : `${appName}.exe`;
        execSync(`taskkill /IM "${exeName}" /F`, { stdio: 'ignore' });
        return;
      }

      execSync(`pkill -f "${appName.replace(/"/g, '\\"')}"`, { stdio: 'ignore' });
    } catch (error) {
      console.warn('[AppRoutingService] stopApp warning:', error instanceof Error ? error.message : String(error));
    }
  }

  async ensureAppUsesProxy(appPath: string, restartIfRunning: boolean = false): Promise<void> {
    const running = this.isAppRunning(appPath);
    if (running && restartIfRunning) {
      await this.stopApp(appPath);
      await new Promise(resolve => setTimeout(resolve, 800));
      await this.launchAppWithProxy(appPath);
      return;
    }

    if (!running) {
      await this.launchAppWithProxy(appPath);
    }
  }

  async ensureAppBypassesProxy(appPath: string, restartIfRunning: boolean = false): Promise<void> {
    const running = this.isAppRunning(appPath);
    if (running && restartIfRunning) {
      await this.stopApp(appPath);
      await new Promise(resolve => setTimeout(resolve, 800));
      await this.launchAppDirect(appPath);
      return;
    }

    if (!running) {
      await this.launchAppDirect(appPath);
    }
  }
}
