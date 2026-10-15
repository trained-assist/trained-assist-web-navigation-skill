'use strict';
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

const URL = (process.env.URLS || 'https://chatgpt.com').split(',')[0].trim();
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

function parseHocrWords(hocr) {
  const out = [];
  for (const m of String(hocr || '').matchAll(/<span class=['"]ocrx_word['"][^>]*title=['"]bbox (\d+) (\d+) (\d+) (\d+)(?:;[^'"]*)?['"][^>]*>([^<]*)<\/span>/g)) {
    out.push({ x1:+m[1], y1:+m[2], x2:+m[3], y2:+m[4], text:String(m[5]||'').trim() });
  }
  return out;
}

function findVerify(words) {
  return words.find(w => /verif/i.test(w.text)) || words.find(w => /verif/i.test(w.text.replace(/[^A-Za-z]/g,'')));
}

function isChallenge(title, text) {
  return /just a moment|один момент|security (check|verification)|performing security|verify you are human/i.test(`${title} ${text}`);
}

async function attemptVariant(variant) {
  const headed = process.env.HEADED === '1';
  const browser = await chromium.launch({
    headless: !headed,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

  let status = null;
  try {
    const response = await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    status = response ? response.status() : null;
  } catch (e) {
    console.error('NAV_ERROR', e.message);
  }
  await page.waitForTimeout(5000);

  const baseTag = Buffer.from(URL).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
  const beforePath = `/tmp/lo/${variant}-before.png`;
  await page.screenshot({ path: beforePath });
  const beforeHocr = runTesseract(beforePath);
  const beforeText = ocrText(beforeHocr);
  const titleBefore = await page.title();
  const challengeBefore = isChallenge(titleBefore, beforeText);
  const words = parseHocrWords(beforeHocr);
  const verify = findVerify(words);
  const x0 = verify ? Math.max(10, Math.round(verify.x1 - Math.max(24, (verify.x2 - verify.x1) * 0.32))) : 160;
  const y0 = verify ? Math.round((verify.y1 + verify.y2) / 2) : 320;
  const offsets = { v1: [0], v2: [-12], v3: [-24], v4: [0, -24] }[variant] || [0];
  let click = null;
  if (challengeBefore) {
    for (const dx of offsets) {
      const x = x0 + dx;
      const y = y0;
      click = { x, y, dx, verify: verify ? verify.text : null };
      await page.mouse.move(x - 60, y - 20, { steps: 12 });
      await page.waitForTimeout(120);
      await page.mouse.move(x, y, { steps: 16 });
      await page.waitForTimeout(150);
      await page.mouse.click(x, y, { delay: 150 });
      await page.waitForTimeout(3000);
    }
    await page.waitForTimeout(7000);
  }

  const afterPath = `/tmp/lo/${variant}-after.png`;
  await page.screenshot({ path: afterPath });
  const afterHocr = runTesseract(afterPath);
  const afterText = ocrText(afterHocr);
  const titleAfter = await page.title();
  const challengeAfter = isChallenge(titleAfter, afterText);

  await browser.close();
  return { variant, url: URL, status, titleBefore, titleAfter, challengeBefore, challengeAfter, click, ok: !challengeAfter };
}

(async () => {
  const results = [];
  for (const variant of ['v1', 'v2', 'v3', 'v4']) {
    try {
      results.push(await attemptVariant(variant));
    } catch (e) {
      results.push({ variant, error: String(e && e.message || e) });
    }
  }
  console.log(JSON.stringify(results, null, 2));
})();
EOF
git add scripts && git commit -m "experiment: headed challenge variant matrix" && git push