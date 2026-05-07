#!/usr/bin/env node
/* eslint-disable no-console */
// One-shot migration: hardcoded learnContent.js → CMS posts.
// Uses Node 20's built-in fetch (no deps).

import { readFileSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPath = resolve(__dirname, '../frontend/.env');
const env = readFileSync(envPath, 'utf-8');
const apiBase = (env.match(/^REACT_APP_BACKEND_URL=(.*)$/m) || [])[1]?.trim() + '/api';
console.log(`[migrate] API base: ${apiBase}`);

const learnUrl = pathToFileURL(resolve(__dirname, '../frontend/src/pages/learn/learnContent.js')).href;
const { ARTICLE_LIST, ARTICLES } = await import(learnUrl);
console.log(`[migrate] hardcoded articles: ${ARTICLE_LIST.length}`);

const j = async (r) => {
  const t = await r.text();
  try { return JSON.parse(t); } catch { return t; }
};

// 1. Login
const loginRes = await fetch(`${apiBase}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@swu.ac.th', password: 'admin123' }),
});
const loginData = await j(loginRes);
const token = loginData.access_token || loginData.token;
if (!token) { console.error('[migrate] login failed:', loginData); process.exit(1); }
const authH = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

// 2. Existing slugs
const exRes = await fetch(`${apiBase}/cms/posts/public?type=article&limit=200`);
const existing = (await j(exRes)).items || [];
const existingSlugs = new Set(existing.map(p => p.slug));
console.log(`[migrate] existing CMS articles: ${existingSlugs.size}`);

function toMarkdown(article) {
  const parts = [];
  if (article.description) parts.push(`> ${article.description}`);
  for (const sec of (article.sections || [])) {
    if (sec.h) parts.push(`## ${sec.h}`);
    if (sec.body) parts.push(sec.body);
  }
  if (article.tool) {
    parts.push(`---\n\n### 🛠️ เครื่องมือที่เกี่ยวข้อง\n\n**[${article.tool.name}](${article.tool.path})** — ${article.tool.description}`);
  }
  if (article.related?.length) {
    parts.push(`### บทความที่เกี่ยวข้อง\n\n${article.related.map(s => {
      const r = ARTICLES[s];
      return r ? `- [${r.title}](/learn/${s})` : null;
    }).filter(Boolean).join('\n')}`);
  }
  return parts.join('\n\n');
}

let created = 0, skipped = 0, failed = 0;
for (const art of ARTICLE_LIST) {
  if (existingSlugs.has(art.slug)) {
    console.log(`[migrate] SKIP exists: ${art.slug}`);
    skipped++; continue;
  }
  try {
    const payload = {
      type: 'article',
      title: art.title,
      title_en: art.titleEn || null,
      slug: art.slug,
      category: art.category || 'General',
      excerpt: art.description || '',
      body_md: toMarkdown(art),
      cover_image: art.image || null,
      cover_caption: null,
      read_min: art.readMin || 5,
      tags: (art.keywords || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 6),
      source_refs: [],
    };
    const r1 = await fetch(`${apiBase}/cms/posts`, { method: 'POST', headers: authH, body: JSON.stringify(payload) });
    if (!r1.ok) throw new Error(`create ${r1.status}`);
    const post = await j(r1);
    const r2 = await fetch(`${apiBase}/cms/posts/${post.id}`, { method: 'PUT', headers: authH, body: JSON.stringify({ status: 'published' }) });
    if (!r2.ok) throw new Error(`publish ${r2.status}`);
    console.log(`[migrate] CREATED+PUBLISHED: ${art.slug}`);
    created++;
  } catch (e) {
    console.error(`[migrate] FAIL ${art.slug}: ${e.message}`);
    failed++;
  }
}

console.log(`\n[migrate] done — created=${created}, skipped=${skipped}, failed=${failed}, total_in_source=${ARTICLE_LIST.length}`);
