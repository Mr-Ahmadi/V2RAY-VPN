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

export class AppRoutingService {
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
    const appName = path.basename(appPath);

    await runAsync(
      `INSERT OR REPLACE INTO app_routing (appPath, appName, shouldBypass, updatedAt)
       VALUES (?, ?, ?, ?)`,
      [appPath, appName, shouldBypass ? 1 : 0, new Date().toISOString()]
    );
  }

  async getBypassApps(): Promise<BypassApp[]> {
    const rows = await queryAsync('SELECT appPath, appName, shouldBypass FROM app_routing WHERE shouldBypass = 1');
    return rows.map(row => ({
      appPath: row.appPath,
      appName: row.appName,
      shouldBypass: row.shouldBypass === 1,
    }));
  }

  async getAllAppRoutingRules(): Promise<BypassApp[]> {
    const rows = await queryAsync('SELECT appPath, appName, shouldBypass FROM app_routing');
    return rows.map(row => ({
      appPath: row.appPath,
      appName: row.appName,
      shouldBypass: row.shouldBypass === 1,
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
        ALL_PROXY: 'socks5://127.0.0.1:10808',
        HTTP_PROXY: 'http://127.0.0.1:10809',
        HTTPS_PROXY: 'http://127.0.0.1:10809',
      } as NodeJS.ProcessEnv;

      // macOS .app bundles: attempt to find an executable inside Contents/MacOS
      if (process.platform === 'darwin' && appPath.endsWith('.app')) {
        const macBinDir = path.join(appPath, 'Contents', 'MacOS');
        try {
          const files = fs.readdirSync(macBinDir).filter(Boolean);
          // Prefer an executable file
          for (const f of files) {
            const execPath = path.join(macBinDir, f);
            try {
              const st = fs.statSync(execPath);
              if (st.isFile() && (st.mode & 0o111)) {
                const child = spawn(execPath, [], { env, detached: true, stdio: 'ignore' });
                child.unref();
                return;
              }
            } catch (e) {
              // ignore and continue
            }
          }
          // If no executable found, fallback to using `open` without custom env (best-effort)
          try {
            spawn('open', ['-a', appPath], { detached: true, stdio: 'ignore' }).unref();
            console.warn('[AppRoutingService] Launched using open() but environment proxies may not apply');
            return;
          } catch (e) {
            throw new Error('No executable found inside .app bundle and `open` failed');
          }
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : String(e);
          throw new Error('Failed to access .app bundle contents: ' + errorMsg);
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
}
