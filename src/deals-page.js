// Builds docs/index.html — the "link in bio" deals page served by GitHub Pages.
// Deals posted most recently appear first. Run: npm run deals-page
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const deals = JSON.parse(await readFile(path.join(root, 'telugu-stories/deals.json'), 'utf8'));
const logFile = path.join(root, 'cards-posted.json');
const log = existsSync(logFile) ? JSON.parse(await readFile(logFile, 'utf8')) : [];
const postedAt = Object.fromEntries(log.filter((e) => e.type === 'deal').map((e) => [e.id, e.postedAt]));
// Recently posted first (that's what people tap through from), then the rest.
const sorted = [...deals].sort((a, b) => (postedAt[b.id] || '').localeCompare(postedAt[a.id] || ''));

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const card = (d) => `
  <a class="deal" href="${esc(d.link)}" target="_blank" rel="sponsored nofollow noopener">
    ${d.image ? `<img src="${esc(d.image)}" alt="${esc(d.title)}" loading="lazy">` : `<div class="ph">${esc(d.store)}</div>`}
    <div class="info">
      <span class="store">${esc(d.store)}</span>
      <h2>${esc(d.te)}</h2>
      <p>${esc(d.title)} · <b>${esc(d.price)}</b></p>
      <span class="btn">Shop now →</span>
    </div>
  </a>`;

const html = `<!doctype html>
<html lang="te"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Modern Stories · Today's Deals</title>
<meta name="description" content="Handpicked festive and fashion deals — Modern Stories (@modern.storiez)">
<link rel="icon" href="logo.png">
<style>
:root{--navy:#0b1640;--navy2:#162a6b;--gold:#f5c330;--ink:#0f172a;--muted:#64748b;--card:#fff;--bg:#f3f5fb}
@media (prefers-color-scheme:dark){:root{--ink:#e2e8f0;--muted:#94a3b8;--card:#111a36;--bg:#070d24}}
*{box-sizing:border-box}body{margin:0;font:16px/1.45 system-ui,-apple-system,"Noto Sans Telugu",sans-serif;background:var(--bg);color:var(--ink)}
header{background:linear-gradient(135deg,var(--navy),var(--navy2));color:#fff;text-align:center;padding:28px 16px 22px;border-bottom:4px solid var(--gold)}
header img{width:84px;height:84px;border-radius:50%}header h1{margin:10px 0 2px;font-size:22px}header p{margin:0;color:#cbd5e1;font-size:14px}
.note{max-width:560px;margin:14px auto 0;padding:0 16px;color:var(--muted);font-size:12.5px;text-align:center}
main{max-width:560px;margin:auto;padding:14px 16px 32px;display:grid;gap:14px}
.deal{display:block;background:var(--card);border-radius:16px;overflow:hidden;text-decoration:none;color:inherit;box-shadow:0 2px 10px rgba(11,22,64,.08)}
.deal img{width:100%;aspect-ratio:300/160;object-fit:cover;display:block;background:#ddd}
.ph{aspect-ratio:300/120;display:grid;place-items:center;background:linear-gradient(135deg,#b45309,#f59e0b);color:#fff;font-weight:700;font-size:26px}
.info{padding:12px 14px 14px}.store{font-size:12px;font-weight:700;color:var(--gold);background:var(--navy);padding:2px 8px;border-radius:999px}
h2{font-size:18px;margin:8px 0 2px}.info p{margin:0 0 10px;color:var(--muted);font-size:14px}
.btn{display:inline-block;background:var(--gold);color:var(--navy);font-weight:700;padding:8px 16px;border-radius:10px}
footer{text-align:center;color:var(--muted);font-size:12.5px;padding:0 16px 28px}footer a{color:inherit}
</style></head><body>
<header><img src="logo.png" alt="Modern Stories"><h1>నేటి బెస్ట్ డీల్స్ · Today's Deals</h1><p>@modern.storiez · ఎంపిక చేసిన ఆఫర్లు</p></header>
<p class="note">#ad · These are affiliate links: we may earn a small commission at no extra cost to you. Prices and offers are set by the stores and can change.</p>
<main>${sorted.map(card).join('')}</main>
<footer>Updated ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })} · <a href="https://www.instagram.com/modern.storiez/">Instagram</a> · <a href="https://www.youtube.com/@modern.storiez">YouTube</a></footer>
</body></html>`;

await mkdir(path.join(root, 'docs'), { recursive: true });
await copyFile(path.join(root, 'assets/brand/logo-round.png'), path.join(root, 'docs/logo.png'));
await writeFile(path.join(root, 'docs/index.html'), html);
console.log(`docs/index.html: ${deals.length} deals`);
