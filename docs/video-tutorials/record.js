// Records one clip per scene in scenes.json against the local simulator.
//   BASE=http://localhost:18099 node docs/video-tutorials/record.js [scene-id ...]
// Needs: backend/scripts/dev_sim.py running with a frontend build that points at BASE.
// Uses the seeded student account and synthetic studies only.
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const BASE = process.env.BASE || 'http://localhost:18099';
const OUT = path.join(__dirname, 'out');
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'scenes.json'), 'utf8'));
const only = process.argv.slice(2);

async function api(method, p, body, token) {
  const r = await fetch(BASE + '/api' + p, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return r.json().catch(() => ({}));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const login = await api('POST', '/auth/login', { email: process.env.REC_USER || 'admin@swu.ac.th', password: process.env.REC_PASS || 'admin1234' });
  const token = login.access_token || login.token;
  if (!token) throw new Error('login failed — is dev_sim running at ' + BASE + '?');
  const cj = await api('GET', '/conjoint/studies', null, token);
  const CJ = (cj.studies || cj || [])[0]?.id;
  const BE = process.env.BE_ID || 'demo-sim-chathai-001';
  const be = await api('GET', `/brand-equity/studies/${BE}`, null, token);
  const vars = { CJ, BE, BE_TOKEN: be.share_token || be.study?.share_token || '' };
  const b = await chromium.launch();
  for (const s of cfg.scenes) {
    if (only.length && !only.includes(s.id)) continue;
    const mobile = s.record.viewport === 'mobile';
    const size = mobile ? { width: cfg.mobile_viewport[0], height: cfg.mobile_viewport[1] } : { width: 1280, height: 720 };
    const ctx = await b.newContext({ viewport: size, deviceScaleFactor: 2, recordVideo: { dir: OUT, size } });
    await ctx.addInitScript((t) => { try { localStorage.setItem('token', t); } catch (e) {} }, token);
    const page = await ctx.newPage();
    const url = BASE + s.record.path.replace(/\{(\w+)\}/g, (_, k) => vars[k] || '');
    let ok = true;
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(1200);
      for (const [kind, arg] of s.record.actions) {
        if (kind === 'wait') await page.waitForTimeout(arg);
        else if (kind === 'scroll') await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), arg);
        else if (kind === 'click?') { const l = page.locator(arg).first(); if (await l.count()) { await l.scrollIntoViewIfNeeded(); await l.click().catch(() => {}); await page.waitForTimeout(800); } }
        else if (kind === 'highlight' || kind === 'find-scroll') {
          const l = page.locator(arg).first();
          if (await l.count()) {
            await l.scrollIntoViewIfNeeded();
            if (kind === 'highlight') await l.evaluate((el) => { el.style.outline = '4px solid #ef4444'; el.style.outlineOffset = '4px'; el.style.borderRadius = '6px'; });
          }
        }
      }
      await page.screenshot({ path: path.join(OUT, s.id + '.png') });
    } catch (e) { ok = false; console.log('FAIL', s.id, String(e).split('\n')[0]); }
    const v = page.video(); await ctx.close();
    if (v) fs.renameSync(await v.path(), path.join(OUT, s.id + '.webm'));
    if (ok) console.log('OK  ', s.id, s.title_th);
  }
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
