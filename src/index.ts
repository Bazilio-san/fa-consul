export { AccessPoints } from './access-points/access-points';
export { accessPointsUpdater } from './access-points/access-points-updater';
export { getAPI } from './get-api';
export { getRegisterConfig, getServiceID } from './get-register-config';
export { getConsulApiCached, prepareConsulAPI } from './prepare-consul-api';
export { getFQDN, getFQDNCached } from './lib/fqdn';
export { substitutePercentBracket } from './lib/utils';
export { checkAccessPointAvailability, isHttpAvailable } from './access-points/access-points-utils';
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
} from './interfaces';

// Export new consul-client types for advanced usage
export { ConsulClient, ConsulHttpClient } from './consul-client';
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
} from './consul-client';
