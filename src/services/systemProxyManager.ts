import { execSync } from 'child_process';

export class SystemProxyManager {
  private static readonly SOCKS_PORT = 10808;
  private static readonly HTTP_PORT = 10809;
  private proxyEnabled = false;

  private getNetworkServices(): string[] {
    try {
      // Get list of network services
      const output = execSync('networksetup -listallnetworkservices', {
        encoding: 'utf-8',
      });

      return output
        .split('\n')
        .filter(line => line.trim() && !line.includes('An asterisk'))
        .map(line => line.trim());
    } catch (error) {
      console.error('[SystemProxyManager] Error getting network services:', error);
      return [];
    }
  }

  private executeWithAuth(command: string): void {
    try {
      // Try to execute the command, if it fails due to permissions, ask for sudo
      try {
        execSync(command, { stdio: 'pipe' });
      } catch (error: any) {
        // If permission denied, try with sudo using osascript
        if (error.message.includes('EACCES') || error.message.includes('Operation not permitted')) {
          const escapedCommand = command.replace(/"/g, '\\"');
          const osascriptCmd = `osascript -e "do shell script \\"${escapedCommand}\\" with administrator privileges"`;
          execSync(osascriptCmd, { stdio: 'pipe' });
        } else {
          throw error;
        }
      }
    } catch (error) {
      throw error;
    }
  }

  async enableSystemProxy(): Promise<void> {
    if (this.proxyEnabled) {
      console.log('[SystemProxyManager] Proxy already enabled');
      return;
    }

    try {
      const services = this.getNetworkServices();
      console.log('[SystemProxyManager] Enabling proxy for services:', services);

      let successCount = 0;
      let errorCount = 0;

      for (const service of services) {
        try {
          // Enable SOCKS proxy
          this.executeWithAuth(
            `networksetup -setsocksfirewallproxy "${service}" 127.0.0.1 ${SystemProxyManager.SOCKS_PORT}`
          );

          // Enable HTTP proxy
          this.executeWithAuth(
            `networksetup -setwebproxy "${service}" 127.0.0.1 ${SystemProxyManager.HTTP_PORT}`
          );

          // Enable HTTPS proxy
          this.executeWithAuth(
            `networksetup -setsecurewebproxy "${service}" 127.0.0.1 ${SystemProxyManager.HTTP_PORT}`
          );

          // Turn proxy state ON (required on macOS)
          this.executeWithAuth(`networksetup -setsocksfirewallproxystate "${service}" on`);
          this.executeWithAuth(`networksetup -setwebproxystate "${service}" on`);
          this.executeWithAuth(`networksetup -setsecurewebproxystate "${service}" on`);

          console.log('[SystemProxyManager] Proxy enabled for service:', service);
          successCount++;
        } catch (error) {
          console.warn(`[SystemProxyManager] Could not configure service "${service}":`, error);
          errorCount++;
        }
      }

      if (successCount > 0) {
        this.proxyEnabled = true;
        console.log(
          `[SystemProxyManager] System proxy enabled for ${successCount} service(s), ${errorCount} failed`
        );
      } else if (errorCount > 0) {
        console.warn(
          '[SystemProxyManager] Failed to configure proxy on all services'
        );
      }
    } catch (error) {
      console.error('[SystemProxyManager] Error enabling proxy:', error);
      throw error;
    }
  }

  async disableSystemProxy(): Promise<void> {
    if (!this.proxyEnabled) {
      console.log('[SystemProxyManager] Proxy already disabled');
      // Still attempt to disable autoproxy states if they exist
    }

    try {
      const services = this.getNetworkServices();
      console.log('[SystemProxyManager] Disabling proxy for services:', services);

      let successCount = 0;
      let errorCount = 0;

      for (const service of services) {
        try {
          // Disable SOCKS proxy
          this.executeWithAuth(`networksetup -setsocksfirewallproxystate "${service}" off`);

          // Disable HTTP proxy
          this.executeWithAuth(`networksetup -setwebproxystate "${service}" off`);

          // Disable HTTPS proxy
          this.executeWithAuth(`networksetup -setsecurewebproxystate "${service}" off`);

          // Disable Auto Proxy URL and state
          try {
            this.executeWithAuth(`networksetup -setautoproxystate "${service}" off`);
            this.executeWithAuth(`networksetup -setautoproxyurl "${service}" ""`);
          } catch (e) {
            // ignore
          }

          console.log('[SystemProxyManager] Proxy disabled for service:', service);
          successCount++;
        } catch (error) {
          console.warn(`[SystemProxyManager] Could not disable proxy for service "${service}":`, error);
          errorCount++;
        }
      }

      if (successCount > 0) {
        this.proxyEnabled = false;
        console.log(
          `[SystemProxyManager] System proxy disabled for ${successCount} service(s), ${errorCount} failed`
        );
      } else if (errorCount > 0) {
        console.warn('[SystemProxyManager] Failed to disable proxy on all services');
      }
    } catch (error) {
      console.error('[SystemProxyManager] Error disabling proxy:', error);
      throw error;
    }
  }

  async enableAutoProxy(pacUrl: string): Promise<void> {
    try {
      const services = this.getNetworkServices();
      console.log('[SystemProxyManager] Enabling auto proxy (PAC) for services:', services, pacUrl);

      let successCount = 0;
      let errorCount = 0;

      for (const service of services) {
        try {
          this.executeWithAuth(`networksetup -setautoproxyurl "${service}" "${pacUrl}"`);
          this.executeWithAuth(`networksetup -setautoproxystate "${service}" on`);
          console.log('[SystemProxyManager] PAC enabled for service:', service);
          successCount++;
        } catch (error) {
          console.warn(`[SystemProxyManager] Could not enable PAC for service "${service}":`, error);
          errorCount++;
        }
      }

      if (successCount > 0) {
        this.proxyEnabled = true;
        console.log(
          `[SystemProxyManager] PAC enabled for ${successCount} service(s), ${errorCount} failed`
        );
      } else if (errorCount > 0) {
        console.warn('[SystemProxyManager] Failed to enable PAC on all services');
      }
    } catch (error) {
      console.error('[SystemProxyManager] Error enabling PAC proxy:', error);
      throw error;
    }
  }

  isProxyEnabled(): boolean {
    return this.proxyEnabled;
  }
}

const systemProxyManager = new SystemProxyManager();
export default systemProxyManager;
