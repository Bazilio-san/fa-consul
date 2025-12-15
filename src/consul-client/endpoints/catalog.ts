import { ConsulHttpClient } from '../http-client.js';

export class CatalogAPI {
  constructor (private client: ConsulHttpClient) {}

  /**
   * GET /v1/catalog/services
   * Returns all services in a datacenter
   */
  async serviceList (dc?: string): Promise<Record<string, string[]>> {
    return this.client.get<Record<string, string[]>>('/catalog/services', dc ? { dc } : undefined);
  }
}
