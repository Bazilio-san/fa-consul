import { RequestInfo } from '../consul-client/index.js';

const getHttpRequestText = (request: RequestInfo) => {
  const { hostname, port, path, method, headers, body } = request;
  let res = `###\n${method} ${request.protocol}//${hostname}${port ? `:${port}` : ''}${path}`;

  Object.entries(headers)
    .forEach(([headerName, value]) => {
      if (headerName !== 'content-length' && headerName !== 'Content-Length') {
        res += `\n${headerName}: ${value}`;
      }
    });

  if ((method === 'POST' || method === 'PUT') && body) {
    try {
      res += `\n\n${JSON.stringify(JSON.parse(body), undefined, 2)}`;
    } catch {
      res += `\n\n${body}`;
    }
  }
  return res;
};

export { getHttpRequestText };
