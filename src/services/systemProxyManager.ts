import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import debugLogger from './debugLogger.js';

interface PacRoutingOptions {
  socksHost?: string;
  socksPort?: number;
  httpHost?: string;
  httpPort?: number;
  directDomains?: string[];
  proxyDomains?: string[];
}

export class SystemProxyManager {
  private static readonly SOCKS_PORT = 10808;
  private static readonly HTTP_PORT = 10809;
  private proxyEnabled = false;
  private lastPacInfo: Record<string, any> | null = null;

  private parseNetworkSetupOutput(output: string): Record<string, string> {
    return output
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .reduce((acc, line) => {
        const separatorIndex = line.indexOf(':');
        if (separatorIndex <= 0) return acc;
        const key = line.slice(0, separatorIndex).trim();
        const value = line.slice(separatorIndex + 1).trim();
        acc[key] = value;
        return acc;
      }, {} as Record<string, string>);
  }

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
      console.log('[SystemProxyManager] Executing command:', command.substring(0, 100));
      
      // First, try without sudo (may work if app has permissions)
      try {
        execSync(command, { 
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: '/bin/bash'
        });
        console.log('[SystemProxyManager] Command executed successfully without sudo');
        return;
      } catch (directError: any) {
        // If we get permission error, try with sudo via osascript
        if (directError.message.includes('EACCES') || directError.message.includes('Operation not permitted')) {
          console.log('[SystemProxyManager] Direct execution failed with permission error, attempting via osascript...');
          
          // Use osascript to request admin privileges
          const escapedCommand = command.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          const osascriptCmd = `osascript -e 'do shell script "${escapedCommand}" with administrator privileges'`;
          
          try {
            execSync(osascriptCmd, {
              stdio: ['pipe', 'pipe', 'pipe'],
              shell: '/bin/bash',
              timeout: 30000  // 30 second timeout for user to enter password
            });
            console.log('[SystemProxyManager] Command executed with admin privileges via osascript');
            return;
          } catch (osascriptError: any) {
            if (osascriptError.message.includes('timeout') || osascriptError.status === 1) {
              console.error('[SystemProxyManager] Admin request timed out or was cancelled');
              throw new Error('Admin privileges request timed out. User may have cancelled the prompt.');
            }
            throw osascriptError;
          }
        } else {
          // Some other error occurred
          throw directError;
        }
      }
    } catch (error: any) {
      console.error('[SystemProxyManager] Command execution failed:', error.message);
      throw error;
    }
  }

  async enableSystemProxy(): Promise<void> {
    if (this.proxyEnabled) {
      console.log('[SystemProxyManager] Proxy already enabled');
      return;
    }

    const startTime = Date.now();
    console.log('[SystemProxyManager] ========== PROXY SETUP START ==========');

    try {
      const services = this.getNetworkServices();
      console.log('[SystemProxyManager] Found network services:', services);

      if (services.length === 0) {
        const error = 'No network services found - cannot configure proxy';
        console.error('[SystemProxyManager]', error);
        throw new Error(error);
      }

      // CRITICAL: Minimal bypass list - only localhost to prevent routing loops
      const bypassDomains = '127.0.0.1,localhost';
      console.log('[SystemProxyManager] Using bypass domains:', bypassDomains);

      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];
      const services_configured: string[] = [];

      for (const service of services) {
        try {
          console.log(`[SystemProxyManager] === Configuring service: "${service}" ===`);
          
          // Step 1: Configure SOCKS proxy (most reliable for all traffic)
          console.log(`[SystemProxyManager]   Step 1/4: Setting SOCKS proxy port ${SystemProxyManager.SOCKS_PORT}...`);
          this.executeWithAuth(
            `networksetup -setsocksfirewallproxy "${service}" 127.0.0.1 ${SystemProxyManager.SOCKS_PORT}`
          );
          this.executeWithAuth(`networksetup -setsocksfirewallproxystate "${service}" on`);
          console.log(`[SystemProxyManager]   ✓ SOCKS proxy enabled for ${service}`);

          // Step 2: Configure HTTP proxy
          console.log(`[SystemProxyManager]   Step 2/4: Setting HTTP proxy port ${SystemProxyManager.HTTP_PORT}...`);
          this.executeWithAuth(
            `networksetup -setwebproxy "${service}" 127.0.0.1 ${SystemProxyManager.HTTP_PORT}`
          );
          this.executeWithAuth(`networksetup -setwebproxystate "${service}" on`);
          console.log(`[SystemProxyManager]   ✓ HTTP proxy enabled for ${service}`);

          // Step 3: Configure HTTPS proxy
          console.log(`[SystemProxyManager]   Step 3/4: Setting HTTPS proxy...`);
          this.executeWithAuth(
            `networksetup -setsecurewebproxy "${service}" 127.0.0.1 ${SystemProxyManager.HTTP_PORT}`
          );
          this.executeWithAuth(`networksetup -setsecurewebproxystate "${service}" on`);
          console.log(`[SystemProxyManager]   ✓ HTTPS proxy enabled for ${service}`);

          // Step 4: Set proxy bypass domains
          console.log(`[SystemProxyManager]   Step 4/4: Setting bypass domains...`);
          try {
            this.executeWithAuth(
              `networksetup -setproxybypassdomains "${service}" ${bypassDomains}`
            );
            console.log(`[SystemProxyManager]   ✓ Bypass domains set for ${service}`);
          } catch (e) {
            console.warn(`[SystemProxyManager]   ⚠ Could not set bypass domains for "${service}":`, e);
            // Don't fail completely, continue
          }

          services_configured.push(service);
          successCount++;
          console.log(`[SystemProxyManager] ✓ Service "${service}" configured successfully`);
        } catch (error: any) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error(`[SystemProxyManager] ✗ Failed to configure service "${service}":`, errorMsg);
          errors.push(`${service}: ${errorMsg}`);
          errorCount++;
        }
      }

      if (successCount === 0) {
        const errorMsg = `Failed to configure proxy on any service:\n${errors.join('\n')}`;
        console.error('[SystemProxyManager]', errorMsg);
        console.error('[SystemProxyManager] ========== PROXY SETUP FAILED ==========');
        throw new Error(errorMsg);
      }

      // Mark as enabled if at least one service succeeded
      this.proxyEnabled = true;
      console.log(
        `[SystemProxyManager] Proxy configured on ${successCount}/${services.length} service(s)`
      );

      // Verify proxy was actually applied
      console.log('[SystemProxyManager] Verifying proxy settings...');
      try {
        await this.verifyProxySettings();
        console.log('[SystemProxyManager] ✓ Proxy verification successful');
      } catch (verifyError: any) {
        console.warn('[SystemProxyManager] ⚠ Proxy verification failed:', verifyError.message);
        console.warn('[SystemProxyManager] WARNING: Proxy may not be working correctly');
        // Don't fail completely - proxy might still work
      }

      const duration = Date.now() - startTime;
      console.log('[SystemProxyManager] ========== PROXY SETUP SUCCESS ==========');
      console.log(`[SystemProxyManager] Setup completed in ${duration}ms`);
    } catch (error) {
      console.error('[SystemProxyManager] ========== PROXY SETUP FAILED ==========');
      console.error('[SystemProxyManager] Error enabling proxy:', error);
      throw error;
    }
  }

  private async verifyProxySettings(): Promise<void> {
    console.log('[SystemProxyManager] Verifying proxy settings...');
    try {
      const services = this.getNetworkServices();
      let verifiedCount = 0;
      
      for (const service of services) {
        try {
          // Check if HTTP proxy is actually set
          const proxyInfo = execSync(
            `networksetup -getwebproxy "${service}"`,
            { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
          );
          
          const enabled = proxyInfo.includes('Enabled: Yes');
          const hasCorrectServer = proxyInfo.includes('127.0.0.1');
          const hasCorrectPort = proxyInfo.includes(SystemProxyManager.HTTP_PORT.toString());
          
          if (enabled && hasCorrectServer && hasCorrectPort) {
            console.log(`[SystemProxyManager] ✓ Proxy verified for ${service}:`, {
              enabled,
              server: '127.0.0.1',
              port: SystemProxyManager.HTTP_PORT
            });
            verifiedCount++;
            return; // At least one service is verified, we're good
          } else {
            console.warn(`[SystemProxyManager] ✗ Proxy settings mismatch for ${service}:`, {
              enabled,
              hasCorrectServer,
              hasCorrectPort
            });
          }
        } catch (e) {
          // Continue to next service
        }
      }
      
      if (verifiedCount === 0) {
        throw new Error('Could not verify proxy settings on any network service');
      }
    } catch (error) {
      console.warn('[SystemProxyManager] Proxy verification error:', error);
      throw error;
    }
  }

  async disableSystemProxy(): Promise<void> {
    console.log('[SystemProxyManager] ========== PROXY TEARDOWN START ==========');
    
    const startTime = Date.now();
    
    try {
      const services = this.getNetworkServices();
      console.log('[SystemProxyManager] Disabling proxy for services:', services);

      let successCount = 0;
      let errorCount = 0;

      for (const service of services) {
        try {
          console.log(`[SystemProxyManager] Disabling proxy for "${service}"...`);
          
          // Disable all proxy types
          try {
            this.executeWithAuth(`networksetup -setsocksfirewallproxystate "${service}" off`);
          } catch (e) {
            console.warn(`[SystemProxyManager]   ⚠ Could not disable SOCKS proxy for "${service}"`, e);
          }
          
          try {
            this.executeWithAuth(`networksetup -setwebproxystate "${service}" off`);
          } catch (e) {
            console.warn(`[SystemProxyManager]   ⚠ Could not disable HTTP proxy for "${service}"`, e);
          }
          
          try {
            this.executeWithAuth(`networksetup -setsecurewebproxystate "${service}" off`);
          } catch (e) {
            console.warn(`[SystemProxyManager]   ⚠ Could not disable HTTPS proxy for "${service}"`, e);
          }

          // Disable Auto Proxy (PAC)
          try {
            this.executeWithAuth(`networksetup -setautoproxystate "${service}" off`);
          } catch (e) {
            // ignore
          }

          console.log(`[SystemProxyManager] ✓ Proxy disabled for "${service}"`);
          successCount++;
        } catch (error) {
          console.warn(`[SystemProxyManager] ✗ Error disabling proxy for "${service}":`, error);
          errorCount++;
        }
      }

      if (successCount > 0) {
        this.proxyEnabled = false;
        console.log(
          `[SystemProxyManager] Proxy disabled for ${successCount}/${services.length} service(s)`
        );
      } else if (errorCount > 0) {
        console.warn('[SystemProxyManager] Failed to disable proxy on all services');
      }

      const duration = Date.now() - startTime;
      console.log('[SystemProxyManager] ========== PROXY TEARDOWN SUCCESS ==========');
      console.log(`[SystemProxyManager] Teardown completed in ${duration}ms`);
    } catch (error) {
      console.error('[SystemProxyManager] ========== PROXY TEARDOWN FAILED ==========');
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

  private escapePacString(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  private normalizeDomainList(values: string[] | undefined): string[] {
    if (!Array.isArray(values)) return [];
    return Array.from(
      new Set(
        values
          .map((value) => String(value || '').trim().toLowerCase())
          .filter(Boolean)
      )
    );
  }

  private buildPacContent(options: PacRoutingOptions = {}): string {
    const socksHost = options.socksHost || '127.0.0.1';
    const socksPort = Number(options.socksPort || SystemProxyManager.SOCKS_PORT);
    const httpHost = options.httpHost || '127.0.0.1';
    const httpPort = Number(options.httpPort || SystemProxyManager.HTTP_PORT);
    const directDomains = this.normalizeDomainList([
      'localhost',
      'local',
      ...(options.directDomains || []),
    ]);
    const proxyDomains = this.normalizeDomainList(options.proxyDomains);

    const directDomainJson = JSON.stringify(directDomains);
    const proxyDomainJson = JSON.stringify(proxyDomains);
    const proxyChain = `SOCKS5 ${this.escapePacString(socksHost)}:${socksPort}; PROXY ${this.escapePacString(httpHost)}:${httpPort}; DIRECT`;

    return `function FindProxyForURL(url, host) {
  host = (host || "").toLowerCase();
  if (!host) return "DIRECT";
  if (isPlainHostName(host) || shExpMatch(host, "*.local")) return "DIRECT";
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return "DIRECT";

  var directDomains = ${directDomainJson};
  for (var i = 0; i < directDomains.length; i++) {
    var directDomain = directDomains[i];
    if (!directDomain) continue;
    if (dnsDomainIs(host, directDomain) || shExpMatch(host, "*." + directDomain)) {
      return "DIRECT";
    }
  }

  var proxyDomains = ${proxyDomainJson};
  for (var j = 0; j < proxyDomains.length; j++) {
    var proxyDomain = proxyDomains[j];
    if (!proxyDomain) continue;
    if (dnsDomainIs(host, proxyDomain) || shExpMatch(host, "*." + proxyDomain)) {
      return "${proxyChain}";
    }
  }

  return "${proxyChain}";
}`;
  }

  async enableDynamicPac(userDataPath: string, options: PacRoutingOptions = {}): Promise<{ pacPath: string; pacUrl: string }> {
    const pacDir = path.join(userDataPath, 'pac');
    const pacPath = path.join(pacDir, 'proxy.pac');
    const pacUrl = `file://${pacPath}`;
    const pacContent = this.buildPacContent(options);

    if (!fs.existsSync(pacDir)) {
      fs.mkdirSync(pacDir, { recursive: true });
    }
    fs.writeFileSync(pacPath, pacContent, 'utf-8');

    this.lastPacInfo = {
      generatedAt: new Date().toISOString(),
      pacPath,
      pacUrl,
      options: {
        socksHost: options.socksHost || '127.0.0.1',
        socksPort: options.socksPort || SystemProxyManager.SOCKS_PORT,
        httpHost: options.httpHost || '127.0.0.1',
        httpPort: options.httpPort || SystemProxyManager.HTTP_PORT,
        directDomains: this.normalizeDomainList(options.directDomains),
        proxyDomains: this.normalizeDomainList(options.proxyDomains),
      },
    };

    debugLogger.info('SystemProxyManager', 'Generated PAC file', this.lastPacInfo);
    await this.enableAutoProxy(pacUrl);
    debugLogger.info('SystemProxyManager', 'Enabled PAC routing', { pacUrl });
    return { pacPath, pacUrl };
  }

  getPacSnapshot(): Record<string, any> | null {
    if (!this.lastPacInfo) return null;
    return {
      ...this.lastPacInfo,
      proxyEnabled: this.proxyEnabled,
    };
  }

  isProxyEnabled(): boolean {
    return this.proxyEnabled;
  }

  getSystemProxySnapshot(): Record<string, any> {
    if (process.platform !== 'darwin') {
      return {
        platform: process.platform,
        supported: false,
        reason: 'System proxy snapshot is currently implemented for macOS only',
      };
    }

    const services = this.getNetworkServices();
    const snapshot = services.map(service => {
      const read = (command: string) => {
        try {
          return execSync(command, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
        } catch {
          return '';
        }
      };

      const web = this.parseNetworkSetupOutput(read(`networksetup -getwebproxy "${service}"`));
      const secureWeb = this.parseNetworkSetupOutput(read(`networksetup -getsecurewebproxy "${service}"`));
      const socks = this.parseNetworkSetupOutput(read(`networksetup -getsocksfirewallproxy "${service}"`));
      const autoProxy = this.parseNetworkSetupOutput(read(`networksetup -getautoproxyurl "${service}"`));

      return {
        service,
        web: {
          enabled: web['Enabled'] === 'Yes',
          server: web['Server'],
          port: web['Port'],
        },
        secureWeb: {
          enabled: secureWeb['Enabled'] === 'Yes',
          server: secureWeb['Server'],
          port: secureWeb['Port'],
        },
        socks: {
          enabled: socks['Enabled'] === 'Yes',
          server: socks['Server'],
          port: socks['Port'],
        },
        autoProxy: {
          enabled: autoProxy['Enabled'] === 'Yes',
          url: autoProxy['URL'],
        },
      };
    });

    return {
      platform: 'darwin',
      supported: true,
      proxyEnabledFlag: this.proxyEnabled,
      pac: this.getPacSnapshot(),
      services: snapshot,
      capturedAt: new Date().toISOString(),
    };
  }
}

const systemProxyManager = new SystemProxyManager();
export default systemProxyManager;
