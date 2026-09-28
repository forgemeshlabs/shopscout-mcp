export class ApiError extends Error {
  constructor(code, message, status) { super(message); this.code = code; this.status = status; }
}
export function parseBaseUrl(value = 'http://127.0.0.1:3478') {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('SHOPPINGSCOUT_BASE_URL must be an origin without credentials, path, query or fragment');
  if (!(url.protocol === 'https:' || url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) throw new Error('Use HTTPS, or HTTP on localhost for development');
  return url.origin;
}
export function createApiClient({ baseUrl = parseBaseUrl(process.env.SHOPPINGSCOUT_BASE_URL), timeoutMs = 10000 } = {}) {
  baseUrl = parseBaseUrl(baseUrl);
  return async function request(route, args, signal) {
    const body = route.method === 'POST' ? JSON.stringify(args) : undefined;
    if (body && Buffer.byteLength(body) > 65536) throw new ApiError('payload_too_large', 'Input exceeds 64 KiB');
    let response, data;
    try {
      response = await fetch(new URL(route.path, baseUrl), {
        method: route.method, redirect: 'error', headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body,
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs)
      });
      // Do not consume/forward a payment challenge as success; no automatic wallet access.
      if (response.status === 402) { await response.body?.cancel(); throw new ApiError('payment_required', 'Backend requires payment. This wrapper does not sign or submit payments.', 402); }
      const reader = response.body?.getReader(); const chunks = []; let size = 0;
      if (reader) for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 2_000_000) { await reader.cancel(); throw new ApiError('response_too_large', 'Backend response exceeds 2 MB'); } chunks.push(value); }
      const raw = Buffer.concat(chunks).toString();
      try { data = JSON.parse(raw); } catch { throw new ApiError('invalid_upstream_response', 'Backend did not return valid JSON', response.status); }
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ApiError('invalid_upstream_response', 'Backend response must be a JSON object', response.status);
      const catalogCodes = new Set(['catalog_not_configured','catalog_rate_limited','catalog_unavailable','catalog_timeout','catalog_payment_required','catalog_tool_error','invalid_catalog_response','catalog_response_too_large','invalid_input']);
      if (!response.ok) throw new ApiError(response.status === 501 ? 'capability_planned' : catalogCodes.has(data.error?.code) ? data.error.code : 'upstream_error', typeof data.error?.message === 'string' ? data.error.message : 'Backend rejected the request', response.status);
      return data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (signal?.aborted) throw new ApiError('request_cancelled', 'Tool call cancelled');
      if (['TimeoutError','AbortError'].includes(error.name)) throw new ApiError('upstream_timeout', 'Backend request timed out');
      throw new ApiError('backend_unavailable', 'Cannot reach the configured ShoppingScout backend');
    }
  };
}
