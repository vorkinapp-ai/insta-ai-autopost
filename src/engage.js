// Replies to new comments on recent posts (runs every 30 min on GitHub). Early replies + a follow-up
// question turn one comment into a conversation, which Instagram counts as engagement.
//   npm run engage            -> reply to new comments
//   npm run engage -- --dry-run -> show what it would reply, without posting
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const LOG = path.join(root, 'engaged.json');
const DRY = process.argv.includes('--dry-run');
const MAX_REPLIES_PER_RUN = 25; // stay well under Instagram's rate limits and avoid looking spammy
const LOOKBACK_DAYS = 7;

const api = async (method, p, params) => {
  const url = new URL(`https://graph.instagram.com/v25.0/${p}`);
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${process.env.IG_ACCESS_TOKEN}`, ...(params ? { 'Content-Type': 'application/json' } : {}) },
    body: params ? JSON.stringify(params) : undefined,
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json;
};

// Several variants per post type so replies never look copy-pasted.
const REPLIES = {
  story: [
    'ధన్యవాదాలు 🙏 ఈ కథలో మీకు ఏ భాగం బాగా నచ్చింది?',
    'మీ కామెంట్ చూసి చాలా సంతోషం ❤️ ఇలాంటి అనుభవం మీకు ఎప్పుడైనా జరిగిందా?',
    'చాలా థ్యాంక్స్ 🙌 ఈ కథ ఎవరికి అవసరమో వాళ్ళకి పంపండి 📤',
    'ధన్యవాదాలు 😊 రేపు ఇంకో మంచి కథ వస్తోంది, మిస్ అవ్వకండి!',
    'మీ మాటలకు థ్యాంక్స్ 🙏 మీకు ఏ రకమైన కథలు ఇష్టం?',
  ],
  quote: [
    'నిజమే కదా 💯 ఈ మాట ఎవరికి అవసరమో వాళ్ళకి పంపండి 📤',
    'ధన్యవాదాలు 🙏 మీకు ఇష్టమైన కొటేషన్ ఏది? కామెంట్ చేయండి',
    'థ్యాంక్స్ ❤️ రోజూ ఉదయం 8 గంటలకు కొత్త మాట వస్తుంది!',
    'అవును 🙌 ఈ మాటను మీరు ఎప్పుడైనా అనుభవించారా?',
  ],
  health: [
    'Thank you! 🙌 Which tip will you try first?',
    'Glad it helped 😊 Send it to someone who needs the reminder 📤',
    'Thanks! 💪 What health topic should we cover next?',
    'Appreciate it 🙏 New tip every day at 1 PM!',
  ],
};

function kindOf(caption = '') {
  if (caption.startsWith('Health Tip')) return 'health';
  return caption.includes('కథ') ? 'story' : 'quote';
}

async function main() {
  const me = await api('GET', 'me?fields=username');
  const log = existsSync(LOG) ? JSON.parse(await readFile(LOG, 'utf8')) : [];
  const replied = new Set(log.map((e) => e.commentId));
  const since = Date.now() - LOOKBACK_DAYS * 86400000;
  const media = (await api('GET', 'me/media?fields=id,caption,timestamp,comments_count&limit=30')).data.filter(
    (m) => new Date(m.timestamp).getTime() > since && m.comments_count > 0,
  );

  let count = 0;
  for (const m of media) {
    const comments = (await api('GET', `${m.id}/comments?fields=id,text,username,replies{username}&limit=50`)).data || [];
    for (const c of comments) {
      if (count >= MAX_REPLIES_PER_RUN) break;
      const alreadyAnswered = replied.has(c.id) || c.username === me.username || (c.replies?.data || []).some((r) => r.username === me.username);
      if (alreadyAnswered) continue;
      const options = REPLIES[kindOf(m.caption)];
      const message = `@${c.username} ${options[(log.length + count) % options.length]}`;
      console.log(`${DRY ? '[dry] ' : ''}reply to @${c.username} ("${(c.text || '').slice(0, 40)}"): ${message}`);
      if (!DRY) {
        await api('POST', `${c.id}/replies`, { message });
        log.push({ commentId: c.id, mediaId: m.id, at: new Date().toISOString() });
      }
      count++;
    }
  }
  if (!DRY) await writeFile(LOG, JSON.stringify(log, null, 2) + '\n');
  console.log(`${count} repl${count === 1 ? 'y' : 'ies'}${DRY ? ' (dry run)' : ''}.`);
}

main().catch((e) => {
  const hint = /permission|scope/i.test(e.message) ? ' → regenerate the Instagram token with comment permissions.' : '';
  console.error(`Failed: ${e.message}${hint}`);
  process.exitCode = 1;
});
