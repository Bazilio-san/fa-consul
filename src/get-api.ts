 
// noinspection JSUnusedGlobalSymbols

import { CONSUL_DEBUG_ON, MAX_API_CACHED, PREFIX } from './constants.js';
import { getRegisterCyclic } from './cyclic-register.js';
import { getRegisterConfig } from './get-register-config.js';
import { IAFConsulAPI, ICache, ICLOptions, IConsulAgentOptions, IConsulAPI, TRegisterType } from './interfaces.js';
import { magenta, reset, yellow } from './lib/color.js';
import { getConfigHash } from './lib/hash.js';
import { minimizeCache } from './lib/utils.js';
import { getConsulApiCached } from './prepare-consul-api.js';

export { accessPointsUpdater } from './access-points/access-points-updater.js';

const defaultGetConsulUIAddress = (serviceId: string): string => {
  const { NODE_ENV, CONSUL_UI_HOST, CONSUL_DC_PROD, CONSUL_DC_DEV } = process.env;
  const p = NODE_ENV === 'production';
  return `https://${CONSUL_UI_HOST || ''}/ui/dc-${p ? (CONSUL_DC_PROD || 'prd') : (CONSUL_DC_DEV || 'dev')}/services/${serviceId}/instances`;
};

const debug = (msg: string) => {
  if (CONSUL_DEBUG_ON) {
    console.log(`${magenta}${PREFIX}${reset}: ${msg}`);
  }
};

// cached

export const apiCache: ICache<IAFConsulAPI> = {};

export const getAPI = async (options: ICLOptions): Promise<IAFConsulAPI> => {
  const hash = getConfigHash(options);
  if (!apiCache[hash]) {
    const api: IConsulAPI = await getConsulApiCached(options) as IAFConsulAPI;
    const registerConfig = await getRegisterConfig(options);
    const serviceId = registerConfig.id;
    minimizeCache(apiCache, MAX_API_CACHED);

    const consulUI = (options.getConsulUIAddress || defaultGetConsulUIAddress)(serviceId);
    debug(`${yellow} REGISTER CONFIG:\n${JSON.stringify(registerConfig, undefined, 2)}\n${reset}`);
    debug(`Consul UI: ${consulUI}`);

    const value = {
      registerConfig,
      serviceId,
      register: {
        once: async (registerType: TRegisterType = 'if-not-registered') => api.registerService(registerConfig, { registerType }),
        cyclic: getRegisterCyclic(options, api, registerConfig),
      },
      deregister: (svcId?: string, agentOptions?: IConsulAgentOptions) => api.deregisterIfNeed(svcId || serviceId, agentOptions),
      consulUI,
    } as IAFConsulAPI;

    Object.entries(api).forEach(([k, v]) => {
      // @ts-ignore
      value[k] = typeof v === 'function' ? v.bind(api) : v;
    });

    apiCache[hash] = { created: Date.now(), value };
  }
  return apiCache[hash].value;
};
