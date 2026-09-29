# Changelog

## 0.3.0 — 2026-09-29

- First public release: npm `@forgemeshlabs/shopscout-mcp`, default API origin https://shopscout.forgemesh.io.
- Optional `WALLET_PRIVATE_KEY` pays x402 challenges (exact USDC on Base) once per call, capped by `SHOPSCOUT_MAX_PRICE_USD` (default $0.01); results carry `_payment` with the settlement transaction.
- Without a key the 402 challenge is still returned as data, as before.
- Backend integration test skips cleanly when `SHOPSCOUT_SERVER_PATH` is unset; payment path covered by stub tests.

## 0.2.0 — 2026-09-28 (unpublished)

- Product search, product/variant lookup and offer comparison join shipping comparison and capability discovery.
- x402 challenges can be inspected without signing or spending.
- Add Glama/registry metadata, container recipe, MIT license and security policy.
- Planned monitoring and quantum operations remain outside executable tool discovery.

## 0.1.0 — Local prototype

- Stdio MCP discovery and shipping-plan estimates using caller-supplied rules.
