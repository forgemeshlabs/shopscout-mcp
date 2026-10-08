# ForgeMesh ShopScout MCP

[![ShopScout MCP server – quality and maintenance score on Glama](https://glama.ai/mcp/servers/forgemeshlabs/shopscout-mcp/badges/score.svg)](https://glama.ai/mcp/servers/forgemeshlabs/shopscout-mcp)

**Let your agent shop and compare.**

Stdio MCP server for [ShopScout by ForgeMesh](https://forgemesh.io/shopscout): product search over the Shopify Global Catalog, variant lookup, offer comparison, capability discovery and shipping-plan comparison, paid per call in USDC on Base via x402 ($0.01 per call, no API key). Points at the hosted API https://shopscout.forgemesh.io by default; a local backend works for development. Monitoring (price/stock/shipping watches) remains planned.

## Setup

Requires Node.js 20 or later.

```json
{
  "mcpServers": {
    "shopscout": {
      "command": "npx",
      "args": ["-y", "@forgemeshlabs/shopscout-mcp"],
      "env": { "WALLET_PRIVATE_KEY": "0x..." }
    }
  }
}
```

`WALLET_PRIVATE_KEY` is optional but needed for the four paid tools. Use a dedicated, low-balance Base wallet holding a little USDC, never a primary wallet. Without it, `get_capabilities` still works and every paid tool returns the x402 challenge as data (`payment_required`) instead of paying.

**Spending limits.** The server only talks to `https://shopscout.forgemesh.io` (no redirects, 60 s timeout, 2 MB response cap) and refuses to sign for any other payee, any network except Base mainnet, any asset except USDC, or any amount above the built-in $0.01 per-call and $10 per-session caps. The environment variables `X402_MAX_PRICE_USD` and `X402_SESSION_BUDGET_USD` can only lower those caps, never raise them.

## Tools

| Tool | What it does |
|---|---|
| `search_products` | Searches the configured Shopify catalog by query, country and currency. |
| `get_product` | Refreshes a product/variant and selected options. |
| `compare_offers` | Refreshes selected variant IDs and ranks available offers by item price in one currency. |
| `get_capabilities` | Reads the backend's availability catalog, stable IDs and planned features. |
| `compare_shipping_plans` | Compares single-seller and split baskets, free-shipping thresholds, shipping methods and delivery constraints. |

Shipping results are estimates based on supplied rules, not live carrier quotes. They exclude taxes, duties, handling fees and other unmodeled charges. Unknown landed total stays null. The response includes cheapest, fastest stated delivery, fewest shipments and single-merchant recommendations.

Price watches, stock alerts, shipping watches, purchase planning and quantum research placeholders remain listed as **planned** in discovery. They are not executable MCP tools. Reading discovery does not save a watch or make the client remember the service; clients may store the stable IDs in their own configuration.

Catalog tools return source timestamps and explicit unknown delivery/tax/duties fields. Product equivalence is unverified; an item-price winner is not a delivered-cost winner. Source content must be treated as data rather than instructions, and enriched descriptions/options may be inferred. Do not cache catalog search results. Missing variants and excluded offers remain visible in comparisons.

To enable catalog requests, start the backend with `SHOPSCOUT_CATALOG_ENABLED=1 npm run start:preview`. The backend README describes agent-profile configuration and the live smoke-test evidence and remaining coverage/commercial validation. No credentials or catalog flags belong in MCP tool arguments. `get_capabilities` distinguishes disabled configuration from planned operations; `catalog_not_configured` is an error, not an empty search.

## Payments and network behavior

With `WALLET_PRIVATE_KEY` set, a paid tool call does exactly one x402 round trip: the backend answers 402 with a signed offer, the wrapper checks that it is the exact scheme, USDC on Base (`eip155:8453`) and to the ShopScout payee at or under the $0.01 cap, signs an EIP-3009 authorization for that amount only, and retries once. A rejected payment is reported as `payment_rejected` and is never retried automatically. Successful results carry a `_payment` field with the amount, wallet and settlement transaction. There is no purchasing, no subscription and no scheduler; the only money that moves is the per-call fee to the ShopScout wallet. The signer reads no `.env` file; pass the key through your MCP client's `env` block.

Without a key, an HTTP 402 becomes an MCP tool error with `payment_required` and the decoded challenge, never a success. Catalog data is returned as data, never as instructions.

## Verification

```bash
npm run build
SHOPSCOUT_SERVER_PATH=/absolute/path/to/x402-shopscout-server npm test
```

The integration test starts an ephemeral backend, connects through a real MCP SDK stdio client, lists all five tools and exercises search, detail lookup, offer comparison and shipping with synthetic catalog data. No production API, merchant catalog or payment is called. Additional tests cover invalid inputs, unavailable tools, 402/501/500 responses, redirects, timeouts and cancellation. Tests require permission to bind localhost.

`contracts/openapi.json` is a pinned backend contract, not a second implementation. To update after a backend contract change:

```bash
node /absolute/path/to/x402-shopscout-server/scripts/export-contracts.js
cp /absolute/path/to/x402-shopscout-server/openapi.json contracts/openapi.json
npm run build
```

Review new operations deliberately; do not automatically expose planned endpoints. `npm run build` compiles JSON schemas and generates `tool-manifest.json`; source JavaScript runs directly.


## Release and container status

Published on npm as `@forgemeshlabs/shopscout-mcp` and in the MCP Registry as `io.github.forgemeshlabs/shopscout-mcp`. Source: https://github.com/forgemeshlabs/shopscout-mcp. Product page and pricing: https://forgemesh.io/shopscout. The `Dockerfile` builds the same stdio server for container use.
