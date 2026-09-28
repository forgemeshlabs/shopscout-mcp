#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';
try {
  const server = createMcpServer();
  await server.connect(new StdioServerTransport());
} catch {
  console.error('ShoppingScout MCP failed to start. Check SHOPPINGSCOUT_BASE_URL and installed dependencies.');
  process.exitCode = 1;
}
