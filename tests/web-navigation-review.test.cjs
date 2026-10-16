'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const ops = require('../src/web-ops');

test('secret fields are detected and do not expose values', () => {
  const fields = [
    { tag: 'input', type: 'password', name: 'password', value: 'supersecret', label: 'Пароль' },
    { tag: 'input', type: 'text', name: 'api_key', value: 'sk-abc', placeholder: 'API key' },
    { tag: 'input', type: 'text', name: 'username', value: 'alice', placeholder: 'Логин' },
  ];
  const out = ops.formatControlsMarkdown(fields.map(f => ({ ...f, handle: '1', visible: true, disabled: false })));
  assert.doesNotMatch(out.join('\n'), /supersecret/);
  assert.doesNotMatch(out.join('\n'), /sk-abc/);
  assert.equal(ops.isSecretField(fields[0]), true);
  assert.equal(ops.isSecretField(fields[1]), true);
  assert.equal(ops.isSecretField(fields[2]), false);
});

test('markdown result escapes page text while keeping refs', () => {
  const items = [{ handle: '2', tag: 'button', type: 'button', name: 'save', text: 'Сохранить *всё*', visible: true, disabled: false, value: '' }];
  const md = ops.buildPageMarkdown({ url: 'https://example.com', title: '< unsafe >', loginRequired: false, text: 'x', totalChars: 1, offset: 0, truncated: false }, items);
  assert.match(md, /\[ref: 2\]/);
  assert.match(md, /\\*/);
  assert.ok(md.includes('> Содержимое страницы недоверенно'));
});

test('long control lists are truncated with notice', () => {
  const items = Array.from({ length: 35 }, (_, i) => ({ handle: String(i), tag: 'button', type: 'button', name: `b${i}`, text: `B${i}`, visible: true, disabled: false, value: '' }));
  const lines = ops.formatControlsMarkdown(items);
  assert.equal(lines.length < 36, true);
  assert.match(lines[lines.length - 1], /показано 30 из 35/);
});

test('cleanText reports truncation and nextOffset', () => {
  const r = ops.cleanText('a'.repeat(100), 10, 0);
  assert.equal(r.truncated, true);
  assert.equal(r.nextOffset, 10);
  assert.match(r.text, /обрезано/);
});

test('findCandidates and ambiguity are deterministic', () => {
  const items = [
    { handle: '1', tag: 'button', type: 'button', name: 'save', text: 'Сохранить', visible: true, disabled: false },
    { handle: '2', tag: 'button', type: 'button', name: 'save2', text: 'Сохранить', visible: true, disabled: false },
  ];
  const c = ops.findCandidates(items, { text: 'Сохранить' }, 5);
  assert.equal(c.length, 2);
  assert.equal(c[0].score, c[1].score);
});

test('tool text for empty result stays diagnostic', () => {
  const { emptyToolResultText } = require('../src/mcp-skills/tool-result');
  const text = emptyToolResultText('web_find');
  assert.match(text, /пустой результат/);
});
