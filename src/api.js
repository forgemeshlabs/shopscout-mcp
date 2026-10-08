import { createRequire } from 'node:module';
const { createGuard } = createRequire(import.meta.url)('../x402-guard.cjs');
export class ApiError extends Error {
  constructor(code, message, status) { super(message); this.code = code; this.status = status; }
}
export const BASE_URL = 'https://shopscout.forgemesh.io';
const PAY_TO = ['0xabf4Fc4Feda1E02444247650a23f4acB4E308f66'];
function parseChallenge(response) {
  const header = response.headers.get('payment-required');
  if (!header || header.length > 16384) return null;
  try {
    const challenge = JSON.parse(Buffer.from(header, 'base64').toString());
    if (challenge.x402Version === 2 && Array.isArray(challenge.accepts) && challenge.accepts.length <= 10) return challenge;
  } catch { /* malformed metadata: treat as no challenge */ }
  return null;
}
// x402 payer (fleet MCP convention): optional WALLET_PRIVATE_KEY for a dedicated low-balance Base wallet.
// Signing is gated by x402-guard (Base USDC only, this backend's payee only, <= $0.01 per call; the
// X402_MAX_PRICE_USD / X402_SESSION_BUDGET_USD env vars can only lower the caps). No key → the 402 is
// surfaced as data, never signed.
function createHttpClient(walletKey, guard) {
  if (!walletKey) {
    return {
      getPaymentRequiredResponse(get) {
        const error = new ApiError('payment_required', 'This route costs USDC via x402. Set WALLET_PRIVATE_KEY to a dedicated low-balance Base wallet holding a little USDC to let this MCP pay per call (capped at $0.01 per call), or call the HTTP API with your own x402 client.', 402);
        const challenge = parseChallenge({ headers: { get } });
        if (challenge) error.paymentRequired = challenge;
        throw error;
      }
    };
  }
  let ready;
  const load = () => (ready ??= (async () => {
    const [{ x402Client, x402HTTPClient }, { ExactEvmScheme }, { toClientEvmSigner }, { privateKeyToAccount }] = await Promise.all([
      import('@x402/core/client'), import('@x402/evm/exact/client'), import('@x402/evm'), import('viem/accounts')
    ]);
    const account = privateKeyToAccount(walletKey.startsWith('0x') ? walletKey : `0x${walletKey}`);
    return new x402HTTPClient(new x402Client().register('eip155:*', new ExactEvmScheme(toClientEvmSigner(account))).registerPolicy(guard.policy));
  })());
  return {
    async callPaid(path, opts) { return guard.callPaid(await load(), path, opts); }
  };
}
const catalogCodes = new Set(['catalog_not_configured','catalog_rate_limited','catalog_unavailable','catalog_timeout','catalog_payment_required','catalog_tool_error','invalid_catalog_response','payment_already_used','settlement_unconfirmed']);
// Translate guard.callPaid errors ("HTTP <status>: <body, max 200 chars>") into the tool's ApiError codes.
function mapError(error) {
  if (error instanceof ApiError) return error;
  const m = String(error?.message || '');
  let hit;
  if (/refused to sign|were rejected by|No network\/scheme/.test(m)) return new ApiError('payment_refused', m.slice(0, 400), 402);
  if ((hit = m.match(/^Payment failed — HTTP (\d+)/))) return new ApiError('payment_rejected', 'The signed payment was not accepted. Check the wallet USDC balance on Base and retry once.', Number(hit[1]));
  if ((hit = m.match(/^HTTP (\d+): non-JSON response/))) return new ApiError('invalid_upstream_response', 'Backend did not return valid JSON', Number(hit[1]));
  if ((hit = m.match(/^HTTP (\d+): ([\s\S]*)/))) {
    const status = Number(hit[1]);
    const code = (hit[2].match(/"code"\s*:\s*"([a-z_]+)"/) || [])[1];
    return new ApiError(status === 501 ? 'capability_planned' : catalogCodes.has(code) ? code : 'upstream_error', 'Backend request failed', status);
  }
  if (['TimeoutError','AbortError'].includes(error?.name)) return new ApiError('upstream_timeout', 'Backend request timed out');
  return new ApiError('backend_unavailable', 'Cannot reach the ShopScout backend');
}
export function createApiClient({ walletKey = process.env.WALLET_PRIVATE_KEY } = {}) {
  const guard = createGuard({ baseUrl: BASE_URL, payTo: PAY_TO, maxPriceUsd: 0.01, sessionBudgetUsd: 10 });
  const payer = createHttpClient(walletKey, guard);
  return async function request(route, args, signal) {
    const body = route.method === 'POST' ? args : undefined;
    if (body && Buffer.byteLength(JSON.stringify(body)) > 65536) throw new ApiError('payload_too_large', 'Input exceeds 64 KiB');
    const opts = { method: route.method, body, headers: { Accept: 'application/json' } };
    const call = payer.callPaid
      ? payer.callPaid(route.path, opts)
      : guard.callPaid(payer, route.path, opts);
    let aborted;
    const cancelled = new Promise((_, reject) => { aborted = () => reject(new ApiError('request_cancelled', 'Tool call cancelled')); if (signal?.aborted) aborted(); else signal?.addEventListener('abort', aborted, { once: true }); });
    try {
      const data = await Promise.race([call, cancelled]);
      if (!data || typeof data !== 'object' || Array.isArray(data) || data._binary) throw new ApiError('invalid_upstream_response', 'Backend response must be a JSON object');
      return data;
    } catch (error) {
      throw mapError(error);
    } finally {
      signal?.removeEventListener('abort', aborted);
      call.catch(() => {}); // a losing race branch must not surface as an unhandled rejection
    }
  };
}
