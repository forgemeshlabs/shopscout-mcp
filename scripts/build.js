import {writeFileSync} from 'node:fs';
import {tools} from '../src/tools.js';
import {createMcpServer} from '../src/server.js';
// Compiles all schemas as part of the build. Pure JavaScript; no transpilation.
const server=createMcpServer();await server.close();
writeFileSync(new URL('../tool-manifest.json',import.meta.url),JSON.stringify({tools},null,2)+'\n');
console.log(`Built and validated ${tools.length} tool contracts. Planned capabilities are not executable MCP tools.`);
