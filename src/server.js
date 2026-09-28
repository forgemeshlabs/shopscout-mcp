import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import Ajv from 'ajv';
import { tools, routes } from './tools.js';
import { createApiClient } from './api.js';
const ajv = new Ajv({ allErrors: true, strict: true });
const validators = new Map(tools.map(tool => [tool.name, ajv.compile(tool.inputSchema)]));
const result = (data, isError = false) => ({ content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data, isError });
export function createMcpServer(options = {}) {
  const request = createApiClient(options);
  const server = new Server({ name: 'forgemesh-shoppingscout', version: '0.1.0' }, { capabilities: { tools: {} }, instructions: 'ShoppingScout: let your agent shop and compare. Inspect get_capabilities for availability. Monitoring features are planned, not active tools. Shipping estimates use supplied rules only. No purchases or automatic payments.' });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async (req, extra) => {
    const route = routes.get(req.params.name), validate = validators.get(req.params.name);
    if (!route) return result({ error: { code: 'unknown_tool', message: 'Tool is not available. Use get_capabilities to inspect planned capabilities.' } }, true);
    const args = req.params.arguments ?? {};
    if (!validate(args)) return result({ error: { code: 'invalid_arguments', message: 'Arguments do not match the input schema', details: validate.errors.map(e => ({ path: e.instancePath, keyword: e.keyword, message: e.message })) } }, true);
    try { return result(await request(route, args, extra.signal)); }
    catch (e) { return result({ error: { code: e.code || 'tool_error', message: e.code ? e.message : 'Tool failed', ...(e.status ? { http_status: e.status } : {}) } }, true); }
  });
  return server;
}
