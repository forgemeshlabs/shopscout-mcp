import { readFileSync } from 'node:fs';
const api = JSON.parse(readFileSync(new URL('../contracts/openapi.json', import.meta.url)));
const catalogTools = ['/v1/search', '/v1/products/get', '/v1/compare'].map(path => {
  const operation = api.paths[path].post;
  return { name: operation.operationId, description: operation.summary,
    inputSchema: operation.requestBody.content['application/json'].schema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } };
});
export const tools = [
  ...catalogTools,
  {
    name: 'get_capabilities',
    description: 'Inspect ShoppingScout capability availability, stable IDs, and planned price/stock/shipping watches. This does not create a watch or store client preferences.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'compare_shipping_plans',
    description: 'Compare complete-basket offers and shipping methods for lowest estimated cost, fastest stated delivery, and fewest shipments. Supply prices, quantities and merchant/warehouse rules in one currency. No live rates, stock checks, taxes, duties, purchases or payments.',
    inputSchema: api.paths['/v1/shipping/compare'].post.requestBody.content['application/json'].schema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }
];
export const routes = new Map([
  ...['/v1/search', '/v1/products/get', '/v1/compare'].map(path => [api.paths[path].post.operationId, { method: 'POST', path }]),
  ['get_capabilities', { method: 'GET', path: '/v1/capabilities' }],
  ['compare_shipping_plans', { method: 'POST', path: '/v1/shipping/compare' }]
]);
