/* eslint-disable no-console */
// noinspection UnnecessaryLocalVariableJS,JSUnusedGlobalSymbols

import { Mutex } from 'async-mutex';

import { CONSUL_DEBUG_ON, DEBUG, MAX_API_CACHED, PREFIX } from './constants';
import { ConsulClient, RequestInfo, ResponseInfo } from './consul-client';
import {
  IAPIArgs,
  ICache,
  ICLOptions,
  IConsulAgentConfig,
  IConsulAgentOptions,
  IConsulAPI,
  IConsulHealthServiceInfo,
  IConsulServiceInfo,
  IFullConsulAgentConfig,
  IFullConsulAgentOptions,
  ILogger,
  IRegisterConfig,
  IRegisterOptions,
  ISocketInfo,
  TRegisterResult,
} from './interfaces';
import { blue, cyan, magenta, reset, yellow } from './lib/color';
import { getCurlText } from './lib/curl-text';
import { getFQDNCached } from './lib/fqdn';
import { getConfigHash } from './lib/hash';
import getHttpRequestText from './lib/http-request-text';
import loggerStub from './lib/logger-stub';
import { minimizeCache, parseBoolean, serviceConfigDiff } from './lib/utils';

const mutex = new Mutex();

const dbg = {
  on: CONSUL_DEBUG_ON,
  curl: /fa-consul:curl/i.test(DEBUG),
};
const debug = (msg: string) => {
  if (dbg.on) {
    console.log(`${magenta}${PREFIX}${reset}: ${msg}`);
  }
};

const agentTypeS = Symbol.for('agentType');

const consulConfigTypes = ['reg', 'dev', 'prd'] as (keyof IFullConsulAgentConfig)[];

const getConsulAgentOptions = async (clOptions: ICLOptions): Promise<IFullConsulAgentOptions> => {
  const {
    agent,
    service,
  } = clOptions.config.consul;

  const secure_ = parseBoolean(agent.reg.secure);
  const result: IFullConsulAgentOptions = {} as IFullConsulAgentOptions;
  const reg: IConsulAgentOptions = {
    host: agent.reg.host || (await getFQDNCached()) || process.env.HOST_HOSTNAME || service?.host || '127.0.0.1',
    port: String(agent.reg.port || (secure_ ? 433 : 8500)),
    secure: secure_,
    ...(agent.reg.token ? { defaults: { token: agent.reg.token } } : {}),
  };
  result.reg = reg;

  (['dev', 'prd'] as (keyof IFullConsulAgentConfig)[]).forEach((id) => {
    if (agent[id]) {
      const {
        host,
        port,
        secure,
        token,
        dc,
      } = agent[id] as IConsulAgentConfig;
      const agentOpts: IConsulAgentOptions = {
        host: String(host || reg.host),
        port: String(port || reg.port),
        secure: parseBoolean(secure == null ? reg.secure : secure),
        ...(token ? { defaults: { token } } : (reg.defaults ? { defaults: reg.defaults } : {})),
        ...(dc ? { dc } : {}),
      };
      result[id] = agentOpts;
    } else {
      result[id] = { ...reg };
    }
  });
  consulConfigTypes.forEach((id) => {
    if (!Number(result[id].port)) {
      throw new Error(`The port for consul agent[${id}] is invalid: [${result[id].port}]`);
    }
    // @ts-ignore
    result[id][agentTypeS] = id;
  });
  return result;
};

export const prepareConsulAPI = async (clOptions: ICLOptions): Promise<IConsulAPI> => {
  let logger = (clOptions.logger || loggerStub) as ILogger;
  if (!logger?.info) {
    logger = loggerStub;
  }
  const fullConsulAgentOptions: IFullConsulAgentOptions = await getConsulAgentOptions(clOptions);
  if (dbg.on) {
    debug(`CONSUL AGENT OPTIONS:\n${JSON.stringify(fullConsulAgentOptions, undefined, 2)}`);
  }

  const consulInstances = {} as { reg: ConsulClient, dev: ConsulClient, prd: ConsulClient };
  consulConfigTypes.forEach((id) => {
    const consulAgentOptions = fullConsulAgentOptions[id];
    const consulInstance = new ConsulClient(consulAgentOptions);
    // @ts-ignore
    consulInstance[agentTypeS] = id;

    consulInstances[id] = consulInstance;

    consulInstance.onRequest((request: RequestInfo) => {
      if (dbg.on) {
        const msg = dbg.curl ? getCurlText(request) : getHttpRequestText(request);
        debug(`[${request.id}] ${yellow}${msg}${reset}`);
      }
    });

    consulInstance.onResponse((request: RequestInfo, response: ResponseInfo) => {
      const rqId = `[${request.id}] `;
      try {
        const { statusCode = 0, body = null } = response || {};
        debug(`${rqId}HTTP Status: ${statusCode}`);
        if (statusCode > 299) {
          if (body) {
            logger.error(`${rqId}[CONSUL] ERROR: ${JSON.stringify(body)}`);
          } else {
            debug(`${rqId}response.body not found!`);
          }
        }
      } catch (err: Error | any) {
        logger.error(`ERROR (onResponse ${rqId}): \n  err.message: ${err.message}\n  err.stack:\n${err.stack}\n`);
      }
    });
  });

  const getAgentTypeByServiceID = (serviceId: string): keyof IFullConsulAgentConfig => {
    const agentType = serviceId.substring(0, 3);
    return (/(dev|prd)/.test(agentType) ? agentType : 'reg') as keyof IFullConsulAgentConfig;
  };
  const getAgentOptionsByServiceID = (serviceId: string): IConsulAgentOptions => fullConsulAgentOptions[getAgentTypeByServiceID(serviceId)];
  const getConsulInstanceByServiceID = (serviceId: string): ConsulClient => consulInstances[getAgentTypeByServiceID(serviceId)];

  const createConsulClientFromOptions = (agentOptions: IConsulAgentOptions): ConsulClient => new ConsulClient(agentOptions);

  const api = {
    // Returns the services the agent is managing.  - список сервисов на этом агенте
    async agentServiceList (apiArgs: IAPIArgs = {}) {
      // ### GET http://<*.host>:<*.port>/v1/agent/services
      let client: ConsulClient;
      if (apiArgs.agentOptions) {
        client = createConsulClientFromOptions(apiArgs.agentOptions);
      } else if (apiArgs.agentType) {
        client = consulInstances[apiArgs.agentType];
      } else {
        client = consulInstances.reg;
      }
      try {
        const result = await client.agent.serviceList();
        return result;
      } catch (err: Error | any) {
        logger.error(`[consul.agent.serviceList] ERROR:\n  err.message: ${err.message}\n  err.stack:\n${err.stack}\n`);
        return apiArgs.withError ? err : false;
      }
    },

    // Lists services in a given datacenter
    async catalogServiceList (dc: string, apiArgs: IAPIArgs = {}): Promise<{ [serviceId: string]: string[] }> {
      // ### GET https://<context.host>:<context.port>/v1/catalog/services?dc=<dc>
      let client: ConsulClient;
      if (apiArgs.agentOptions) {
        client = createConsulClientFromOptions(apiArgs.agentOptions);
      } else if (apiArgs.agentType) {
        client = consulInstances[apiArgs.agentType];
      } else {
        const agentType = (Object.entries(fullConsulAgentOptions)
          .find(([, v]) => v.dc === dc) || ['dev'])[0] as keyof IFullConsulAgentConfig;
        client = consulInstances[agentType];
      }
      try {
        const result = await client.catalog.serviceList(dc);
        return result;
      } catch (err: Error | any) {
        logger.error(`[consul.catalog.serviceList] ERROR:\n  err.message: ${err.message}\n  err.stack:\n${err.stack}\n`);
        return apiArgs.withError ? err : {};
      }
    },

    // Returns the nodes and health info of a service
    async consulHealthService (apiArgs: IAPIArgs): Promise<IConsulHealthServiceInfo[]> {
      // ### GET https://<context.host>:<context.port>/v1/health/service/<apiArgs.options.serviceId>?passing=true&dc=<apiArgs.options.dc || context.dc>
      const {
        service: serviceId,
        dc,
        passing,
      } = apiArgs.options;

      let dcToUse = dc;
      if (!dcToUse) {
        const agentOptions = getAgentOptionsByServiceID(serviceId);
        dcToUse = agentOptions.dc || undefined;
      }

      let client: ConsulClient;
      if (apiArgs.agentOptions) {
        client = createConsulClientFromOptions(apiArgs.agentOptions);
      } else if (apiArgs.agentType) {
        client = consulInstances[apiArgs.agentType];
      } else {
        client = getConsulInstanceByServiceID(serviceId);
      }

      try {
        const result = await client.health.service({
          service: serviceId,
          dc: dcToUse,
          passing,
        });
        return result as IConsulHealthServiceInfo[];
      } catch (err: Error | any) {
        logger.error(`[consul.health.service] ERROR:\n  err.message: ${err.message}\n  err.stack:\n${err.stack}\n`);
        return apiArgs.withError ? err : [];
      }
    },

    async getServiceInfo (serviceName: string): Promise<IConsulServiceInfo | undefined> {
      // ### GET https://<context.host>:<context.port>/v1/health/service/<apiArgs.options.serviceId>?passing=true&dc=<apiArgs.options.dc || context.dc>
      const result = await this.consulHealthService({
        options: {
          service: serviceName,
          passing: true,
        },
      });
      const res = result?.[0]?.Service;
      if (!res) {
        logger.debug(`No info about service ID ${cyan}${serviceName}`);
      }
      return res;
    },

    async getServiceSocket (serviceName: string, defaults: ISocketInfo): Promise<ISocketInfo> {
      if (process.env.USE_DEFAULT_SERVICE_SOCKET) {
        return defaults;
      }
      // В функции consulHealthService используется агент dev/prd в зависимости от префикса
      const result: IConsulHealthServiceInfo[] = await this.consulHealthService({
        options: {
          service: serviceName,
          passing: true,
        },
      });
      if (!result || !result.length) {
        logger.warn(`CONSUL: No working service found: ${cyan}${serviceName}${reset}. Return defaults ${defaults.host}:${defaults.port}`);
        return defaults;
      }

      const service = result[0]?.Service;
      const nodeAddress = result[0]?.Node?.Node;
      const Address = service?.Address || nodeAddress;
      const Port = service?.Port;

      const host = await getFQDNCached(Address);
      return {
        host: host || Address || '',
        port: Port || 0,
      };
    },

    // Registers a new service.
    async agentServiceRegister (options: IRegisterConfig, withError: boolean = false): Promise<boolean> {
      // ### PUT http://<reg.host>:<reg.port>/v1/agent/service/register
      try {
        await consulInstances.reg.agent.serviceRegister(options);
        return true;
      } catch (err: Error | any) {
        logger.error(`[consul.agent.service.register] ERROR:\n  err.message: ${err.message}\n  err.stack:\n${err.stack}\n`);
        return withError ? err : false;
      }
    },

    // Deregister a service.
    async agentServiceDeregister (serviceId: string, apiArgs: IAPIArgs = {}): Promise<boolean> {
      // ### PUT http://<reg.host>:<reg.port>/v1/agent/service/deregister/<serviceId>
      let client: ConsulClient;
      if (apiArgs.agentOptions) {
        client = createConsulClientFromOptions(apiArgs.agentOptions);
      } else if (apiArgs.agentType) {
        client = consulInstances[apiArgs.agentType];
      } else {
        client = consulInstances.reg;
      }
      try {
        await client.agent.serviceDeregister(serviceId);
        return true;
      } catch (err: Error | any) {
        logger.error(`[consul.agent.service.deregister] ERROR:\n  err.message: ${err.message}\n  err.stack:\n${err.stack}\n`);
        return apiArgs.withError ? err : false;
      }
    },

    async deregisterIfNeed (serviceId: string, agentOptions?: IConsulAgentOptions): Promise<boolean> {
      const apiArgs: IAPIArgs = agentOptions ? { agentOptions } : {};
      const healthServiceInfo = await this.checkIfServiceRegistered(serviceId, apiArgs);
      if (healthServiceInfo) {
        const nodeHost = (healthServiceInfo.Node?.Node || '').toLowerCase()
          .split('.')[0] || '';
        const [agentType = 'reg'] = Object.entries(fullConsulAgentOptions)
          .find(([, aOpt]) => aOpt.host.toLowerCase()
            .startsWith(nodeHost)) || [];
        apiArgs.agentType = agentType as keyof IFullConsulAgentConfig;
        const isDeregister = await this.agentServiceDeregister(serviceId, apiArgs);

        const agentHost = fullConsulAgentOptions[agentType as keyof IFullConsulAgentConfig].host;
        const m = (wasnt: string = '') => `Previous registration of service '${cyan}${serviceId}${reset}'${wasnt} removed from consul agent ${blue}${agentHost}${reset}`;
        if (isDeregister) {
          logger.info(m());
        } else {
          logger.error(m(' was NOT'));
          return false;
        }
      } else {
        logger.info(`Service '${cyan}${serviceId}${reset}' is not registered in Consul`);
      }
      return true;
    },

    // Returns the members as seen by the consul agent. - список агентов (нод)
    agentMembers: async (apiArgs: IAPIArgs = {}) => {
      // ### GET http://<reg.host>:<reg.port>/v1/agent/members
      let client: ConsulClient;
      if (apiArgs.agentOptions) {
        client = createConsulClientFromOptions(apiArgs.agentOptions);
      } else if (apiArgs.agentType) {
        client = consulInstances[apiArgs.agentType];
      } else {
        client = consulInstances.reg;
      }
      try {
        const result = await client.agent.members();
        return result;
      } catch (err: Error | any) {
        logger.error(`[consul.agent.members] ERROR:\n  err.message: ${err.message}\n  err.stack:\n${err.stack}\n`);
        return apiArgs.withError ? err : false;
      }
    },

    async checkIfServiceRegistered (serviceIdOrName: string, apiArgs: IAPIArgs = {}): Promise<IConsulHealthServiceInfo | undefined> {
      if (!apiArgs.agentOptions && !apiArgs.agentType) {
        apiArgs.agentType = getAgentTypeByServiceID(serviceIdOrName);
      }
      const result = await this.consulHealthService({ ...apiArgs, options: { service: serviceIdOrName } });
      return result?.[0];
    },

    async registerService (registerConfig: IRegisterConfig, registerOptions: IRegisterOptions): Promise<TRegisterResult> {
      const serviceId = registerConfig.id || registerConfig.name;
      const srv = `Service '${cyan}${serviceId}${reset}'`;

      const serviceInfo = await this.getServiceInfo(serviceId);
      const diff = serviceConfigDiff(registerConfig, serviceInfo);
      const isAlreadyRegistered = !!serviceInfo;

      const already = (): TRegisterResult => {
        if (!registerOptions.noAlreadyRegisteredMessage) {
          if (dbg.on) {
            console.log(`${srv} already registered in Consul`);
          }
        }
        return 'already';
      };

      switch (registerOptions.registerType) {
        case 'if-config-differ': {
          if (!diff.length) {
            return already();
          }
          logger.info(`${srv}. Configuration difference detected. New: config.${diff[0]}=${diff[1]} / Current: config.${diff[2]}=${diff[3]}`);
          break;
        }
        case 'if-not-registered': {
          if (isAlreadyRegistered) {
            return already();
          }
          break;
        }
      }

      if (isAlreadyRegistered && registerOptions.deleteOtherInstance) {
        if (await this.agentServiceDeregister(serviceId)) {
          logger.info(`Previous registration of ${srv} removed from Consul`);
        }
      }
      const isJustRegistered = await this.agentServiceRegister(registerConfig);
      if (isJustRegistered) {
        if (dbg.on) {
          logger.info(`${srv} is registered in Consul`);
        }
      } else {
        logger.error(`${srv} is NOT registered in Consul`);
      }
      return isJustRegistered ? 'just' : false;
    },
    agentOptions: fullConsulAgentOptions,
    getConsulAgentOptions,
  };
  return api;
};

const consulApiCache: ICache<IConsulAPI> = {};

export const getConsulApiCached = async (clOptions: ICLOptions): Promise<IConsulAPI> => mutex
  .runExclusive<IConsulAPI>(async () => {
    const hash = getConfigHash(clOptions);
    if (!consulApiCache[hash]) {
      minimizeCache(consulApiCache, MAX_API_CACHED);
      const value = await prepareConsulAPI(clOptions);
      consulApiCache[hash] = {
        created: Date.now(),
        value,
      };
    }
    return consulApiCache[hash].value;
  });
