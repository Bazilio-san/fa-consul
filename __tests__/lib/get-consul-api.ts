import 'dotenv/config';
import { cloneDeep } from 'af-tools-ts';
import nodeConfig from 'config';

import { IAFConsulAPI, getAPI } from '../../src/index.js';

import { logger } from './logger.js';

const config = nodeConfig.util.toObject() as any;

export const getConsulAPI = async ({ instanceSuffix, agentHost, serviceName }: {
  instanceSuffix?: string, agentHost?: string, serviceName?: string
} = {}): Promise<IAFConsulAPI> => {
  const config_ = cloneDeep(config);
  if (instanceSuffix) {
    config_.consul.service.instance += instanceSuffix;
  } else {
    config_.consul.service.instance = config.consul.service.instance;
  }
  if (agentHost) {
    config_.consul.agent.reg.host = agentHost;
  }
  if (serviceName) {
    config_.consul.service.name = serviceName;
  }
  const api = await getAPI(
    {
      config: config_,
      logger,
      envCode: process.env.PROJECT_ID || 'proj',
    },
  );
  config.service = config_.service;
  return api;
};
