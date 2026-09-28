# ForgeMesh ShopScout MCP

**Let your agent shop and compare.**

A local stdio MCP wrapper for the ShopScout API. It exposes product search, variant lookup, offer comparison, capability discovery and shipping-plan comparison. Catalog tools require the backend connector to be enabled; a read-only backend catalog smoke test passed on 2026-09-28. Monitoring remains planned. This package is private and has not been published to npm.

## Setup

Requires Node.js 20 or later.

```bash
npm ci
npm run build
```

Start the separate ShopScout backend first (in its own terminal):

```bash
cd /absolute/path/to/x402-shopscout-server
npm run start:preview
```

Then configure your MCP client:

```json
{
  "mcpServers": {
    "shopscout": {
      "command": "node",
      "args": ["/absolute/path/to/shopscout-mcp/src/index.js"],
      "env": { "SHOPSCOUT_BASE_URL": "http://127.0.0.1:3478" }
    }
  }
}
```

Substitute your own installation paths. The wrapper does not start the backend itself, read backend source at runtime, load `.env` automatically, or require a wallet. Set `PORT` for the backend and update `SHOPSCOUT_BASE_URL` together when using another port.

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

No automatic payments, wallet access, purchases, scheduler or subscriptions. The backend also has a separate, locally tested paid gateway (`npm start` there). An HTTP 402 becomes an MCP tool error with `payment_required` and bounded decoded challenge metadata when valid; it is never interpreted as a successful result or silently paid. Future x402 support needs a separately configured spending policy and backend pricing.

The operator configures one API origin; tool inputs cannot select a URL. HTTPS is required except for localhost development. Redirects are rejected, requests have a ten-second timeout, payloads are limited to 64 KiB, and responses to 2 MB. Both successful results and failures include structured JSON; failures set `isError: true`. Stdout is reserved for MCP protocol traffic.

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

Glama and official MCP Registry metadata are prepared in `glama.json`, `server.json` and `GLAMA.md`. The repository/package remain unpublished and private; no official badge is claimed. See `GLAMA.md` for exact build-step arrays, command argv and environment schema. `Dockerfile` runs the stdio wrapper as a non-root user; a Docker build has not been verified because the preparation host lacks a container runtime. Package smoke tests are separate from container tests.

Only a configured API origin is required. This wrapper does not support private-key environment variables or automatic x402 settlement. Hosted payment and receipt features belong to the backend. License: MIT.
