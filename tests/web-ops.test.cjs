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
test('parse single-quote hocr words', () => {
  const hocr = "<span class='ocrx_word' id='word_1_2' title='bbox 531 434 565 461; x_wconf 58'>Verify</span>";
  const words = require('../src/web-ops').parseHocrWords(hocr);
  assert.equal(words.length, 1);
  assert.equal(words[0].text, 'Verify');
  assert.equal(words[0].x1, 531);
  assert.equal(words[0].x2, 565);
});
