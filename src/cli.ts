#!/usr/bin/env node

import { JoplinServer } from './index.js';

const server = new JoplinServer();

server.run().catch((error) => {
  console.error('[Fatal] Failed to start Joplin MCP server:', error);
  process.exit(1);
});
