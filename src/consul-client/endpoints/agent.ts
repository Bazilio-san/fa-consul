import { ConsulHttpClient } from '../http-client.js';
import { ServiceInfo, RegisterServiceOptions, AgentMember, RegisterCheck } from '../types.js';

export class AgentAPI {
  constructor (private client: ConsulHttpClient) {}

  /**
   * GET /v1/agent/services
   * Returns all services registered with the local agent
   */
  async serviceList (): Promise<Record<string, ServiceInfo>> {
    return this.client.get<Record<string, ServiceInfo>>('/agent/services');
  }

  /**
   * PUT /v1/agent/service/register
   * Registers a new service with the local agent
   */
  async serviceRegister (options: RegisterServiceOptions): Promise<void> {
    // Convert to Consul API format (PascalCase)
    const body: Record<string, unknown> = {
      ID: options.id,
      Name: options.name,
      Tags: options.tags,
      Address: options.address,
      Port: options.port,
      Meta: options.meta,
      Check: options.check ? this.formatCheck(options.check) : undefined,
      Checks: options.checks?.map((c) => this.formatCheck(c)),
      Connect: options.connect,
      Proxy: options.proxy,
      TaggedAddresses: options.taggedAddresses,
      Weights: options.weights,
      EnableTagOverride: options.enableTagOverride,
    };

    // Remove undefined values
    Object.keys(body).forEach((key) => {
      if (body[key] === undefined) {
        delete body[key];
      }
    });

    await this.client.put<void>('/agent/service/register', body);
  }

  /**
   * PUT /v1/agent/service/deregister/:service_id
   * Deregisters a service from the local agent
   */
  async serviceDeregister (serviceId: string): Promise<void> {
    await this.client.put<void>(`/agent/service/deregister/${encodeURIComponent(serviceId)}`);
  }

  /**
   * GET /v1/agent/members
   * Returns the members the agent sees in the cluster
   */
  async members (options?: { wan?: boolean; segment?: string }): Promise<AgentMember[]> {
    const query: Record<string, string | boolean | undefined> = {};
    if (options?.wan) {query.wan = options.wan;}
    if (options?.segment) {query.segment = options.segment;}
    return this.client.get<AgentMember[]>('/agent/members', Object.keys(query).length ? query : undefined);
  }

  private formatCheck (check: RegisterCheck): Record<string, unknown> {
    const formatted: Record<string, unknown> = {
      Name: check.name,
      HTTP: check.http,
      TCP: check.tcp,
      Script: check.script,
      Shell: check.shell,
      DockerContainerID: check.dockercontainerid,
      Interval: check.interval,
      Timeout: check.timeout,
      TTL: check.ttl,
      Notes: check.notes,
      Status: check.status,
      DeregisterCriticalServiceAfter: check.deregistercriticalserviceafter,
    };

    // Remove undefined values
    Object.keys(formatted).forEach((key) => {
      if (formatted[key] === undefined) {
        delete formatted[key];
      }
    });

    return formatted;
  }
}
