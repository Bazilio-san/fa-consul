import nodeConfig from 'config';

import { ConsulClient } from '../../src/index.js';

const config = nodeConfig.util.toObject() as any;


export function createTestClient (agentType: 'reg' | 'dev' | 'prd' = 'reg'): ConsulClient {
  const agentConfig = config.consul.agent[agentType];
  return new ConsulClient({
    host: agentConfig.host,
    port: agentConfig.port,
    secure: agentConfig.secure,
    token: agentConfig.token,
    dc: agentConfig.dc,
  });
}

export function getTestServiceConfig () {
  return {
    id: `test-${Date.now()}`,
    name: config.consul.service.name,
    port: config.consul.service.port,
    address: config.consul.service.host,
    tags: ['test', 'temporary'],
    meta: { test: 'true' },
    check: {
      http: `http://${config.consul.service.host}:${config.consul.service.port}/health`,
      interval: '10s',
      timeout: '5s',
    },
  };
}

export async function cleanupTestServices (client: ConsulClient, prefix: string = 'test-'): Promise<void> {
  try {
    const services = await client.agent.serviceList();
    for (const id of Object.keys(services)) {
      if (id.startsWith(prefix)) {
        await client.agent.serviceDeregister(id);
      }
    }
  } catch (err) {
    console.warn('Failed to cleanup test services:', err);
  }
}
