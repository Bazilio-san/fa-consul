# Migration Plan: Replace `consul` npm Package with Native HTTP API

## Executive Summary

Replace the deprecated `consul` npm package (v1.2.0) with direct Consul HTTP API calls using native Node.js `fetch` 
(or `http`/`https` modules for Node.js < 18). This eliminates dependency on third-party packages and provides full control over API interactions.

---

## 1. Current State Analysis

### 1.1 Dependencies to Remove
```json
{
  "dependencies": {
    "@types/consul": "^0.40.2",  // REMOVE
    "consul": "^1.2.0"           // REMOVE
  }
}
```

### 1.2 Files Using `consul` Package

| File | Usage |
|------|-------|
| `src/interfaces.ts` | `import Consul from 'consul'` - Types: `Consul.Agent.Service.RegisterCheck`, `Consul.ConsulOptions`, `Consul.Consul` |
| `src/prepare-consul-api.ts` | `import Consul from 'consul'` - Creating consul instances, hooks `_ext('onRequest')`, `_ext('onResponse')` |

### 1.3 Consul API Endpoints Used

| Method | Current Code | HTTP API Endpoint |
|--------|--------------|-------------------|
| `agent.service.list` | `consul.agent.service.list()` | `GET /v1/agent/services` |
| `catalog.service.list` | `consul.catalog.service.list(dc)` | `GET /v1/catalog/services?dc={dc}` |
| `health.service` | `consul.health.service(options)` | `GET /v1/health/service/{service}?passing={passing}&dc={dc}` |
| `agent.service.register` | `consul.agent.service.register(options)` | `PUT /v1/agent/service/register` |
| `agent.service.deregister` | `consul.agent.service.deregister(id)` | `PUT /v1/agent/service/deregister/{id}` |
| `agent.members` | `consul.agent.members()` | `GET /v1/agent/members` |

### 1.4 DNS Discovery Status
**NOT USED** - The project uses `dns` module only for FQDN resolution (`src/lib/fqdn.ts`), not for Consul DNS service discovery.

### 1.5 Usage in External Projects (fa-mcp-sdk)

Example of typical usage pattern from `fa-mcp-sdk`:

```typescript
// get-consul-api.ts
import { getAPI } from 'af-consul-ts';

export const getConsulAPI = async () => {
  return getAPI({
    config: appConfig,
    logger,
    em: eventEmitter,
    envCode: isProd ? appConfig.consul.envCode.prod : appConfig.consul.envCode.dev,
    getConsulUIAddress: (serviceId: string) => `...`,
  });
};

// register.ts
import { getConsulAPI } from './get-consul-api.js';

export const registerCyclic = async () => {
  const api = await getConsulAPI();
  return api.register.cyclic;
};

// deregister.ts
const { deregister } = await getConsulAPI();
await deregister(svcId, options);

// access-points-updater.ts
import { accessPointsUpdater } from 'af-consul-ts';

accessPointsUpdater.start({ config: appConfig, logger, em: eventEmitter }, 10_000);
accessPointsUpdater.stop();
```

**Key exports used**:
- `getAPI()` - Main API factory
- `accessPointsUpdater.start()/stop()` - Access points lifecycle
- `api.register.cyclic` - Cyclic registration
- `api.deregister()` - Service deregistration

---

## 2. New Architecture

### 2.1 New File Structure
```
src/
├── consul-client/
│   ├── index.ts              # Main client export
│   ├── http-client.ts        # Low-level HTTP client with hooks
│   ├── types.ts              # All Consul-related types (replaces @types/consul)
│   ├── endpoints/
│   │   ├── agent.ts          # Agent API methods
│   │   ├── catalog.ts        # Catalog API methods
│   │   └── health.ts         # Health API methods
│   └── utils.ts              # Query string builder, error handling
```

### 2.2 Type Definitions (Replace @types/consul)

```typescript
// src/consul-client/types.ts

// ================== Connection Options ==================
export interface ConsulClientOptions {
  host: string;
  port: string | number;
  secure?: boolean;
  token?: string;
  dc?: string;
  timeout?: number;
}

// ================== Register Service ==================
export interface RegisterCheck {
  name?: string;
  http?: string;
  tcp?: string;
  script?: string;
  shell?: string;
  dockercontainerid?: string;
  interval?: string;
  timeout?: string;
  ttl?: string;
  notes?: string;
  status?: string;
  deregistercriticalserviceafter?: string;
}

export interface RegisterServiceOptions {
  id?: string;
  name: string;
  tags?: string[];
  address?: string;
  port?: number;
  meta?: Record<string, string>;
  check?: RegisterCheck;
  checks?: RegisterCheck[];
  connect?: Record<string, unknown>;
  proxy?: Record<string, unknown>;
  taggedAddresses?: Record<string, unknown>;
  weights?: { passing?: number; warning?: number };
  enableTagOverride?: boolean;
}

// ================== Service Info ==================
export interface ServiceInfo {
  ID: string;
  Service: string;
  Tags?: string[];
  Meta?: Record<string, string>;
  Port: number;
  Address: string;
  Weights?: { Passing: number; Warning: number };
  EnableTagOverride?: boolean;
  Datacenter?: string;
  Proxy?: Record<string, unknown>;
  Connect?: Record<string, unknown>;
  CreateIndex?: number;
  ModifyIndex?: number;
}

// ================== Health Service ==================
export interface NodeInfo {
  ID: string;
  Node?: string;
  Address: string;
  Datacenter?: string;
  TaggedAddresses?: Record<string, string>;
  Meta?: Record<string, string>;
  CreateIndex?: number;
  ModifyIndex?: number;
}

export interface HealthCheck {
  Node: string;
  CheckID: string;
  Name: string;
  Status: 'passing' | 'warning' | 'critical';
  Notes?: string;
  Output?: string;
  ServiceID?: string;
  ServiceName?: string;
  ServiceTags?: string[];
  Type?: string;
  Definition?: Record<string, unknown>;
  CreateIndex?: number;
  ModifyIndex?: number;
}

export interface HealthServiceInfo {
  Node?: NodeInfo;
  Service?: ServiceInfo;
  Checks?: HealthCheck[];
}

// ================== Agent Members ==================
export interface AgentMember {
  Name: string;
  Addr: string;
  Port: number;
  Tags?: Record<string, string>;
  Status: number;
  ProtocolMin: number;
  ProtocolMax: number;
  ProtocolCur: number;
  DelegateMin: number;
  DelegateMax: number;
  DelegateCur: number;
}

// ================== Request/Response Hooks ==================
export interface RequestInfo {
  id: number;
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  timestamp: number;
}

export interface ResponseInfo {
  requestId: number;
  statusCode: number;
  body?: unknown;
  timestamp: number;
}

export type OnRequestHook = (request: RequestInfo) => void;
export type OnResponseHook = (request: RequestInfo, response: ResponseInfo) => void;
```

### 2.3 HTTP Client Implementation

```typescript
// src/consul-client/http-client.ts

import * as http from 'http';
import * as https from 'https';
import { ConsulClientOptions, RequestInfo, ResponseInfo, OnRequestHook, OnResponseHook } from './types';

export class ConsulHttpClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly timeout: number;
  private readonly httpModule: typeof http | typeof https;

  private requestCounter = 0;
  private onRequestHooks: OnRequestHook[] = [];
  private onResponseHooks: OnResponseHook[] = [];

  constructor(options: ConsulClientOptions) {
    const protocol = options.secure ? 'https' : 'http';
    const port = options.port || (options.secure ? 443 : 8500);
    this.baseUrl = `${protocol}://${options.host}:${port}/v1`;
    this.httpModule = options.secure ? https : http;
    this.timeout = options.timeout || 30000;

    this.headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (options.token) {
      this.headers['X-Consul-Token'] = options.token;
    }
  }

  onRequest(hook: OnRequestHook): void {
    this.onRequestHooks.push(hook);
  }

  onResponse(hook: OnResponseHook): void {
    this.onResponseHooks.push(hook);
  }

  private buildQueryString(params?: Record<string, string | boolean | undefined>): string {
    if (!params) return '';
    const entries = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    return entries.length ? `?${entries.join('&')}` : '';
  }

  async request<T>(
    method: 'GET' | 'PUT' | 'POST' | 'DELETE',
    path: string,
    options?: {
      query?: Record<string, string | boolean | undefined>;
      body?: unknown;
      skipCodes?: number[];
    }
  ): Promise<T> {
    const requestId = ++this.requestCounter;
    const url = `${this.baseUrl}${path}${this.buildQueryString(options?.query)}`;
    const body = options?.body ? JSON.stringify(options.body) : undefined;

    const requestInfo: RequestInfo = {
      id: requestId,
      method,
      url,
      headers: { ...this.headers },
      body,
      timestamp: Date.now(),
    };

    // Emit onRequest hooks
    this.onRequestHooks.forEach(hook => hook(requestInfo));

    return new Promise<T>((resolve, reject) => {
      const urlObj = new URL(url);

      const reqOptions: http.RequestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method,
        headers: {
          ...this.headers,
          ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
        },
        timeout: this.timeout,
      };

      const req = this.httpModule.request(reqOptions, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          const statusCode = res.statusCode || 0;
          let parsedBody: unknown;

          try {
            parsedBody = data ? JSON.parse(data) : null;
          } catch {
            parsedBody = data;
          }

          const responseInfo: ResponseInfo = {
            requestId,
            statusCode,
            body: parsedBody,
            timestamp: Date.now(),
          };

          // Emit onResponse hooks
          this.onResponseHooks.forEach(hook => hook(requestInfo, responseInfo));

          if (statusCode >= 200 && statusCode < 300) {
            resolve(parsedBody as T);
          } else if (options?.skipCodes?.includes(statusCode)) {
            resolve(parsedBody as T);
          } else {
            reject(new Error(`Consul API error: ${statusCode} - ${JSON.stringify(parsedBody)}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout: ${url}`));
      });

      if (body) {
        req.write(body);
      }
      req.end();
    });
  }

  async get<T>(path: string, query?: Record<string, string | boolean | undefined>): Promise<T> {
    return this.request<T>('GET', path, { query });
  }

  async put<T>(path: string, body?: unknown, query?: Record<string, string | boolean | undefined>): Promise<T> {
    return this.request<T>('PUT', path, { query, body });
  }
}
```

### 2.4 Agent API Implementation

```typescript
// src/consul-client/endpoints/agent.ts

import { ConsulHttpClient } from '../http-client';
import { ServiceInfo, RegisterServiceOptions, AgentMember } from '../types';

export class AgentAPI {
  constructor(private client: ConsulHttpClient) {}

  /**
   * GET /v1/agent/services
   * Returns all services registered with the local agent
   */
  async serviceList(): Promise<Record<string, ServiceInfo>> {
    return this.client.get<Record<string, ServiceInfo>>('/agent/services');
  }

  /**
   * PUT /v1/agent/service/register
   * Registers a new service with the local agent
   */
  async serviceRegister(options: RegisterServiceOptions): Promise<void> {
    // Convert to Consul API format (PascalCase)
    const body = {
      ID: options.id,
      Name: options.name,
      Tags: options.tags,
      Address: options.address,
      Port: options.port,
      Meta: options.meta,
      Check: options.check ? this.formatCheck(options.check) : undefined,
      Checks: options.checks?.map(c => this.formatCheck(c)),
      Connect: options.connect,
      Proxy: options.proxy,
      TaggedAddresses: options.taggedAddresses,
      Weights: options.weights,
      EnableTagOverride: options.enableTagOverride,
    };

    await this.client.put<void>('/agent/service/register', body);
  }

  /**
   * PUT /v1/agent/service/deregister/:service_id
   * Deregisters a service from the local agent
   */
  async serviceDeregister(serviceId: string): Promise<void> {
    await this.client.put<void>(`/agent/service/deregister/${encodeURIComponent(serviceId)}`);
  }

  /**
   * GET /v1/agent/members
   * Returns the members the agent sees in the cluster
   */
  async members(options?: { wan?: boolean; segment?: string }): Promise<AgentMember[]> {
    return this.client.get<AgentMember[]>('/agent/members', {
      wan: options?.wan,
      segment: options?.segment,
    });
  }

  private formatCheck(check: RegisterServiceOptions['check']): Record<string, unknown> | undefined {
    if (!check) return undefined;
    return {
      Name: check.name,
      HTTP: check.http,
      TCP: check.tcp,
      Script: check.script,
      Shell: check.shell,
      DockerContainerID: check.dockercontainerid,
      Interval: check.interval,
      Timeout: check.timeout,
      TTL: check.ttl,
      Notes: check.notes,
      Status: check.status,
      DeregisterCriticalServiceAfter: check.deregistercriticalserviceafter,
    };
  }
}
```

### 2.5 Health API Implementation

```typescript
// src/consul-client/endpoints/health.ts

import { ConsulHttpClient } from '../http-client';
import { HealthServiceInfo } from '../types';

export class HealthAPI {
  constructor(private client: ConsulHttpClient) {}

  /**
   * GET /v1/health/service/:service
   * Returns the nodes and health info of a service
   */
  async service(options: {
    service: string;
    dc?: string;
    passing?: boolean;
    tag?: string;
    near?: string;
  }): Promise<HealthServiceInfo[]> {
    const { service, ...query } = options;
    return this.client.get<HealthServiceInfo[]>(
      `/health/service/${encodeURIComponent(service)}`,
      {
        dc: query.dc,
        passing: query.passing,
        tag: query.tag,
        near: query.near,
      }
    );
  }
}
```

### 2.6 Catalog API Implementation

```typescript
// src/consul-client/endpoints/catalog.ts

import { ConsulHttpClient } from '../http-client';

export class CatalogAPI {
  constructor(private client: ConsulHttpClient) {}

  /**
   * GET /v1/catalog/services
   * Returns all services in a datacenter
   */
  async serviceList(dc?: string): Promise<Record<string, string[]>> {
    return this.client.get<Record<string, string[]>>('/catalog/services', { dc });
  }
}
```

### 2.7 Main Client Export

```typescript
// src/consul-client/index.ts

import { ConsulHttpClient } from './http-client';
import { AgentAPI } from './endpoints/agent';
import { HealthAPI } from './endpoints/health';
import { CatalogAPI } from './endpoints/catalog';
import { ConsulClientOptions, OnRequestHook, OnResponseHook } from './types';

export class ConsulClient {
  private readonly httpClient: ConsulHttpClient;

  public readonly agent: AgentAPI;
  public readonly health: HealthAPI;
  public readonly catalog: CatalogAPI;

  constructor(options: ConsulClientOptions) {
    this.httpClient = new ConsulHttpClient(options);
    this.agent = new AgentAPI(this.httpClient);
    this.health = new HealthAPI(this.httpClient);
    this.catalog = new CatalogAPI(this.httpClient);
  }

  onRequest(hook: OnRequestHook): void {
    this.httpClient.onRequest(hook);
  }

  onResponse(hook: OnResponseHook): void {
    this.httpClient.onResponse(hook);
  }
}

export * from './types';
export { ConsulHttpClient } from './http-client';
```

---

## 3. Migration Steps

### Step 1: Create New Consul Client Module
1. Create `src/consul-client/` directory structure
2. Implement `types.ts` with all type definitions
3. Implement `http-client.ts` with request/response hooks
4. Implement endpoint files: `agent.ts`, `health.ts`, `catalog.ts`
5. Create `index.ts` with main `ConsulClient` export

### Step 2: Update `interfaces.ts`
Replace:
```typescript
import Consul from 'consul';

export interface IRegisterCheck extends Consul.Agent.Service.RegisterCheck {
  // ...
}

export interface IRegisterConfig extends Consul.Agent.Service.RegisterOptions {
  // ...
}

export interface IConsul extends Consul.Consul {
  // ...
}

export interface IConsulAgentOptions extends Consul.ConsulOptions {
  // ...
}
```

With:
```typescript
import { RegisterCheck, RegisterServiceOptions, ConsulClientOptions } from './consul-client';

export interface IRegisterCheck extends RegisterCheck {
  // ...
}

export interface IRegisterConfig extends RegisterServiceOptions {
  id: string;
  // ...
}

// Remove IConsul interface - replace with ConsulClient usage
// export interface IConsul ... - DELETE

export interface IConsulAgentOptions extends ConsulClientOptions {
  // ...
}
```

### Step 3: Update `prepare-consul-api.ts`
Replace consul package usage:
```typescript
// OLD
import Consul from 'consul';

const consulInstance: IConsul = new Consul(consulAgentOptions) as IConsul;

consulInstance._ext('onRequest', (request, next) => {
  // ...
  next();
});

// Method calls
await fn[method].call(fn, options);
```

With:
```typescript
// NEW
import { ConsulClient } from './consul-client';

const consulInstance = new ConsulClient(consulAgentOptions);

consulInstance.onRequest((request) => {
  // Log request
});

consulInstance.onResponse((request, response) => {
  // Log response
});

// Direct method calls
await consulInstance.agent.serviceList();
await consulInstance.health.service({ service: serviceName, passing: true });
```

### Step 4: Refactor API Methods
Update each method in `prepare-consul-api.ts`:

| Old Pattern | New Pattern |
|-------------|-------------|
| `common('agent.service.list', apiArgs)` | `client.agent.serviceList()` |
| `common('catalog.service.list', apiArgs)` | `client.catalog.serviceList(dc)` |
| `common('health.service', apiArgs)` | `client.health.service(options)` |
| `common('agent.service.register', apiArgs)` | `client.agent.serviceRegister(options)` |
| `common('agent.service.deregister', apiArgs)` | `client.agent.serviceDeregister(serviceId)` |
| `common('agent.members', apiArgs)` | `client.agent.members()` |

### Step 5: Update Debug Logging
Transform debug hooks from consul package format to new format:

```typescript
// NEW hook implementation
consulInstance.onRequest((request) => {
  if (dbg.on) {
    const msg = dbg.curl
      ? formatAsCurl(request)
      : formatAsHttp(request);
    debug(`[${request.id}] ${yellow}${msg}${reset}`);
  }
});

consulInstance.onResponse((request, response) => {
  const rqId = `[${request.id}] `;
  debug(`${rqId}HTTP Status: ${response.statusCode}`);
  if (response.statusCode > 299) {
    logger.error(`${rqId}CONSUL ERROR: ${JSON.stringify(response.body)}`);
  }
});
```

### Step 6: Update curl-text.ts and http-request-text.ts
Adapt these utility files to work with new `RequestInfo` type instead of consul internal request object.

### Step 7: Remove Dependencies
```bash
npm uninstall consul @types/consul
```

Update `package.json`:
```json
{
  "dependencies": {
    "af-tools-ts": "^1.1.5",
    "async-mutex": "^0.5.0",
    "xxhashjs": "^0.2.2"
  }
}
```

### Step 8: Update Tests
Update test files to work with new implementation.

---

## 4. API Compatibility Matrix

| Feature | Old (consul npm) | New (Native HTTP) | Notes |
|---------|------------------|-------------------|-------|
| Service List | `consul.agent.service.list()` | `client.agent.serviceList()` | Direct mapping |
| Service Register | `consul.agent.service.register(opts)` | `client.agent.serviceRegister(opts)` | Options format same |
| Service Deregister | `consul.agent.service.deregister(id)` | `client.agent.serviceDeregister(id)` | Direct mapping |
| Health Service | `consul.health.service(opts)` | `client.health.service(opts)` | Direct mapping |
| Catalog Services | `consul.catalog.service.list(dc)` | `client.catalog.serviceList(dc)` | Direct mapping |
| Agent Members | `consul.agent.members()` | `client.agent.members()` | Direct mapping |
| Request Hook | `consul._ext('onRequest', fn)` | `client.onRequest(fn)` | New signature |
| Response Hook | `consul._ext('onResponse', fn)` | `client.onResponse(fn)` | New signature |

---

## 5. Risk Assessment

### Low Risk
- Type definitions are well-documented in Consul HTTP API
- All endpoints are stable and versioned (/v1/)
- No breaking changes expected in Consul HTTP API

### Medium Risk
- Custom request/response hooks require testing
- Error handling behavior may differ slightly

### Mitigation
- Comprehensive test coverage before deployment
- Parallel testing with both implementations
- Gradual rollout with feature flags if needed

---

## 6. Alternative Approaches Considered

### Option A: Use undici/fetch
**Pros**: Modern, faster, built into Node.js 18+
**Cons**: Requires Node.js 18+, project supports Node.js 12+

### Option B: Use axios
**Pros**: Well-maintained, good types
**Cons**: Adds another dependency, overkill for simple REST calls

### Option C: Native http/https (Selected)
**Pros**: Zero dependencies, works on all Node.js versions, full control
**Cons**: Slightly more boilerplate

**Decision**: Option C selected for maximum compatibility and zero external dependencies.

---

## 7. Test Configuration

### 7.1 Test Config Files

Create `__tests__/config.yaml` (actual config, gitignored) and `__tests__/config.example.yaml` (template).

**File: `__tests__/config.example.yaml`** (commit to repo):
```yaml
consul:
  check:
    interval: "10s"
    timeout: "5s"
    deregistercriticalserviceafter: "3m"
  agent:
    dev:
      dc: "dc-dev"
      host: "consul.example.com"
      port: 443
      secure: true
      token: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    prd:
      dc: "dc-prd"
      host: "consul.example.com"
      port: 443
      secure: true
      token: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    reg:
      host: "localhost"
      port: 8500
      secure: false
      token: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
  service:
    enable: true
    name: "af-consul-test"
    instance: "test-instance"
    version: "1.0.0"
    description: "Test service for af-consul-ts"
    tags:
      - "test"
      - "af-consul"
    meta:
      host: "localhost"
      port: "9999"
      NODE_ENV: "test"
    id: "dev-test-af-consul-test-instance"
    host: "localhost"
    port: 9999
  envCode:
    prod: "prd-env"
    dev: "dev-env"

webServer:
  host: "0.0.0.0"
  port: 9999
```

**File: `__tests__/config.yaml`** (actual config, add to `.gitignore`):
```yaml
# Copy from config.example.yaml and fill with real values
```

### 7.2 Config Loader for Tests

**File: `__tests__/lib/load-config.ts`**:
```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml'; // Add yaml package to devDependencies

const CONFIG_PATH = path.join(__dirname, '..', 'config.yaml');
const CONFIG_EXAMPLE_PATH = path.join(__dirname, '..', 'config.example.yaml');

export function loadTestConfig() {
  let configPath = CONFIG_PATH;

  if (!fs.existsSync(CONFIG_PATH)) {
    console.warn('config.yaml not found, using config.example.yaml');
    configPath = CONFIG_EXAMPLE_PATH;
  }

  const content = fs.readFileSync(configPath, 'utf-8');
  return yaml.parse(content);
}

export const testConfig = loadTestConfig();
```

---

## 8. Test Plan

### 8.1 Unit Tests (`__tests__/unit/`)

#### 8.1.1 HTTP Client Tests (`http-client.test.ts`)
| Test Case | Description |
|-----------|-------------|
| `should build correct base URL for HTTP` | Verify URL construction without TLS |
| `should build correct base URL for HTTPS` | Verify URL construction with TLS |
| `should add X-Consul-Token header when token provided` | Token authentication |
| `should build query string correctly` | Query parameter encoding |
| `should filter undefined query params` | Empty param handling |
| `should call onRequest hooks before request` | Hook invocation order |
| `should call onResponse hooks after response` | Hook invocation order |
| `should increment request counter` | Request ID generation |
| `should handle JSON response` | Response parsing |
| `should handle non-JSON response` | Text response handling |
| `should reject on HTTP error status` | Error handling |
| `should not reject when status in skipCodes` | Skip specific errors |
| `should handle request timeout` | Timeout handling |
| `should handle network errors` | Connection error handling |

#### 8.1.2 Agent API Tests (`agent.test.ts`)
| Test Case | Description |
|-----------|-------------|
| `serviceList should call GET /agent/services` | Endpoint correctness |
| `serviceRegister should call PUT /agent/service/register` | Endpoint correctness |
| `serviceRegister should format check correctly` | Check object transformation |
| `serviceRegister should handle multiple checks` | Array of checks |
| `serviceDeregister should call PUT with encoded serviceId` | URL encoding |
| `members should call GET /agent/members` | Endpoint correctness |
| `members should pass wan parameter` | Query param handling |

#### 8.1.3 Health API Tests (`health.test.ts`)
| Test Case | Description |
|-----------|-------------|
| `service should call GET /health/service/:service` | Endpoint correctness |
| `service should pass dc parameter` | Datacenter filtering |
| `service should pass passing=true parameter` | Health filtering |
| `service should encode service name` | URL encoding |

#### 8.1.4 Catalog API Tests (`catalog.test.ts`)
| Test Case | Description |
|-----------|-------------|
| `serviceList should call GET /catalog/services` | Endpoint correctness |
| `serviceList should pass dc parameter` | Datacenter filtering |

#### 8.1.5 Type Tests (`types.test.ts`)
| Test Case | Description |
|-----------|-------------|
| `RegisterServiceOptions should accept valid config` | Type validation |
| `HealthServiceInfo should match API response format` | Response type |
| `ConsulClientOptions should require host` | Required fields |

### 8.2 Integration Tests (`__tests__/integration/`)

**Prerequisites**: Real Consul instance (from `config.yaml`)

#### 8.2.1 Connection Tests (`connection.test.ts`)
| Test Case | Description |
|-----------|-------------|
| `should connect to Consul agent (reg)` | HTTP connection |
| `should connect to Consul agent (dev) via HTTPS` | HTTPS connection |
| `should connect to Consul agent (prd) via HTTPS` | HTTPS connection |
| `should authenticate with token` | Token validation |
| `should fail with invalid token` | Auth rejection |
| `should handle connection timeout` | Network timeout |

#### 8.2.2 Service Registration Tests (`registration.test.ts`)
| Test Case | Description |
|-----------|-------------|
| `should register new service` | Basic registration |
| `should register service with health check` | HTTP check |
| `should register service with TCP check` | TCP check |
| `should register service with multiple tags` | Tags handling |
| `should register service with meta` | Metadata handling |
| `should update existing service registration` | Re-registration |
| `should deregister service` | Deregistration |
| `should deregister non-existent service gracefully` | Error handling |

#### 8.2.3 Service Discovery Tests (`discovery.test.ts`)
| Test Case | Description |
|-----------|-------------|
| `should list all services on agent` | Agent service list |
| `should list services in datacenter` | Catalog service list |
| `should get health info for registered service` | Health endpoint |
| `should filter passing services only` | Health filtering |
| `should return empty for non-existent service` | Not found handling |

#### 8.2.4 Agent Tests (`agent-info.test.ts`)
| Test Case | Description |
|-----------|-------------|
| `should list agent members` | Members endpoint |
| `should return member details` | Response structure |

### 8.3 End-to-End Tests (`__tests__/e2e/`)

#### 8.3.1 Full Workflow Tests (`workflow.test.ts`)
| Test Case | Description |
|-----------|-------------|
| `complete registration lifecycle` | Register → Verify → Deregister |
| `cyclic registration maintains service` | Cyclic register start/stop |
| `access points update from Consul` | AP updater functionality |
| `multiple services coexist` | Multi-service scenario |

#### 8.3.2 API Compatibility Tests (`api-compat.test.ts`)
| Test Case | Description |
|-----------|-------------|
| `getAPI returns compatible interface` | Public API shape |
| `register.once works` | One-time registration |
| `register.cyclic.start/stop works` | Cyclic registration |
| `deregister works` | Deregistration via API |
| `agentServiceList returns services` | Service listing |
| `getServiceInfo returns service details` | Service info |
| `getServiceSocket returns host:port` | Socket info |

#### 8.3.3 Debug Logging Tests (`logging.test.ts`)
| Test Case | Description |
|-----------|-------------|
| `onRequest hook receives request info` | Request logging |
| `onResponse hook receives response info` | Response logging |
| `curl format output is valid` | Curl debug format |
| `HTTP format output is valid` | HTTP debug format |

### 8.4 Regression Tests (`__tests__/regression/`)

| Test Case | Description |
|-----------|-------------|
| `existing tests in __tests__/api.test.ts pass` | Backward compatibility |
| `existing tests in __tests__/util.test.ts pass` | Utility functions |
| `access-points tests pass` | AP functionality |

### 8.5 Test Utilities

**File: `__tests__/lib/test-consul-client.ts`**:
```typescript
import { ConsulClient } from '../../src/consul-client';
import { testConfig } from './load-config';

export function createTestClient(agentType: 'reg' | 'dev' | 'prd' = 'reg') {
  const agentConfig = testConfig.consul.agent[agentType];
  return new ConsulClient({
    host: agentConfig.host,
    port: agentConfig.port,
    secure: agentConfig.secure,
    token: agentConfig.token,
    dc: agentConfig.dc,
  });
}

export function getTestServiceConfig() {
  return {
    id: `test-${Date.now()}`,
    name: testConfig.consul.service.name,
    port: testConfig.consul.service.port,
    address: testConfig.consul.service.host,
    tags: ['test', 'temporary'],
    meta: { test: 'true' },
    check: {
      http: `http://${testConfig.consul.service.host}:${testConfig.consul.service.port}/health`,
      interval: '10s',
      timeout: '5s',
    },
  };
}

export async function cleanupTestServices(client: ConsulClient, prefix: string = 'test-') {
  const services = await client.agent.serviceList();
  for (const [id] of Object.entries(services)) {
    if (id.startsWith(prefix)) {
      await client.agent.serviceDeregister(id);
    }
  }
}
```

### 8.6 Jest Configuration Update

**Update `jest.config.js`**:
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [
    '**/__tests__/**/*.test.ts',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/__tests__/lib/setup.ts'],
};
```

**File: `__tests__/lib/setup.ts`**:
```typescript
import { cleanupTestServices, createTestClient } from './test-consul-client';

afterAll(async () => {
  // Cleanup test services after all tests
  try {
    const client = createTestClient();
    await cleanupTestServices(client);
  } catch (err) {
    console.warn('Cleanup failed:', err);
  }
});
```

### 8.7 Test Scripts (package.json)

```json
{
  "scripts": {
    "test": "jest",
    "test:unit": "jest __tests__/unit/",
    "test:integration": "jest __tests__/integration/",
    "test:e2e": "jest __tests__/e2e/",
    "test:coverage": "jest --coverage",
    "test:watch": "jest --watch"
  }
}
```

### 8.8 Required Dev Dependencies

```json
{
  "devDependencies": {
    "yaml": "^2.3.4"
  }
}
```

---

## 9. Migration of Existing Tests

### 9.1 Current Test Structure (TO BE REMOVED)

```
__tests__/
├── __setup__/
│   ├── global-setup.js      # Mini HTTP server for health checks
│   ├── global-teardown.js   # Empty
│   └── test-sequencer.js    # Test ordering
├── access-points/
│   ├── access-points.test.ts         # AP class tests (KEEP LOGIC)
│   ├── access-points-expected.json   # Expected data (KEEP)
│   └── dist/                         # Build artifacts (DELETE)
├── af_tests/
│   ├── af-api.test.ts       # Duplicate (DELETE)
│   └── dist/                # Build artifacts (DELETE)
├── config/
│   ├── access-points.json   # Test AP config (MIGRATE TO YAML)
│   ├── consul.js            # Consul config (MIGRATE TO YAML)
│   ├── default.js           # Main config (MIGRATE TO YAML)
│   └── index.js             # Config loader (REPLACE)
├── lib/
│   ├── deregister.ts        # Manual deregister script (KEEP AS UTIL)
│   ├── get-consul-api.ts    # API factory (MIGRATE)
│   ├── logger.ts            # Logger setup (KEEP)
│   ├── register.ts          # Manual register script (KEEP AS UTIL)
│   └── test-utils.ts        # Mock utilities (KEEP & EXTEND)
├── api.test.ts              # Main API tests (MIGRATE)
└── util.test.ts             # Utility tests (MIGRATE)
```

### 9.2 New Test Structure (TO BE CREATED)

```
__tests__/
├── config.yaml              # Real config (gitignored)
├── config.example.yaml      # Template config (committed)
├── unit/
│   ├── http-client.test.ts  # NEW: HTTP client tests
│   ├── agent-api.test.ts    # NEW: Agent API tests
│   ├── health-api.test.ts   # NEW: Health API tests
│   ├── catalog-api.test.ts  # NEW: Catalog API tests
│   ├── utils.test.ts        # FROM: util.test.ts (substitute tests)
│   └── access-points.test.ts # FROM: access-points/access-points.test.ts
├── integration/
│   ├── connection.test.ts   # NEW: Connection tests
│   ├── registration.test.ts # FROM: api.test.ts (register/deregister)
│   └── discovery.test.ts    # FROM: api.test.ts (service list/info)
├── e2e/
│   ├── workflow.test.ts     # FROM: api.test.ts (full lifecycle)
│   └── api-compat.test.ts   # NEW: Backward compatibility
├── fixtures/
│   └── access-points-expected.json  # FROM: access-points/
└── lib/
    ├── load-config.ts       # NEW: YAML config loader
    ├── test-consul-client.ts # NEW: Test client factory
    ├── test-utils.ts        # FROM: lib/test-utils.ts (extended)
    ├── logger.ts            # FROM: lib/logger.ts
    ├── setup.ts             # NEW: Jest setup (replaces __setup__/)
    ├── register.ts          # FROM: lib/register.ts (utility)
    └── deregister.ts        # FROM: lib/deregister.ts (utility)
```

### 9.3 Test Migration Mapping

#### 9.3.1 From `api.test.ts` → Multiple Files

| Old Test | New Location | Notes |
|----------|--------------|-------|
| `apiCache` | `unit/api-cache.test.ts` | Cache behavior |
| `register` | `integration/registration.test.ts` | Service registration |
| `agentServiceList` | `integration/discovery.test.ts` | Service list |
| `getServiceInfo` | `integration/discovery.test.ts` | Service info |
| `serviceConfigDiff = []` | `unit/utils.test.ts` | Config diff utility |
| `serviceConfigDiff != []` | `unit/utils.test.ts` | Config diff utility |
| `getServiceInfo (unknown)` | `integration/discovery.test.ts` | Error handling |
| `deregister` | `integration/registration.test.ts` | Deregistration |
| `register/deregister another agent` | `e2e/workflow.test.ts` | Multi-agent |

#### 9.3.2 From `util.test.ts` → `unit/utils.test.ts`

| Old Test | Action |
|----------|--------|
| `substitute()` | KEEP - Test utility function |

#### 9.3.3 From `access-points/access-points.test.ts` → `unit/access-points.test.ts`

| Old Test | Action |
|----------|--------|
| `Checking the initial state of all AP` | KEEP |
| `Getting information about a specific AP` | KEEP |
| `Getting information about non existent AP` | KEEP |
| `Change AP settings` | KEEP |
| `Update AP itself` | KEEP |
| `New AP` | KEEP |
| `Add new AP with no data specified` | KEEP |
| `Update AP with no data specified` | KEEP |
| `Test waitForHostPortUpdated()` | KEEP |
| `Update AP with no consulServiceName specified` | KEEP |

### 9.4 Files to DELETE (After Migration)

```bash
# Entire directories to remove
rm -rf __tests__/__setup__/
rm -rf __tests__/af_tests/
rm -rf __tests__/config/
rm -rf __tests__/access-points/dist/

# Individual files to remove
rm __tests__/access-points/access-points.test.ts  # After migration
rm __tests__/api.test.ts                          # After migration
rm __tests__/util.test.ts                         # After migration
rm __tests__/lib/get-consul-api.ts                # Replaced by test-consul-client.ts
```

### 9.5 Files to KEEP and MIGRATE

#### `__tests__/lib/test-utils.ts` → Extended Version

```typescript
// NEW: __tests__/lib/test-utils.ts

import { jest } from '@jest/globals';
import { ILogger, TLoggerMethod } from '../../src/interfaces';

// KEEP: Original setProperty
export const setProperty = (object: any, property: string, value: any) => {
  const originalProperty = Object.getOwnPropertyDescriptor(object, property);
  Object.defineProperty(object, property, { value });
  return originalProperty;
};

// KEEP: Original mock types
export type TLoggerMethodMocked = TLoggerMethod & jest.Mock;

export interface ILoggerMocked {
  silly: TLoggerMethodMocked;
  debug: TLoggerMethodMocked;
  info: TLoggerMethodMocked;
  warn: TLoggerMethodMocked;
  error: TLoggerMethodMocked;
}

// SIMPLIFIED: Logger mock (remove af-logger dependency for tests)
export const mockLogger = (logger: ILogger): ILoggerMocked => {
  const levels = ['silly', 'debug', 'info', 'warn', 'error'] as const;
  levels.forEach((fnName) => {
    if (!(logger[fnName] as any)._isMockFunction) {
      const original = logger[fnName];
      (logger as any)[fnName] = jest.fn((...args: unknown[]) => original.apply(logger, args));
    }
  });
  return logger as unknown as ILoggerMocked;
};

// NEW: Create stub logger for tests
export const createStubLogger = (): ILoggerMocked => ({
  silly: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

// NEW: Wait helper
export const waitFor = async (
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) return true;
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  return false;
};
```

#### `__tests__/lib/logger.ts` → Simplified Version

```typescript
// NEW: __tests__/lib/logger.ts

import { ILogger } from '../../src/interfaces';

// Simple console logger for tests (remove af-logger dependency)
export const logger: ILogger = {
  silly: (...args: unknown[]) => console.log('[SILLY]', ...args),
  debug: (...args: unknown[]) => console.log('[DEBUG]', ...args),
  info: (...args: unknown[]) => console.log('[INFO]', ...args),
  warn: (...args: unknown[]) => console.warn('[WARN]', ...args),
  error: (...args: unknown[]) => console.error('[ERROR]', ...args),
};
```

#### `__tests__/access-points/access-points-expected.json` → `__tests__/fixtures/`

```bash
# Move fixture file
mv __tests__/access-points/access-points-expected.json __tests__/fixtures/
```

### 9.6 Config Migration: JS → YAML

#### Old: `__tests__/config/consul.js`
```javascript
// DELETE THIS FILE
module.exports = {
  check: { interval: '1s', ... },
  agent: { reg: {...}, dev: {...}, prd: {...} },
  service: { name: 'af-consul-ts', ... }
};
```

#### New: `__tests__/config.yaml`
```yaml
# Already created - see section 7.1
consul:
  check:
    interval: "10s"
    ...
```

### 9.7 Global Setup Migration

#### Old: `__tests__/__setup__/global-setup.js`
```javascript
// Mini HTTP server for health checks
const runMiniServer = () => {
  const p = +config.webServer.port;
  const s = http.createServer((x, r) => r.writeHead(200).end('ok')).listen(p);
  setTimeout(() => s.close(), 60_000);
};
```

#### New: `__tests__/lib/setup.ts`
```typescript
import * as http from 'http';
import { loadTestConfig } from './load-config';
import { cleanupTestServices, createTestClient } from './test-consul-client';

let server: http.Server | null = null;

// Start mini health check server
beforeAll(async () => {
  const config = loadTestConfig();
  const port = config.webServer?.port || 9999;

  server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  });

  await new Promise<void>((resolve) => {
    server!.listen(port, () => {
      console.log(`Test health server listening on port ${port}`);
      resolve();
    });
  });
}, 30000);

// Cleanup after all tests
afterAll(async () => {
  // Stop health server
  if (server) {
    await new Promise<void>((resolve) => {
      server!.close(() => {
        console.log('Test health server closed');
        resolve();
      });
    });
  }

  // Cleanup test services from Consul
  try {
    const client = createTestClient();
    await cleanupTestServices(client, 'test-');
  } catch (err) {
    console.warn('Test service cleanup failed:', err);
  }
}, 30000);
```

### 9.8 Migration Steps (Execute in Order)

```bash
# Step 1: Create new directory structure
mkdir -p __tests__/unit
mkdir -p __tests__/integration
mkdir -p __tests__/e2e
mkdir -p __tests__/fixtures

# Step 2: Move fixture files
mv __tests__/access-points/access-points-expected.json __tests__/fixtures/

# Step 3: Create new config loader
# (Create __tests__/lib/load-config.ts as per section 7.2)

# Step 4: Create new test utilities
# (Update __tests__/lib/test-utils.ts as per section 9.5)

# Step 5: Migrate API tests
# - Extract registration tests → integration/registration.test.ts
# - Extract discovery tests → integration/discovery.test.ts
# - Extract workflow tests → e2e/workflow.test.ts

# Step 6: Migrate access-points tests
mv __tests__/access-points/access-points.test.ts __tests__/unit/access-points.test.ts
# Update imports in the moved file

# Step 7: Migrate util tests
mv __tests__/util.test.ts __tests__/unit/utils.test.ts
# Add serviceConfigDiff tests from api.test.ts

# Step 8: Create new unit tests for consul-client
# (Create http-client.test.ts, agent-api.test.ts, etc.)

# Step 9: Update Jest config
# (Update jest.config.js as per section 8.6)

# Step 10: Remove old files
rm -rf __tests__/__setup__/
rm -rf __tests__/af_tests/
rm -rf __tests__/config/
rm -rf __tests__/access-points/
rm __tests__/api.test.ts
rm __tests__/lib/get-consul-api.ts

# Step 11: Verify all tests pass
npm test
```

### 9.9 Import Updates After Migration

#### `unit/access-points.test.ts` - Update Imports
```typescript
// OLD
import { AccessPoints } from '../../src';
import { logger } from '../lib/logger';
import { setProperty } from '../lib/test-utils';
const accessPointsExpected = require('./access-points-expected.json');
const config = require('../config');

// NEW
import { AccessPoints } from '../../src';
import { logger } from '../lib/logger';
import { setProperty, createStubLogger } from '../lib/test-utils';
import { loadTestConfig } from '../lib/load-config';
import accessPointsExpected from '../fixtures/access-points-expected.json';

const config = loadTestConfig();
```

#### `unit/utils.test.ts` - Add serviceConfigDiff Tests
```typescript
// OLD content from util.test.ts
import { substitute, serviceConfigDiff } from '../../src/lib/utils';

describe('Test utils', () => {
  // KEEP: existing substitute test
  test('substitute()', async () => { ... });

  // NEW: Add from api.test.ts
  describe('serviceConfigDiff', () => {
    test('returns empty array when configs match', () => {
      const registerConfig = { /* ... */ };
      const serviceInfo = { /* ... */ };
      const diff = serviceConfigDiff(registerConfig, serviceInfo);
      expect(diff.length).toEqual(0);
    });

    test('returns diff when configs differ', () => {
      const registerConfig = { meta: { CONSUL_TEST: '12345' } };
      const serviceInfo = { Meta: { CONSUL_TEST: 'foo' } };
      const diff = serviceConfigDiff(registerConfig, serviceInfo);
      expect(diff.length).toBeGreaterThan(0);
    });
  });
});
```

### 9.10 Verification After Migration

```bash
# 1. Check all test files compile
npx tsc --noEmit

# 2. Run unit tests only
npm run test:unit

# 3. Run integration tests (requires Consul)
npm run test:integration

# 4. Run full test suite
npm test

# 5. Check coverage
npm run test:coverage

# 6. Verify no old files remain
ls __tests__/__setup__/      # Should not exist
ls __tests__/config/         # Should not exist
ls __tests__/af_tests/       # Should not exist
```

---

## 10. Rollback Plan

If issues arise:
1. Keep old code in git branch
2. Revert to `consul` package dependency
3. Restore original `prepare-consul-api.ts`

---

## 11. Verification Checklist

### Code Migration
- [ ] All existing tests pass
- [ ] Service registration works
- [ ] Service deregistration works
- [ ] Health checks return correct data
- [ ] Debug logging (curl format) works
- [ ] Debug logging (http format) works
- [ ] Multiple agent configurations (reg/dev/prd) work
- [ ] Token authentication works
- [ ] HTTPS connections work
- [ ] Access points update correctly
- [ ] Cyclic registration works

### Test Migration
- [ ] Old `__tests__/__setup__/` directory removed
- [ ] Old `__tests__/config/` directory removed
- [ ] Old `__tests__/af_tests/` directory removed
- [ ] `api.test.ts` migrated and removed
- [ ] `util.test.ts` migrated to `unit/utils.test.ts`
- [ ] `access-points.test.ts` migrated to `unit/access-points.test.ts`
- [ ] New `__tests__/lib/load-config.ts` works with YAML
- [ ] `config.yaml` loads correctly (gitignored)
- [ ] `config.example.yaml` exists in repo
- [ ] Unit tests pass without Consul connection
- [ ] Integration tests pass with real Consul
- [ ] E2E workflow tests pass
- [ ] Test coverage >= 80%
