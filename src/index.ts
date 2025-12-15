export { AccessPoints } from './access-points/access-points.js';
export { accessPointsUpdater } from './access-points/access-points-updater.js';
export { getAPI } from './get-api.js';
export { getRegisterConfig, getServiceID } from './get-register-config.js';
export { getConsulApiCached, prepareConsulAPI } from './prepare-consul-api.js';
export { getFQDN, getFQDNCached } from './lib/fqdn.js';
export { substitutePercentBracket } from './lib/utils.js';
export { checkAccessPointAvailability, isHttpAvailable } from './access-points/access-points-utils.js';
export type {
  IAFConfig,
  ICache,
  ICLOptions,
  IConsulAgentConfig,
  IConsulAgentOptions,
  IConsulAPI,
  ICyclicStartArgs,
  IRegisterConfig,
  IRegisterCyclic,
  IAccessPoint,
  IAccessPoints,
  IAPIArgs,
  IAFConsulAPI,
  IAFConsulConfig,
  IConsulServiceInfo,
  IFullConsulAgentConfig,
  IFullConsulAgentOptions,
  IConsulNodeInfo,
  IMeta,
  IRegisterCheck,
  IConsulHealthServiceInfo,
  ISocketInfo,
  ILogger,
  IRegisterOptions,
  TRegisterResult,
  TCommonFnResult,
  TRegisterType,
  TLoggerMethod,
  Maybe,
  Nullable,
  TBooleanLike,
} from './interfaces.js';

// Export new consul-client types for advanced usage
export { ConsulClient, ConsulHttpClient } from './consul-client/index.js';
export type {
  ConsulClientOptions,
  RegisterCheck,
  RegisterServiceOptions,
  ServiceInfo,
  NodeInfo,
  HealthCheck,
  HealthServiceInfo,
  AgentMember,
  RequestInfo,
  ResponseInfo,
  OnRequestHook,
  OnResponseHook,
} from './consul-client/index.js';
