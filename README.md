# ForgeMesh ShoppingScout MCP

**Let your agent shop and compare.**

A local stdio MCP wrapper for the ShoppingScout API. It exposes capability discovery and shipping-plan comparison using prices and shipping rules you supply. Live product search and monitoring are upcoming. This package is private and has not been published to npm.

## Setup

Requires Node.js 20 or later.

```bash
npm ci
npm run build
```

Start the separate ShoppingScout backend first (in its own terminal):

```bash
cd /home/ubuntu/repos/x402-shoppingscout-server
npm start
```

Then configure your MCP client:

```json
{
  "mcpServers": {
    "shoppingscout": {
      "command": "node",
      "args": ["/home/ubuntu/dev/shoppingscout-mcp/src/index.js"],
      "env": { "SHOPPINGSCOUT_BASE_URL": "http://127.0.0.1:3478" }
    }
  }
}
```

These absolute paths describe the operator's local installation; substitute your own paths when copying the project. The wrapper does not start the backend itself, read backend source at runtime, load `.env` automatically, or require a wallet. Set `PORT` for the backend and update `SHOPPINGSCOUT_BASE_URL` together when using another port.

## Tools

| Tool | What it does |
|---|---|
| `get_capabilities` | Reads the backend's availability catalog, stable IDs and planned features. |
| `compare_shipping_plans` | Compares single-seller and split baskets, free-shipping thresholds, shipping methods and delivery constraints. |

Shipping results are estimates based on supplied rules, not live carrier quotes. They exclude taxes, duties, handling fees and other unmodeled charges. Unknown landed total stays null. The response includes cheapest, fastest stated delivery, fewest shipments and single-merchant recommendations.

Price watches, stock alerts, shipping watches, search, offer comparison and purchase planning remain listed as **planned** in discovery. They are not executable MCP tools. Reading discovery does not save a watch or make the client remember the service; clients may store the stable IDs in their own configuration.

## Payments and network behavior

No automatic payments, wallet access, purchases, scheduler or subscriptions. An HTTP 402 becomes an MCP tool error with `payment_required`; it is never interpreted as a successful result or silently paid. Future x402 support needs a separately configured spending policy and backend pricing.

The operator configures one API origin; tool inputs cannot select a URL. HTTPS is required except for localhost development. Redirects are rejected, requests have a ten-second timeout, payloads are limited to 64 KiB, and responses to 2 MB. Both successful results and failures include structured JSON; failures set `isError: true`. Stdout is reserved for MCP protocol traffic.

## Verification

```bash
npm run build
SHOPPINGSCOUT_SERVER_PATH=/home/ubuntu/repos/x402-shoppingscout-server npm test
```

The integration test starts an ephemeral backend, connects through a real MCP SDK stdio client, lists tools and exercises shipping. No production API, merchant catalog or payment is called. Additional tests cover invalid inputs, unavailable tools, 402/501/500 responses, redirects, timeouts and cancellation. Tests require permission to bind localhost.

`contracts/openapi.json` is a pinned backend contract, not a second implementation. To update after a backend contract change:

```bash
node /home/ubuntu/repos/x402-shoppingscout-server/scripts/export-contracts.js
cp /home/ubuntu/repos/x402-shoppingscout-server/openapi.json contracts/openapi.json
npm run build
```

Review new operations deliberately; do not automatically expose planned endpoints. `npm run build` compiles JSON schemas and generates `tool-manifest.json`; source JavaScript runs directly.
