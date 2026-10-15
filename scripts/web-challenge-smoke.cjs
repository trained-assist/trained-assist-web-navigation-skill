'use strict';
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const ops = require('../src/web-ops');

const urls = (process.env.URLS || 'https://chatgpt.com')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

fs.mkdirSync('/tmp/lo', { recursive: true });

function runTesseract(imagePath) {
  const base = imagePath.replace(/\.png$/i, '');
  try {
    execFileSync('tesseract', [imagePath, base, '--psm', '6', 'hocr'], { stdio: 'ignore', timeout: 15000 });
    return fs.readFileSync(`${base}.hocr`, 'utf8');
  } catch {
    return '';
  }
}

function ocrText(hocr) {
  return String(hocr || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function isChallenge(title, text) {
  return /just a moment|один момент|security (check|verification)|performing security|verify you are human/i.test(`${title} ${text}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const results = [];
  for (const url of urls) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    let status = null;
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      status = response ? response.status() : null;
    } catch (e) {
      console.error('NAV_ERROR', url, e.message);
    }
    await page.waitForTimeout(4000);
    const tag = Buffer.from(url).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 18);
    const beforePath = `/tmp/lo/before-${tag}.png`;
    await page.screenshot({ path: beforePath });
    const beforeHocr = runTesseract(beforePath);
    const beforeOcr = ocrText(beforeHocr);
    const titleBefore = await page.title();
    const challengeBefore = isChallenge(titleBefore, beforeOcr);
    let click = null;
    if (challengeBefore) {
      const words = ops.parseHocrWords(beforeHocr);
      const debugSpan = (beforeHocr.match(/<span class="ocrx_word"[^>]{0,240}>[^<]{0,60}/) || [])[0] || '';
      console.error('HOCR_DEBUG', JSON.stringify(debugSpan));
      const word = ops.findChallengeWord(words);
      const x = word ? Math.max(10, Math.round(word.x1 - Math.max(24, (word.x2 - word.x1) * 0.32))) : 160;
      const y = word ? Math.round((word.y1 + word.y2) / 2) : 320;
      click = { x, y, source: word ? 'ocr' : 'default', word: word ? word.text : null };
      await page.mouse.click(x, y);
      await page.waitForTimeout(6000);
    }
    const afterPath = `/tmp/lo/after-${tag}.png`;
    await page.screenshot({ path: afterPath });
    const afterHocr = runTesseract(afterPath);
    const afterOcr = ocrText(afterHocr);
    const titleAfter = await page.title();
    const challengeAfter = isChallenge(titleAfter, afterOcr);
    results.push({
      url,
      ocrBeforeSnippet: beforeOcr.slice(0,220),
      status,
      titleBefore,
      titleAfter,
      challengeBefore,
      challengeAfter,
      ocrAvailable: Boolean(beforeHocr),
      click,
      ok: !challengeAfter && titleAfter !== '' && !challengeBefore === false ? !challengeAfter : !challengeAfter,
      screenshots: { before: beforePath, after: afterPath },
    });
    await page.close();
  }
  await browser.close();
  console.log(JSON.stringify(results, null, 2));
})();