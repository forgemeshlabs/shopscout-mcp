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

test('stdio negotiation, five tools, planned capability visibility, validation and calculation',async(t)=>{
 const path=process.env.SHOPSCOUT_SERVER_PATH;
 if(!path){t.skip('SHOPSCOUT_SERVER_PATH unset: backend integration test skipped');return;}
 const {createServer}=await import(pathToFileURL(`${path}/src/server.js`));
 const backend=createServer({catalogProvider:{enabled:true,call:async()=>({products:[{id:'gid://shopify/p/test',title:'Synthetic test product',variants:[{id:'gid://shopify/ProductVariant/1',price:{amount:1000,currency:'USD'},availability:{available:true}},{id:'gid://shopify/ProductVariant/2',price:{amount:1200,currency:'USD'},availability:{available:true}}]}],product:{id:'gid://shopify/p/test',title:'Synthetic detail',variants:[]}})}});await new Promise(r=>backend.listen(0,'127.0.0.1',r));
 const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../src/index.js',import.meta.url))],env:{...process.env,SHOPSCOUT_BASE_URL:`http://127.0.0.1:${backend.address().port}`},stderr:'pipe'});
 const client=new Client({name:'shopscout-integration',version:'1.0.0'});
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
  assert.equal(catalog.structuredContent.quantum.compute_enabled,false);
  assert.equal(catalog.structuredContent.quantum.post_quantum_security.protection_verified,false);
  assert.ok(catalog.structuredContent.capabilities.some(c=>c.id==='optimize_basket_quantum'&&c.status==='planned'));
  assert.equal(list.tools.some(t=>t.name.includes('quantum')),false);
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


test('402 challenge is inspectable without wallet access or automatic retry',async()=>{
 const challenge={x402Version:2,resource:{url:'https://example.com/v1/search'},accepts:[{scheme:'exact',network:'eip155:8453',amount:'10000'}]};
 let calls=0;
 const {server,url}=await serve((req,res)=>{calls++;res.writeHead(402,{'payment-required':Buffer.from(JSON.stringify(challenge)).toString('base64')});res.end('{}');});
 try{await assert.rejects(createApiClient({baseUrl:url})({method:'POST',path:'/v1/search'},{}),e=>e.code==='payment_required'&&JSON.stringify(e.paymentRequired)===JSON.stringify(challenge));assert.equal(calls,1);}finally{await stop(server);}
});

function challenge402(res,accept){const env={x402Version:2,error:'Payment required',resource:{url:'https://x.test/v1/search'},accepts:[{scheme:'exact',network:'eip155:8453',asset:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',amount:'10000',payTo:'0x0000000000000000000000000000000000000001',maxTimeoutSeconds:300,extra:{name:'USD Coin',version:'2'},...accept}]};res.writeHead(402,{'content-type':'application/json','payment-required':Buffer.from(JSON.stringify(env)).toString('base64')});res.end(JSON.stringify({error:{code:'payment_required'}}));}
const TEST_KEY='0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

test('wallet configured: pays a $0.01 exact-USDC-on-Base challenge once and reports the settlement',async()=>{
 let calls=0,signed=null;
 const {server,url}=await serve((req,res)=>{calls++;let b='';req.on('data',c=>b+=c);req.on('end',()=>{signed=req.headers['payment-signature']||null;if(!signed)return challenge402(res,{});res.writeHead(200,{'content-type':'application/json','payment-response':Buffer.from(JSON.stringify({success:true,transaction:'0x'+'ab'.repeat(32),network:'eip155:8453'})).toString('base64')});res.end(JSON.stringify({products:[]}));});});
 try{
  const request=createApiClient({baseUrl:url,walletKey:TEST_KEY,chainTime:false});
  const out=await request({method:'POST',path:'/v1/search'},{query:'x',country:'US',currency:'USD'});
  assert.equal(calls,2);assert.ok(signed,'second call carried payment-signature');
  const payload=JSON.parse(Buffer.from(signed,'base64').toString());assert.equal(payload.x402Version,2);assert.equal(payload.accepted.amount,'10000');
  assert.deepEqual(out.products,[]);assert.equal(out._payment.amount_usdc,'0.010000');assert.equal(out._payment.transaction,'0x'+'ab'.repeat(32));
 }finally{await stop(server);}
});

test('wallet configured: refuses over-cap, wrong-network and rejected payments without paying twice',async()=>{
 let calls=0;
 const {server,url}=await serve((req,res)=>{calls++;let b='';req.on('data',c=>b+=c);req.on('end',()=>{if(req.url==='/over')return challenge402(res,{amount:'20000'});if(req.url==='/net')return challenge402(res,{network:'eip155:1'});challenge402(res,{});});});
 try{
  const request=createApiClient({baseUrl:url,walletKey:TEST_KEY,chainTime:false});
  await assert.rejects(request({method:'POST',path:'/over'},{}),e=>e.code==='payment_over_cap');
  await assert.rejects(request({method:'POST',path:'/net'},{}),e=>e.code==='payment_unsupported');
  calls=0;await assert.rejects(request({method:'POST',path:'/v1/search'},{}),e=>e.code==='payment_rejected');assert.equal(calls,2,'exactly one signed retry, never a third attempt');
  const noWallet=createApiClient({baseUrl:url,chainTime:false,walletKey:undefined});
  await assert.rejects(noWallet({method:'POST',path:'/v1/search'},{}),e=>e.code==='payment_required'&&e.paymentRequired?.accepts?.length===1);
 }finally{await stop(server);}
});
