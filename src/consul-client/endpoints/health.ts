import { ConsulHttpClient } from '../http-client.js';
import { HealthServiceInfo } from '../types.js';

export class HealthAPI {
  constructor (private client: ConsulHttpClient) {}

  /**
   * GET /v1/health/service/:service
   * Returns the nodes and health info of a service
   */
  async service (options: {
    service: string;
    dc?: string;
    passing?: boolean;
    tag?: string;
    near?: string;
  }): Promise<HealthServiceInfo[]> {
    const { service, ...queryOptions } = options;
    const query: Record<string, string | boolean | undefined> = {};

    if (queryOptions.dc) {query.dc = queryOptions.dc;}
    if (queryOptions.passing !== undefined) {query.passing = queryOptions.passing;}
    if (queryOptions.tag) {query.tag = queryOptions.tag;}
    if (queryOptions.near) {query.near = queryOptions.near;}

    return this.client.get<HealthServiceInfo[]>(
      `/health/service/${encodeURIComponent(service)}`,
      Object.keys(query).length ? query : undefined,
    );
  }
}
