// noinspection JSUnusedGlobalSymbols

import { getConsulAPI } from './get-consul-api.js';

const registerInConsul = async () => {
  const api = await getConsulAPI();
  const isRegistered = await api.register.once();
  if (isRegistered) {
    console.log(`Registered ${api.serviceId}`);
  }
};
registerInConsul().then((r) => r);
export { registerInConsul };
