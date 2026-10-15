'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createHostProvider } = require('../src/host-provider');
const VERSION = '0123456789abcdef0123456789abcdef01234567';

test('host provider exposes web navigation tools with pinned version', () => {
  const provider = createHostProvider({ version: VERSION });
  assert.equal(provider.id, 'trained-assist-web-navigation');
  assert.equal(provider.version, VERSION);
  assert.deepEqual(provider.tools.map(t => t.name), [
    'web_open', 'web_open_resilient', 'web_text', 'web_ask', 'web_find', 'web_click',
    'web_fill', 'web_login', 'web_current_page', 'web_pass_challenge', 'web_screenshot'
  ]);
  assert.equal(typeof provider.tools[0].handler, 'function');
});

test('host provider requires an immutable commit pin', () => {
  assert.throws(() => createHostProvider({}), /pinned 40-character source commit/);
  assert.throws(() => createHostProvider({ version: 'short' }), /pinned 40-character source commit/);
});
