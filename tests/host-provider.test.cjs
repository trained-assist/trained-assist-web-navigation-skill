'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createHostProvider, buildToolEntries } = require('../src/host-provider');
const VERSION = '0123456789abcdef0123456789abcdef01234567';

test('host provider exposes web navigation tools with pinned version', () => {
  const provider = createHostProvider({ version: VERSION });
  assert.equal(provider.id, 'trained-assist-web-navigation');
  assert.equal(provider.version, VERSION);
  assert.deepEqual(provider.tools.map(t => t.name), [
    'web_open', 'web_open_resilient', 'web_text', 'web_ask', 'web_find', 'web_click',
    'web_fill', 'web_login', 'web_state', 'web_pass_challenge', 'web_screenshot'
  ]);
  assert.equal(typeof provider.tools[0].handler, 'function');
});

test('host provider requires an immutable commit pin', () => {
  assert.throws(() => createHostProvider({}), /pinned 40-character source commit/);
  assert.throws(() => createHostProvider({ version: 'short' }), /pinned 40-character source commit/);
});

test('host provider maps screenshot image data into MCP content blocks', async () => {
  const [tool] = buildToolEntries({ web_screenshot: {
    description: 'Capture the current page.',
    handler: async () => ({ ok: true, url: 'https://example.com', imageContent: {
      type: 'image', data: 'aGVsbG8=', mimeType: 'image/png',
    } }),
  } });
  const output = await tool.handler({}, { profileId: 'profile-a' });
  assert.deepEqual(output.content, [
    { type: 'text', text: JSON.stringify({ ok: true, url: 'https://example.com' }, null, 2) },
    { type: 'image', data: 'aGVsbG8=', mimeType: 'image/png' },
  ]);
});
