// ================== Connection Options ==================
export interface ConsulClientOptions {
  host: string;
  port: string | number;
  secure?: boolean | undefined;
  token?: string | undefined;
  dc?: string | undefined;
  timeout?: number | undefined;
  defaults?: { token?: string | undefined } | undefined;
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
  Meta?: Record<string, string | null>;
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
  body?: string | undefined;
  timestamp: number;
  // Properties for compatibility with existing debug utilities
  path: string;
  hostname: string;
  port: string | number;
  protocol: string;
  query?: Record<string, string | boolean | undefined> | undefined;
}

export interface ResponseInfo {
  requestId: number;
  statusCode: number;
  body?: unknown;
  timestamp: number;
}

export type OnRequestHook = (request: RequestInfo) => void;
export type OnResponseHook = (request: RequestInfo, response: ResponseInfo) => void;
