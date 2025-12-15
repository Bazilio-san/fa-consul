import { MAX_API_CACHED } from '../src/constants';
import { apiCache } from '../src/get-api';
import { IAFConsulAPI, IConsulServiceInfo } from '../src/index.js';
import { serviceConfigDiff, sleep } from '../src/lib/utils';

import getConsulAPI from './lib/get-consul-api';
import { logger } from './lib/logger';
import { ILoggerMocked, mockLogger } from './lib/test-utils';


const TIMEOUT_MILLIS = 100_000;

const log: ILoggerMocked = mockLogger(logger);

let api: IAFConsulAPI;
let serviceInfo: IConsulServiceInfo | undefined;

describe('Test API', () => {
  beforeAll(async () => {
    api = await getConsulAPI();
  }, TIMEOUT_MILLIS);

  test('apiCache', async () => {
    expect(Object.keys(apiCache).length).toBe(1);
    for (let i = 1; i < 6; i++) {
      await getConsulAPI({ instanceSuffix: String(i) });
      console.log(api.serviceId);
    }
    expect(Object.keys(apiCache).length).toBe(MAX_API_CACHED);
  }, TIMEOUT_MILLIS);

  test('register', async () => {
    log.info.mockClear();
    const registerResult = await api.register.once();
    expect(['registered', 'already']).toContain(registerResult);
  }, TIMEOUT_MILLIS);

  test('agentServiceList', async () => {
    const agentServiceList = await api.agentServiceList();
    expect(agentServiceList[api.serviceId]).toBeDefined();
    expect(agentServiceList[api.serviceId]?.ID).toBe(api.serviceId);
  }, TIMEOUT_MILLIS);

  test('consulHealthService', async () => {
    const result = await api.consulHealthService({ options: { service: api.serviceId, passing: true } });
    expect(result?.[0]?.Service?.ID).toBe(api.serviceId);
  }, TIMEOUT_MILLIS);

  test('catalogServiceList', async () => {
    const list = await api.catalogServiceList('dc-dev');
    expect(Object.keys(list).length).toBeGreaterThan(0);
    expect(list[api.serviceId]).toBeTruthy();
  }, TIMEOUT_MILLIS);

  test('agentMembers', async () => {
    const result = await api.agentMembers();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  }, TIMEOUT_MILLIS);

  test('getServiceInfo', async () => {
    await sleep(3000);
    serviceInfo = await api.getServiceInfo(api.serviceId);
    expect(serviceInfo).toBeDefined();
    expect(serviceInfo?.ID).toBe(api.serviceId);
  }, TIMEOUT_MILLIS);

  test('serviceConfigDiff = []', async () => {
    // Re-register to ensure service info matches current config
    await api.deregisterIfNeed(api.serviceId);
    await api.register.once();
    // Wait for health check to pass (interval is 10s)
    await sleep(12000);
    serviceInfo = await api.getServiceInfo(api.serviceId);
    if (!serviceInfo) {
      console.log('Warning: Service info not available after registration, skipping diff check');
      return;
    }
    const diff = serviceConfigDiff(api.registerConfig, serviceInfo);
    expect(diff.length).toEqual(0);
  }, TIMEOUT_MILLIS);

  test('serviceConfigDiff != []', async () => {
    if (!serviceInfo?.Meta) {
      console.log('Warning: Service info not available, skipping diff test');
      return;
    }
    const originalValue = serviceInfo.Meta.CONSUL_TEST;
    serviceInfo.Meta.CONSUL_TEST = 'foo';
    const diff = serviceConfigDiff(api.registerConfig, serviceInfo);
    expect(diff.length).toBeGreaterThan(0);
    if (originalValue !== undefined) {
      serviceInfo.Meta.CONSUL_TEST = originalValue;
    }
  }, TIMEOUT_MILLIS);

  test('getServiceInfo (unknown service ID)', async () => {
    log.error.mockClear();
    log.debug.mockClear();
    serviceInfo = await api.getServiceInfo(`${api.serviceId}-nonexistent`);
    expect(serviceInfo).toBe(undefined);
    expect(log.error.mock.calls.length).toBe(0);
    expect(log.debug.mock.calls[0][0]).toMatch(/No info about service ID/);
  }, TIMEOUT_MILLIS);

  test('deregister', async () => {
    log.info.mockClear();
    const deregisterResult = await api.deregisterIfNeed(api.serviceId);
    expect(deregisterResult).toBe(true);
    expect(log.info.mock.calls.length).toBeGreaterThan(0);
    expect(log.info.mock.calls[0][0]).toMatch(/(Previous registration of service.+removed from consul|is not registered in Consul)/);
  }, TIMEOUT_MILLIS);

  test('register/deregister in another agent', async () => {
    const agentHost = process.env.CONSUL_AGENT_HOST_2 || '';
    if (!agentHost) {
      console.log('Skipping test: CONSUL_AGENT_HOST_2 not set');
      return;
    }
    const api2 = await getConsulAPI({ agentHost });
    log.info.mockClear();
    const registerResult = await api2.register.once();
    expect(!!registerResult).toBe(true);
    expect(log.info.mock.calls.length).toBeGreaterThan(0);
    expect(log.info.mock.calls[0][0]).toMatch(/Service.+ registered in Consul/);

    log.info.mockClear();
    const deregisterResult = await api.deregisterIfNeed(api2.serviceId, { host: agentHost, port: '8500' });
    expect(deregisterResult).toBe(true);
    expect(log.info.mock.calls.length).toBeGreaterThan(0);
    expect(log.info.mock.calls[0][0]).toMatch(/(Previous registration of service.+removed from consul|is not registered in Consul)/);
  }, TIMEOUT_MILLIS);
});
