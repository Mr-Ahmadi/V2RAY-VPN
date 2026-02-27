import { runAsync, queryAsync } from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';
import https from 'https';
import { ServerManager } from './serverManager.js';
import { UriImportService } from './import/UriImportService.js';

export interface Subscription {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  lastUpdatedAt?: string | null;
  lastError?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface RefreshSubscriptionResult {
  subscription: Subscription;
  importedCount: number;
  skippedCount: number;
  errorCount: number;
  errors: string[];
}

const fetchText = async (url: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          'User-Agent': 'V2RAY-VPN-Desktop',
          Accept: 'text/plain,*/*',
        },
      },
      (response) => {
        const statusCode = response.statusCode || 0;
        const location = response.headers.location;

        if (location && statusCode >= 300 && statusCode < 400) {
          response.resume();
          fetchText(new URL(location, url).toString()).then(resolve).catch(reject);
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          response.resume();
          reject(new Error(`Subscription request failed (${statusCode})`));
          return;
        }

        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        response.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      }
    );

    request.on('error', reject);
    request.setTimeout(15000, () => {
      request.destroy(new Error('Subscription request timeout'));
    });
  });

export class SubscriptionManager {
  private readonly serverManager = new ServerManager();
  private readonly uriImportService = new UriImportService(this.serverManager);

  async addSubscription(input: { name: string; url: string }): Promise<RefreshSubscriptionResult> {
    const name = String(input.name || '').trim();
    const url = String(input.url || '').trim();

    if (!name) {
      throw new Error('Subscription name is required');
    }
    if (!url) {
      throw new Error('Subscription URL is required');
    }
    this.validateHttpUrl(url);

    const now = new Date().toISOString();
    const id = uuidv4();

    await runAsync(
      `INSERT INTO subscriptions (id, name, url, enabled, lastUpdatedAt, lastError, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, url, 1, null, null, now, now]
    );

    return this.refreshSubscription(id);
  }

  async listSubscriptions(): Promise<Subscription[]> {
    const rows = await queryAsync('SELECT * FROM subscriptions ORDER BY createdAt DESC');
    return rows.map((row) => this.mapRow(row));
  }

  async deleteSubscription(subscriptionId: string): Promise<void> {
    const id = String(subscriptionId || '').trim();
    if (!id) {
      throw new Error('Subscription ID is required');
    }

    const servers = await this.serverManager.listServers();
    const linkedServerIds = servers
      .filter((server) => server.subscriptionId === id)
      .map((server) => server.id);

    for (const serverId of linkedServerIds) {
      await this.serverManager.deleteServer(serverId);
    }

    await runAsync('DELETE FROM subscriptions WHERE id = ?', [id]);
  }

  async refreshSubscription(subscriptionId: string): Promise<RefreshSubscriptionResult> {
    const id = String(subscriptionId || '').trim();
    if (!id) {
      throw new Error('Subscription ID is required');
    }

    const subscription = await this.getSubscription(id);
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const now = new Date().toISOString();

    try {
      const payload = await fetchText(subscription.url);
      const maybeBase64 = payload.replace(/\s+/g, '');
      const decodedPayload = this.tryDecodeBase64ToText(maybeBase64) || payload;

      const existingServers = await this.serverManager.listServers();
      const linkedServerIds = existingServers
        .filter((server) => server.subscriptionId === subscription.id)
        .map((server) => server.id);

      for (const serverId of linkedServerIds) {
        await this.serverManager.deleteServer(serverId);
      }

      const result = await this.uriImportService.importUris(decodedPayload, {
        subscriptionId: subscription.id,
      });

      await runAsync(
        `UPDATE subscriptions SET lastUpdatedAt = ?, lastError = ?, updatedAt = ? WHERE id = ?`,
        [now, null, now, subscription.id]
      );

      const updatedSubscription = await this.getSubscription(subscription.id);
      if (!updatedSubscription) {
        throw new Error('Failed to reload subscription after refresh');
      }

      return {
        subscription: updatedSubscription,
        importedCount: result.imported.length,
        skippedCount: result.skipped.length,
        errorCount: result.errors.length,
        errors: result.errors.map((entry) => entry.error),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await runAsync(
        `UPDATE subscriptions SET lastError = ?, updatedAt = ? WHERE id = ?`,
        [message, now, subscription.id]
      );
      throw error;
    }
  }

  private async getSubscription(subscriptionId: string): Promise<Subscription | null> {
    const rows = await queryAsync('SELECT * FROM subscriptions WHERE id = ?', [subscriptionId]);
    if (!rows.length) {
      return null;
    }
    return this.mapRow(rows[0]);
  }

  private mapRow(row: any): Subscription {
    return {
      id: row.id,
      name: row.name,
      url: row.url,
      enabled: row.enabled === true || row.enabled === 1,
      lastUpdatedAt: row.lastUpdatedAt || null,
      lastError: row.lastError || null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private validateHttpUrl(url: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('Invalid subscription URL');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Subscription URL must be http or https');
    }
  }

  private tryDecodeBase64ToText(value: string): string | null {
    if (!value) {
      return null;
    }

    if (!/^[A-Za-z0-9+/=_-]+$/.test(value)) {
      return null;
    }

    try {
      const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = Buffer.from(normalized, 'base64').toString('utf-8');
      if (!decoded || decoded.includes('\uFFFD')) {
        return null;
      }
      if (/(vless|vmess|trojan|ss):\/\//i.test(decoded)) {
        return decoded;
      }
      return null;
    } catch {
      return null;
    }
  }
}
