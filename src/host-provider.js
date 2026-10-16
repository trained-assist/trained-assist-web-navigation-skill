'use strict';

// Standalone MCP host provider adapter for web-navigation-skills.
// Mirrors trained-assist-search-skill/src/host-provider.js: the domain tool
// handlers stay in this repository, while host run scope, authorization and
// transport live in trained-assist-mcp-host. Read-only capability first:
// the read tools (open/text/ask/find/current_page/screenshot) are the safe
// subset; mutating tools (click/fill/login) are exported too, and the owning
// runner must gate them through allowedTools and approval policy before call.

const webOpsTools = require('./mcp-skills/tools/24-web-ops').tools;
const { toolResultContent } = require('./mcp-skills/tool-result');

const SERVER_ID = 'trained-assist-web-navigation';
const VERSION_RE = /^[a-f0-9]{40}$/;

function buildToolEntries(tools) {
  return Object.entries(tools || {}).map(([name, tool]) => ({
    name,
    description: tool.description,
    inputSchema: tool.inputSchema || { type: 'object', properties: {} },
    handler: async (args, run) => {
      const output = await tool.handler(args || {}, {
        signal: run && run.signal,
        userId: run && run.profileId,
      });
      if (output && output.imageContent) return { content: toolResultContent(name, output) };
      return output;
    },
  }));
}

function createHostProvider({ version } = {}) {
  if (typeof version !== 'string' || !VERSION_RE.test(version)) {
    throw new TypeError('provider version must be a pinned 40-character source commit');
  }
  return {
    id: SERVER_ID,
    version,
    tools: buildToolEntries(webOpsTools),
  };
}

module.exports = { createHostProvider, buildToolEntries, SERVER_ID };
