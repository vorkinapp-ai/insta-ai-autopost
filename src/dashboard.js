// Local dashboard: `npm run dashboard` → builds output/dashboard.html from live Instagram, Runway
// and GitHub data, then opens it in your browser. Read-only — it never posts or spends credits.
import RunwayML from '@runwayml/sdk';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = fileURLToPath(new URL('..', import.meta.url));
const REPO = 'vorkinapp-ai/insta-ai-autopost';
const TOKEN_CREATED = '2026-10-06'; // last time the IG token was generated/refreshed by hand
const CREDITS_PER_STORY = 2.6;

const ig = (p) =>
  fetch(`https://graph.instagram.com/v25.0/${p}`, { headers: { Authorization: `Bearer ${process.env.IG_ACCESS_TOKEN}` } }).then((r) => r.json());

async function safe(fn, fallback) {
  try {
    return await fn();
  } catch (e) {
    console.warn(`  (skipped: ${e.message.slice(0, 80)})`);
    return fallback;
  }
}

async function collect() {
  const stories = JSON.parse(await readFile(path.join(root, 'telugu-stories/stories.json'), 'utf8'));
  const account = await ig('me?fields=username,followers_count,follows_count,media_count');
  const media = (await ig('me/media?fields=id,caption,like_count,comments_count,timestamp,permalink,media_product_type&limit=100')).data || [];
  const metrics = 'views,reach,likes,comments,shares,saved';
  const posts = await Promise.all(
    media.map(async (m) => {
      const ins = await safe(() => ig(`${m.id}/insights?metric=${metrics}`), {});
      const v = Object.fromEntries((ins.data || []).map((d) => [d.name, d.values?.[0]?.value ?? 0]));
      const story = stories.find((s) => m.caption?.startsWith(s.caption.slice(0, 25)));
      return { ...m, ...v, title: story?.title || (m.caption || '').split('\n')[0].slice(0, 40), category: story?.category || '—', storyId: story?.id };
    }),
  );
  const postedIds = new Set(posts.map((p) => p.storyId).filter(Boolean));
  const queue = stories.filter((s) => !postedIds.has(s.id));
  const credits = await safe(async () => (await new RunwayML().organization.retrieve()).creditBalance, null);
  const runs = await safe(async () => {
    const { stdout } = await run('gh', ['run', 'list', '--repo', REPO, '--limit', '10', '--json', 'conclusion,status,event,createdAt,displayTitle,url']);
    return JSON.parse(stdout);
  }, []);
  const workflow = await safe(async () => {
    const { stdout } = await run('gh', ['workflow', 'list', '--all', '--repo', REPO, '--json', 'name,state']);
    return JSON.parse(stdout)[0];
  }, null);
  return { account, posts, queue, stories, credits, runs, workflow };
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-IN'));
const day = (d) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

function nextSlots(n) {
  // Daily 7:00 PM IST (13:30 UTC).
  const out = [];
  const d = new Date();
  d.setUTCHours(13, 30, 0, 0);
  if (d <= new Date()) d.setUTCDate(d.getUTCDate() + 1);
  for (let i = 0; i < n; i++) out.push(new Date(d.getTime() + i * 86400000));
  return out;
}

function html({ account, posts, queue, stories, credits, runs, workflow }) {
  const sum = (k) => posts.reduce((a, p) => a + (Number(p[k]) || 0), 0);
  const views = sum('views'), reach = sum('reach'), likes = sum('likes'), comments = sum('comments'), shares = sum('shares'), saves = sum('saved');
  const engagement = reach ? (((likes + comments + shares + saves) / reach) * 100).toFixed(1) + '%' : '—';
  const tokenExpiry = new Date(new Date(TOKEN_CREATED).getTime() + 60 * 86400000);
  const tokenDays = Math.round((tokenExpiry - Date.now()) / 86400000);
  const creditDays = credits != null ? Math.floor(credits / CREDITS_PER_STORY) : null;
  const maxViews = Math.max(1, ...posts.map((p) => p.views || 0));
  const slots = nextSlots(Math.min(7, queue.length));
  const lastRun = runs[0];
  const health = [
    ['Daily schedule', workflow?.state === 'active' ? 'ok' : 'bad', workflow?.state === 'active' ? 'On — 7:00 PM IST daily' : `Off (${esc(workflow?.state || 'unknown')})`],
    ['Last GitHub run', !lastRun ? 'warn' : lastRun.conclusion === 'success' ? 'ok' : lastRun.status !== 'completed' ? 'warn' : 'bad',
      lastRun ? `${esc(lastRun.conclusion || lastRun.status)} · ${day(lastRun.createdAt)}` : 'No runs yet'],
    ['Runway credits', credits == null ? 'warn' : credits > 50 ? 'ok' : credits > 15 ? 'warn' : 'bad', credits == null ? 'Unknown' : `${fmt(credits)} left · ~${creditDays} more stories`],
    ['Instagram token', tokenDays > 14 ? 'ok' : tokenDays > 3 ? 'warn' : 'bad', `Expires in ~${tokenDays} days (${tokenExpiry.toDateString()})`],
    ['Story queue', queue.length > 7 ? 'ok' : queue.length ? 'warn' : 'bad', `${queue.length} of ${stories.length} stories left (${queue.length} days)`],
  ];
  const catColor = { motivation: '#3b82f6', moral: '#10b981', family: '#ec4899', comedy: '#f59e0b' };

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Modern Stories Dashboard</title>
<style>
:root{--bg:#f5f7fb;--card:#fff;--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--navy:#0b1640;--gold:#f5c330;--ok:#16a34a;--warn:#d97706;--bad:#dc2626}
@media (prefers-color-scheme:dark){:root{--bg:#0b1020;--card:#121a33;--ink:#e2e8f0;--muted:#94a3b8;--line:#1f2a4a}}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--bg);color:var(--ink)}
header{background:var(--navy);color:#fff;padding:20px 16px;border-bottom:4px solid var(--gold)}
header .w{max-width:1100px;margin:auto;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
header h1{margin:0;font-size:22px}header small{color:#cbd5e1}
main{max-width:1100px;margin:auto;padding:16px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.kpi .v{font-size:26px;font-weight:700;font-variant-numeric:tabular-nums}.kpi .l{color:var(--muted);font-size:13px}
h2{font-size:16px;margin:22px 0 10px}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{padding:8px 6px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}
th{color:var(--muted);font-weight:600}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
.scroll{overflow-x:auto}.bar{height:8px;background:var(--gold);border-radius:4px;min-width:2px}
.pill{display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;color:#fff}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:8px}.ok{background:var(--ok)}.warn{background:var(--warn)}.bad{background:var(--bad)}
a{color:#2563eb}footer{color:var(--muted);font-size:13px;text-align:center;padding:24px}
</style></head><body>
<header><div class="w"><div><h1>మోడర్న్ కథలు · Dashboard</h1><small>@${esc(account.username)} · updated ${day(new Date())} IST</small></div>
<a style="color:var(--gold)" href="https://www.instagram.com/${esc(account.username)}/">Open Instagram ↗</a></div></header>
<main>
<div class="grid">
${[['Followers', account.followers_count], ['Posts', account.media_count], ['Views', views], ['Accounts reached', reach], ['Likes', likes], ['Comments', comments], ['Shares', shares], ['Saves', saves]]
  .map(([l, v]) => `<div class="card kpi"><div class="v">${fmt(v)}</div><div class="l">${l}</div></div>`).join('')}
<div class="card kpi"><div class="v">${engagement}</div><div class="l">Engagement rate</div></div>
</div>

<h2>System health</h2>
<div class="card">${health.map(([k, s, v]) => `<div style="padding:6px 0"><span class="dot ${s}"></span><b>${k}:</b> ${v}</div>`).join('')}</div>

<h2>Posts (${posts.length})</h2>
<div class="card scroll"><table><thead><tr><th>Posted (IST)</th><th>Story</th><th>Type</th><th class="n">Views</th><th style="width:20%"></th><th class="n">Reach</th><th class="n">Likes</th><th class="n">Comments</th><th class="n">Shares</th><th class="n">Saves</th><th></th></tr></thead><tbody>
${posts.map((p) => `<tr><td>${day(p.timestamp)}</td><td>${esc(p.title)}</td><td><span class="pill" style="background:${catColor[p.category] || '#64748b'}">${esc(p.category)}</span></td>
<td class="n">${fmt(p.views)}</td><td><div class="bar" style="width:${((p.views || 0) / maxViews) * 100}%"></div></td><td class="n">${fmt(p.reach)}</td><td class="n">${fmt(p.likes ?? p.like_count)}</td>
<td class="n">${fmt(p.comments ?? p.comments_count)}</td><td class="n">${fmt(p.shares)}</td><td class="n">${fmt(p.saved)}</td><td><a href="${esc(p.permalink)}">View ↗</a></td></tr>`).join('') || '<tr><td colspan="11">No posts yet</td></tr>'}
</tbody></table></div>

<h2>Coming up</h2>
<div class="card scroll"><table><thead><tr><th>When (IST)</th><th>#</th><th>Story</th><th>Type</th></tr></thead><tbody>
${slots.map((d, i) => `<tr><td>${day(d)}</td><td>${esc(queue[i].id)}</td><td>${esc(queue[i].title)}</td><td><span class="pill" style="background:${catColor[queue[i].category] || '#64748b'}">${esc(queue[i].category)}</span></td></tr>`).join('') || '<tr><td colspan="4">Queue empty — add stories</td></tr>'}
</tbody></table></div>

<h2>Audit log · recent automation runs</h2>
<div class="card scroll"><table><thead><tr><th>When (IST)</th><th>Trigger</th><th>Result</th><th></th></tr></thead><tbody>
${runs.map((r) => `<tr><td>${day(r.createdAt)}</td><td>${r.event === 'schedule' ? 'Daily schedule' : 'Manual'}</td><td><span class="dot ${r.conclusion === 'success' ? 'ok' : r.status !== 'completed' ? 'warn' : 'bad'}"></span>${esc(r.conclusion || r.status)}</td><td><a href="${esc(r.url)}">Details ↗</a></td></tr>`).join('') || '<tr><td colspan="4">No runs yet</td></tr>'}
</tbody></table></div>
</main><footer>Refresh: run <code>npm run dashboard</code> in the insta-ai-autopost folder. Stats from Instagram can lag a few hours.</footer>
</body></html>`;
}

const data = await collect();
const out = path.join(root, 'output/dashboard.html');
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, html(data));
console.log(`Dashboard: ${out}`);
if (!process.argv.includes('--no-open')) await run('open', [out]).catch(() => {});
