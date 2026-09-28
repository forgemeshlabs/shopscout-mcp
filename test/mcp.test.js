import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createApiClient, parseBaseUrl } from '../src/api.js';

async function serve(handler) { const server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));return {server,url:`http://127.0.0.1:${server.address().port}`}; }
async function stop(server) {server.closeAllConnections();await new Promise(r=>server.close(r));}
const sample=JSON.parse(readFileSync(new URL('../examples/shipping-request.json',import.meta.url)));

test('stdio negotiation, five tools, planned capability visibility, validation and calculation',async()=>{
 const path=process.env.SHOPPINGSCOUT_SERVER_PATH;
 assert.ok(path,'Set SHOPPINGSCOUT_SERVER_PATH to the backend repo for this integration test');
 const {createServer}=await import(pathToFileURL(`${path}/src/server.js`));
 const backend=createServer({catalogProvider:{enabled:true,call:async()=>({products:[{id:'gid://shopify/p/test',title:'Synthetic test product',variants:[{id:'gid://shopify/ProductVariant/1',price:{amount:1000,currency:'USD'},availability:{available:true}},{id:'gid://shopify/ProductVariant/2',price:{amount:1200,currency:'USD'},availability:{available:true}}]}],product:{id:'gid://shopify/p/test',title:'Synthetic detail',variants:[]}})}});await new Promise(r=>backend.listen(0,'127.0.0.1',r));
 const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../src/index.js',import.meta.url))],env:{...process.env,SHOPPINGSCOUT_BASE_URL:`http://127.0.0.1:${backend.address().port}`},stderr:'pipe'});
 const client=new Client({name:'shoppingscout-integration',version:'1.0.0'});
 let errors='';transport.stderr?.on('data',chunk=>errors+=chunk.toString());
 try {
  await client.connect(transport);
  const list=await client.listTools();assert.deepEqual(list.tools.map(t=>t.name),['search_products','get_product','compare_offers','get_capabilities','compare_shipping_plans']);
  const catalog=await client.callTool({name:'get_capabilities',arguments:{}});assert.equal(catalog.isError,false);assert.ok(catalog.structuredContent.capabilities.some(c=>c.id==='create_price_watch'&&c.status==='planned'));
  const result=await client.callTool({name:'compare_shipping_plans',arguments:sample});assert.equal(result.isError,false);assert.equal(result.structuredContent.recommendations.lowest_estimated_cost.subtotal_plus_shipping_minor,4000);assert.deepEqual(JSON.parse(result.content[0].text),result.structuredContent);
  const bad=await client.callTool({name:'compare_shipping_plans',arguments:{currency:'USD'}});assert.equal(bad.isError,true);assert.equal(bad.structuredContent.error.code,'invalid_arguments');
  const planned=await client.callTool({name:'create_price_watch',arguments:{}});assert.equal(planned.isError,true);assert.equal(planned.structuredContent.error.code,'unknown_tool');
  const searched=await client.callTool({name:'search_products',arguments:{query:'test',country:'US',currency:'USD'}});
  assert.equal(searched.isError,false);assert.equal(searched.structuredContent.products[0].title,'Synthetic test product');
  const detail=await client.callTool({name:'get_product',arguments:{id:'gid://shopify/p/test',country:'US',currency:'USD'}});
  assert.equal(detail.isError,false);assert.equal(detail.structuredContent.products[0].title,'Synthetic detail');
  const compared=await client.callTool({name:'compare_offers',arguments:{variant_ids:['gid://shopify/ProductVariant/1','gid://shopify/ProductVariant/2'],country:'US',currency:'USD'}});
  assert.equal(compared.isError,false);assert.equal(compared.structuredContent.comparison.lowest_item_price.price.amount_minor,1000);
  const invalidSearch=await client.callTool({name:'search_products',arguments:{query:'x',country:'US',currency:'USD',url:'https://example.com'}});
  assert.equal(invalidSearch.isError,true);assert.equal(invalidSearch.structuredContent.error.code,'invalid_arguments');
  assert.equal(errors,'');
 } finally {await client.close();await stop(backend);}
});

test('fixed operator configuration rejects credentials and insecure remote origins',()=>{
 for(const url of ['http://example.com','https://u:p@example.com','https://example.com/path','https://example.com/?token=x'])assert.throws(()=>parseBaseUrl(url));
 assert.equal(parseBaseUrl('http://127.0.0.1:3478'),'http://127.0.0.1:3478');assert.equal(parseBaseUrl('https://example.com'),'https://example.com');
});

test('payment challenges, upstream errors, malformed responses and redirects stay errors',async()=>{
 for(const [status,body,code,headers] of [
  [402,'{}','payment_required',{}],
  [501,'{"error":{"message":"Planned"}}','capability_planned',{}],
  [503,'{"error":{"code":"catalog_not_configured","message":"Disabled"}}','catalog_not_configured',{}],
  [500,'{"error":{"message":"Unavailable"}}','upstream_error',{}],
  [200,'not json','invalid_upstream_response',{}],
  [200,'[]','invalid_upstream_response',{}],
  [302,'','backend_unavailable',{Location:'https://example.com'}]
 ]) {
  const {server,url}=await serve((req,res)=>{res.writeHead(status,headers);res.end(body);});
  try{await assert.rejects(createApiClient({baseUrl:url})({method:'GET',path:'/v1/capabilities'},{ }),e=>e.code===code);}finally{await stop(server);}
 }
});

test('bounded requests, cancellation and deadlines',async()=>{
 const {server,url}=await serve(()=>{});
 try{
  await assert.rejects(createApiClient({baseUrl:url,timeoutMs:30})({method:'GET',path:'/v1/capabilities'},{}),e=>e.code==='upstream_timeout');
  const abort=new AbortController();abort.abort();
  await assert.rejects(createApiClient({baseUrl:url})({method:'GET',path:'/v1/capabilities'},{},abort.signal),e=>e.code==='request_cancelled');
  await assert.rejects(createApiClient({baseUrl:url})({method:'POST',path:'/v1/shipping/compare'},{data:'x'.repeat(70000)}),e=>e.code==='payload_too_large');
 }finally{await stop(server);}
});
