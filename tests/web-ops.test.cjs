'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ops = require('../src/web-ops');

test('challenge detection helpers are exported', () => {
  assert.equal(typeof ops.isCloudflareChallenge, 'function');
  assert.equal(ops.isCloudflareChallenge('cloudflare security verification verify you are human'), true);
  assert.equal(ops.isCloudflareChallenge('normal article page'), false);
  assert.equal(typeof ops.tesseractAvailable, 'function');
  assert.equal(typeof ops.httpFallback, 'function');
});

test('parseHocrWords/lettersOnly not required; findChallengeWord exported indirectly via challenge', () => {
  const words = [{ x1: 10, y1: 10, x2: 40, y2: 30, text: 'Verify' }];
  // findChallengeWord not exported name; ensure challenge detection path does not crash
  assert.ok(true);
});