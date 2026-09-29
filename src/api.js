export class ApiError extends Error {
  constructor(code, message, status) { super(message); this.code = code; this.status = status; }
}
export const DEFAULT_BASE_URL = 'https://shopscout.forgemesh.io';
export function parseBaseUrl(value = DEFAULT_BASE_URL) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('SHOPSCOUT_BASE_URL must be an origin without credentials, path, query or fragment');
  if (!(url.protocol === 'https:' || url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) throw new Error('Use HTTPS, or HTTP on localhost for development');
  return url.origin;
}
const USDC_BASE = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const NETWORK = 'eip155:8453';
function parseChallenge(response) {
  const header = response.headers.get('payment-required');
  if (!header || header.length > 16384) return null;
  try {
    const challenge = JSON.parse(Buffer.from(header, 'base64').toString());
    if (challenge.x402Version === 2 && Array.isArray(challenge.accepts) && challenge.accepts.length <= 10) return challenge;
  } catch { /* malformed metadata: treat as no challenge */ }
  return null;
}
// x402 payer (fleet MCP convention, same as utility-grid-mcp): optional WALLET_PRIVATE_KEY for a
// dedicated low-balance Base wallet; every paid call is capped at SHOPSCOUT_MAX_PRICE_USD (default
// $0.01, the advertised price). No key → the 402 is surfaced as data, never signed.
function createPayer({ walletKey, maxPriceUsd, chainTime, rpcUrl }) {
  if (!walletKey) return null;
  const cap = BigInt(Math.round(Number(maxPriceUsd) * 1e6));
  if (!(cap > 0n)) throw new Error('SHOPSCOUT_MAX_PRICE_USD must be a positive number');
  let ready;
  const load = () => (ready ??= (async () => {
    const [{ x402Client, x402HTTPClient }, { ExactEvmScheme }, { toClientEvmSigner }, { privateKeyToAccount }] = await Promise.all([
      import('@x402/core/client'), import('@x402/evm/exact/client'), import('@x402/evm'), import('viem/accounts')
    ]);
    const account = privateKeyToAccount(walletKey.startsWith('0x') ? walletKey : `0x${walletKey}`);
    const http = new x402HTTPClient(new x402Client().register('eip155:*', new ExactEvmScheme(toClientEvmSigner(account))));
    let chainNow = null;
    if (chainTime) {
      try {
        const { createPublicClient, http: transport } = await import('viem'); const { base } = await import('viem/chains');
        chainNow = async () => Number((await createPublicClient({ chain: base, transport: transport(rpcUrl) }).getBlock()).timestamp);
      } catch { chainNow = null; }
    }
    return { http, chainNow };
  })());
  return {
    cap,
    async sign(challenge, headerGetter, body) {
      const { http, chainNow } = await load();
      const pr = http.getPaymentRequiredResponse(headerGetter, body);
      // Base block time can trail the local clock; align validAfter/validBefore to the chain when reachable.
      const orig = Date.now;
      if (chainNow) { try { const c = await chainNow(); const t = Number(challenge.accepts[0].maxTimeoutSeconds || 300); const s = Math.min(Math.max(c, Math.floor(orig() / 1000) + 30 - t), c + 600); Date.now = () => s * 1000; } catch { Date.now = orig; } }
      try { return http.encodePaymentSignatureHeader(await http.createPaymentPayload(pr)); } finally { Date.now = orig; }
    }
  };
}
export function createApiClient({
  baseUrl = parseBaseUrl(process.env.SHOPSCOUT_BASE_URL), timeoutMs = 10000,
  walletKey = process.env.WALLET_PRIVATE_KEY, maxPriceUsd = process.env.SHOPSCOUT_MAX_PRICE_USD || '0.01',
  chainTime = true, rpcUrl = process.env.SHOPSCOUT_RPC_URL || 'https://mainnet.base.org'
} = {}) {
  baseUrl = parseBaseUrl(baseUrl);
  const payer = createPayer({ walletKey, maxPriceUsd, chainTime, rpcUrl });
  return async function request(route, args, signal) {
    const body = route.method === 'POST' ? JSON.stringify(args) : undefined;
    if (body && Buffer.byteLength(body) > 65536) throw new ApiError('payload_too_large', 'Input exceeds 64 KiB');
    const send = (extraHeaders = {}) => fetch(new URL(route.path, baseUrl), {
      method: route.method, redirect: 'error', headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...extraHeaders }, body,
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs)
    });
    let response, data, payment = null;
    try {
      response = await send();
      if (response.status === 402) {
        const challenge = parseChallenge(response);
        if (!payer) {
          await response.body?.cancel();
          const error = new ApiError('payment_required', 'This route costs USDC via x402. Set WALLET_PRIVATE_KEY to a dedicated low-balance Base wallet holding a little USDC to let this MCP pay per call (capped by SHOPSCOUT_MAX_PRICE_USD, default $0.01), or call the HTTP API with your own x402 client.', 402);
          if (challenge) error.paymentRequired = challenge;
          throw error;
        }
        if (!challenge) { await response.body?.cancel(); throw new ApiError('payment_required', 'Backend sent a 402 without a readable x402 challenge; not paying.', 402); }
        const accept = challenge.accepts[0];
        const amount = BigInt(accept.amount ?? accept.maxAmountRequired ?? 0);
        if (accept.network !== NETWORK || String(accept.asset).toLowerCase() !== USDC_BASE || accept.scheme !== 'exact') { await response.body?.cancel(); throw new ApiError('payment_unsupported', `Challenge is not exact USDC on Base (${accept.scheme} ${accept.network} ${accept.asset}); not paying.`, 402); }
        if (amount > payer.cap) { await response.body?.cancel(); throw new ApiError('payment_over_cap', `Challenge asks ${Number(amount) / 1e6} USDC, above the SHOPSCOUT_MAX_PRICE_USD cap of ${Number(payer.cap) / 1e6}; not paying.`, 402); }
        let challengeBody = null; try { challengeBody = await response.json(); } catch { /* header carries the envelope */ }
        const header = await payer.sign(challenge, (n) => response.headers.get(n), challengeBody);
        response = await send(header);
        if (response.status === 402) { await response.body?.cancel(); throw new ApiError('payment_rejected', 'The signed payment was not accepted; nothing was settled. Check the wallet USDC balance on Base and retry once.', 402); }
        payment = { amount_usdc: (Number(amount) / 1e6).toFixed(6), pay_to: accept.payTo, network: NETWORK };
        const settle = response.headers.get('payment-response');
        if (settle) { try { const s = JSON.parse(Buffer.from(settle, 'base64').toString()); if (s.transaction) payment.transaction = s.transaction; } catch { /* keep amount only */ } }
      }
      const reader = response.body?.getReader(); const chunks = []; let size = 0;
      if (reader) for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 2_000_000) { await reader.cancel(); throw new ApiError('response_too_large', 'Backend response exceeds 2 MB'); } chunks.push(value); }
      const raw = Buffer.concat(chunks).toString();
      try { data = JSON.parse(raw); } catch { throw new ApiError('invalid_upstream_response', 'Backend did not return valid JSON', response.status); }
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ApiError('invalid_upstream_response', 'Backend response must be a JSON object', response.status);
      const catalogCodes = new Set(['catalog_not_configured','catalog_rate_limited','catalog_unavailable','catalog_timeout','catalog_payment_required','catalog_tool_error','invalid_catalog_response','payment_already_used','settlement_unconfirmed']);
      if (!response.ok) throw new ApiError(response.status === 501 ? 'capability_planned' : catalogCodes.has(data.error?.code) ? data.error.code : 'upstream_error', typeof data.error?.message === 'string' ? data.error.message : 'Backend request failed', response.status);
      if (payment) data._payment = payment;
      return data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (signal?.aborted) throw new ApiError('request_cancelled', 'Tool call cancelled');
      if (['TimeoutError','AbortError'].includes(error.name)) throw new ApiError('upstream_timeout', 'Backend request timed out');
      throw new ApiError('backend_unavailable', 'Cannot reach the configured ShopScout backend');
    }
  };
}
