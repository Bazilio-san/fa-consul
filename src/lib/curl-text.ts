import { RequestInfo } from '../consul-client/index.js';

class ToCurl {
  private readonly request: {
    method: string;
    headers: Record<string, string>;
    url: string;
    params?: Record<string, string | boolean | undefined> | undefined;
    data?: unknown;
  };

  constructor (req: RequestInfo) {
    let data: unknown;
    if (req.body) {
      try {
        data = JSON.parse(req.body);
      } catch {
        data = req.body;
      }
    }
    this.request = {
      method: req.method,
      headers: req.headers,
      url: req.url.split('?')[0] || req.url,
      ...(req.query ? { params: req.query } : {}),
      ...(data !== undefined ? { data } : {}),
    };
  }

  getHeaders () {
    const { headers } = this.request;
    let curlHeaders = '';

    Object.keys(headers).forEach((property) => {
      if ({}.hasOwnProperty.call(headers, property)) {
        if (property !== 'content-length' && property !== 'Content-Length') {
          curlHeaders += ` -H "${property}:${headers[property]}"`;
        }
      }
    });

    return curlHeaders.trim();
  }

  getMethod () {
    return `-X ${this.request.method.toUpperCase()}`;
  }

  getBody () {
    const r = this.request;
    const { data } = r;
    if (
      typeof data !== 'undefined'
      && data !== ''
      && data !== null
      && r.method.toUpperCase() !== 'GET'
    ) {
      const d = typeof data === 'object' || Object.prototype.toString.call(data) === '[object Array]'
        ? JSON.stringify(data, undefined, 2)
        : data;
      return `--data '${d}'`;
    }
    return '';
  }

  getUrl () {
    return this.request.url;
  }

  getQueryString () {
    const { params } = this.request;
    if (!params) {return '';}

    return Object.keys(params)
      .filter((param) => params[param] !== undefined && params[param] !== '')
      .reduce((qs, param) => `${qs}${qs ? '&' : '?'}${param}=${params[param]}`, '');
  }

  getBuiltURL () {
    return (this.getUrl() + this.getQueryString()).trim();
  }

  getCURL () {
    return `curl -i ${this.getMethod()} "${this.getBuiltURL()}" ${this.getHeaders()} ${this.getBody()}`;
  }
}

export const getCurlText = (req: RequestInfo) => {
  const instance = new ToCurl(req);
  return instance.getCURL();
};
