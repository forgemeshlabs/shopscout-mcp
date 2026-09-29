# Glama build and runtime instructions

Status: published 2026-09-29 as npm `@forgemeshlabs/shopscout-mcp` 0.3.0 (public repository https://github.com/forgemeshlabs/shopscout-mcp, MCP Registry `io.github.forgemeshlabs/shopscout-mcp`). Glama submission and hosted-build badge not yet verified.

## Repository and Dockerfile

Planned repository: https://github.com/forgemeshlabs/shopscout-mcp

After the repository is published, use this Dockerfile URL in Glama's Dockerfile/repository configuration field:
https://github.com/forgemeshlabs/shopscout-mcp/blob/main/Dockerfile

This is not a claim that the URL currently exists. Local reference: `Dockerfile`.

## Dashboard build steps

```json
["npm ci --omit=dev", "npm run build"]
```

## Dashboard command arguments

```json
["node", "src/index.js"]
```

Do not enter a shell string or nested arrays. Do not add `mcp-proxy` unless the dashboard explicitly requires its wrapper. Glama's dashboard fields are separate state; `glama.json` does not populate or verify them.

## Environment variable schema

```json
{
  "type": "object",
  "properties": {
    "SHOPSCOUT_BASE_URL": {
      "type": "string",
      "description": "Trusted ShopScout HTTPS API origin; localhost HTTP is allowed only for development. No credentials, paths, queries or fragments."
    }
  },
  "required": ["SHOPSCOUT_BASE_URL"],
  "additionalProperties": false
}
```

`WALLET_PRIVATE_KEY` is optional: with it the server pays the $0.01 x402 fee per paid tool call (capped by `SHOPSCOUT_MAX_PRICE_USD`); without it paid tools return the 402 challenge as data. The default backend is the hosted https://shopscout.forgemesh.io, so a hosted container needs no local backend; initialization/list-tools makes no backend request.

## Container

```bash
docker build -t shopscout-mcp:local .
docker run --rm -i --network=host \
  -e WALLET_PRIVATE_KEY=0x... shopscout-mcp:local
```

The host-network example is for Linux local development. For a deployed backend, omit host networking and supply its HTTPS origin. Stdio protocol output goes to stdout; diagnostics go to stderr. The image runs as the non-root `node` user and contains only the MCP wrapper, not the backend or its credentials.

Docker build/run verification is pending: no Docker or Podman runtime was available in the preparation environment. Package installation and real SDK stdio negotiation are tested separately. After publication, re-check Glama's actual build fields, five tools, repository ownership/official badge and release metadata rather than assuming a push updated them.
