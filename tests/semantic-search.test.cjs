'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPayload, safeCandidateLabel, semanticRank } = require('../src/semantic-search');

test('payload contains only short navigation labels and no editable controls or sensitive-looking strings', () => {
  const payload = buildPayload('управление DNS', [], [
    { handle: '0', tag: 'button', text: 'Домены', visible: true },
    { handle: '1', tag: 'input', label: 'DNS', visible: true },
    { handle: '2', tag: 'button', text: 'user@example.com', visible: true },
    { handle: '3', tag: 'button', text: 'Account', visible: true, disabled: true },
    { handle: '4', tag: 'a', ariaLabel: 'DNS settings', visible: true, href: '/secret-path' },
  ]);
  assert.deepEqual(payload, { intent: 'управление DNS', candidates: [{ index: 0, label: 'Домены' }, { index: 4, label: 'DNS settings' }] });
  assert.equal(JSON.stringify(payload).includes('/secret-path'), false);
  assert.equal(safeCandidateLabel({ tag: 'button', text: 'Call +1 (555) 123-4567', visible: true }), '');
});

test('semantic response is restricted to known indices and valid scores', async () => {
  const result = await semanticRank({ intent: 'dns', candidates: [{ index: 2, label: 'Domains' }] }, {
    endpoint: 'https://worker.test/v1/rank', accessClientId: 'id', accessClientSecret: 'secret',
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.deepEqual(body, { intent: 'dns', candidates: [{ index: 2, label: 'Domains' }] });
      assert.equal(options.headers['CF-Access-Client-Secret'], 'secret');
      return { ok: true, json: async () => ({ matches: [{ index: 2, score: 0.9 }, { index: 99, score: 1 }, { index: 2, score: 4 }] }) };
    },
  });
  assert.deepEqual(result, [{ index: 2, score: 0.9 }]);
});
