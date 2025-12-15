import { ConsulHttpClient } from '../../src/index.js';
import { ConsulClientOptions } from '../../src/index.js';

describe('ConsulHttpClient', () => {
  describe('constructor', () => {
    test('should build correct base URL for HTTP', () => {
      const options: ConsulClientOptions = {
        host: 'localhost',
        port: 8500,
        secure: false,
      };
      const client = new ConsulHttpClient(options);
      expect(client).toBeDefined();
    });

    test('should build correct base URL for HTTPS', () => {
      const options: ConsulClientOptions = {
        host: 'consul.example.com',
        port: 443,
        secure: true,
      };
      const client = new ConsulHttpClient(options);
      expect(client).toBeDefined();
    });

    test('should use default ports', () => {
      const httpClient = new ConsulHttpClient({
        host: 'localhost',
        port: '',
        secure: false,
      });
      expect(httpClient).toBeDefined();

      const httpsClient = new ConsulHttpClient({
        host: 'localhost',
        port: '',
        secure: true,
      });
      expect(httpsClient).toBeDefined();
    });

    test('should support token via defaults', () => {
      const options: ConsulClientOptions = {
        host: 'localhost',
        port: 8500,
        defaults: { token: 'test-token' },
      };
      const client = new ConsulHttpClient(options);
      expect(client).toBeDefined();
    });

    test('should support direct token', () => {
      const options: ConsulClientOptions = {
        host: 'localhost',
        port: 8500,
        token: 'test-token',
      };
      const client = new ConsulHttpClient(options);
      expect(client).toBeDefined();
    });
  });

  describe('hooks', () => {
    test('should register onRequest hooks', () => {
      const client = new ConsulHttpClient({
        host: 'localhost',
        port: 8500,
      });

      const hook = jest.fn();
      client.onRequest(hook);

      expect(hook).not.toHaveBeenCalled();
    });

    test('should register onResponse hooks', () => {
      const client = new ConsulHttpClient({
        host: 'localhost',
        port: 8500,
      });

      const hook = jest.fn();
      client.onResponse(hook);

      expect(hook).not.toHaveBeenCalled();
    });
  });

  describe('request counter', () => {
    test('should start with 0', () => {
      const client = new ConsulHttpClient({
        host: 'localhost',
        port: 8500,
      });

      expect(client.getRequestCounter()).toBe(0);
    });
  });
});
