import { AgentAPI } from './endpoints/agent';
import { CatalogAPI } from './endpoints/catalog';
import { HealthAPI } from './endpoints/health';
import { ConsulHttpClient } from './http-client';
import { ConsulClientOptions, OnRequestHook, OnResponseHook } from './types';

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

export * from './types';
export { ConsulHttpClient } from './http-client';
