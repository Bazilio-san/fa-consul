import { AgentAPI } from './endpoints/agent.js';
import { CatalogAPI } from './endpoints/catalog.js';
import { HealthAPI } from './endpoints/health.js';
import { ConsulHttpClient } from './http-client.js';
import { ConsulClientOptions, OnRequestHook, OnResponseHook } from './types.js';

export class ConsulClient {
  private readonly httpClient: ConsulHttpClient;

  public readonly agent: AgentAPI;
  public readonly health: HealthAPI;
  public readonly catalog: CatalogAPI;

  constructor (options: ConsulClientOptions) {
    this.httpClient = new ConsulHttpClient(options);
    this.agent = new AgentAPI(this.httpClient);
    this.health = new HealthAPI(this.httpClient);
    this.catalog = new CatalogAPI(this.httpClient);
  }

  onRequest (hook: OnRequestHook): void {
    this.httpClient.onRequest(hook);
  }

  onResponse (hook: OnResponseHook): void {
    this.httpClient.onResponse(hook);
  }
}

export * from './types.js';
export { ConsulHttpClient } from './http-client.js';
