#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';
try {
  const server = createMcpServer();
  await server.connect(new StdioServerTransport());
} catch {
  console.error('ShopScout MCP failed to start. Check installed dependencies.');
  process.exitCode = 1;
}
