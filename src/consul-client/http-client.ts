import * as http from 'http';
import * as https from 'https';

import { ConsulClientOptions, RequestInfo, ResponseInfo, OnRequestHook, OnResponseHook } from './types.js';

export class ConsulHttpClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly timeout: number;
  private readonly httpModule: typeof http | typeof https;
  private readonly host: string;
  private readonly port: string | number;
  private readonly protocol: string;

  private requestCounter = 0;
  private onRequestHooks: OnRequestHook[] = [];
  private onResponseHooks: OnResponseHook[] = [];

  constructor (options: ConsulClientOptions) {
    const protocol = options.secure ? 'https' : 'http';
    const port = options.port || (options.secure ? 443 : 8500);
    this.host = options.host;
    this.port = port;
    this.protocol = `${protocol}:`;
    this.baseUrl = `${protocol}://${options.host}:${port}/v1`;
    this.httpModule = options.secure ? https : http;
    this.timeout = options.timeout || 30000;

    this.headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    // Support both direct token and defaults.token (for compatibility)
    const token = options.token || options.defaults?.token;
    if (token) {
      this.headers['X-Consul-Token'] = token;
    }
  }

  onRequest (hook: OnRequestHook): void {
    this.onRequestHooks.push(hook);
  }

  onResponse (hook: OnResponseHook): void {
    this.onResponseHooks.push(hook);
  }

  private buildQueryString (params?: Record<string, string | boolean | undefined>): string {
    if (!params) {return '';}
    const entries = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    return entries.length ? `?${entries.join('&')}` : '';
  }

  async request<T> (
    method: 'GET' | 'PUT' | 'POST' | 'DELETE',
    path: string,
    options?: {
      query?: Record<string, string | boolean | undefined>;
      body?: unknown;
      skipCodes?: number[];
    },
  ): Promise<T> {
    const requestId = ++this.requestCounter;
    const queryString = this.buildQueryString(options?.query);
    const url = `${this.baseUrl}${path}${queryString}`;
    const body = options?.body ? JSON.stringify(options.body) : undefined;

    const requestInfo: RequestInfo = {
      id: requestId,
      method,
      url,
      headers: { ...this.headers },
      body,
      timestamp: Date.now(),
      // Properties for compatibility with debug utilities
      path: `/v1${path}${queryString}`,
      hostname: this.host,
      port: this.port,
      protocol: this.protocol,
      query: options?.query,
    };

    // Emit onRequest hooks
    this.onRequestHooks.forEach((hook) => hook(requestInfo));

    return new Promise<T>((resolve, reject) => {
      const urlObj = new URL(url);

      const reqOptions: http.RequestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method,
        headers: {
          ...this.headers,
          ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
        },
        timeout: this.timeout,
      };

      const req = this.httpModule.request(reqOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          const statusCode = res.statusCode || 0;
          let parsedBody: unknown;

          try {
            parsedBody = data ? JSON.parse(data) : null;
          } catch {
            parsedBody = data;
          }

          const responseInfo: ResponseInfo = {
            requestId,
            statusCode,
            body: parsedBody,
            timestamp: Date.now(),
          };

          // Emit onResponse hooks
          this.onResponseHooks.forEach((hook) => hook(requestInfo, responseInfo));

          if (statusCode >= 200 && statusCode < 300) {
            resolve(parsedBody as T);
          } else if (options?.skipCodes?.includes(statusCode)) {
            resolve(parsedBody as T);
          } else {
            reject(new Error(`Consul API error: ${statusCode} - ${JSON.stringify(parsedBody)}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout: ${url}`));
      });

      if (body) {
        req.write(body);
      }
      req.end();
    });
  }

  async get<T> (path: string, query?: Record<string, string | boolean | undefined>): Promise<T> {
    return this.request<T>('GET', path, query ? { query } : undefined);
  }

  async put<T> (path: string, body?: unknown, query?: Record<string, string | boolean | undefined>): Promise<T> {
    return this.request<T>('PUT', path, {
      ...(query ? { query } : {}),
      ...(body !== undefined ? { body } : {}),
    });
  }

  getRequestCounter (): number {
    return this.requestCounter;
  }
}
