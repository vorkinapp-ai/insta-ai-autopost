// Free short Reels (no credits): Telugu motivational quotes and health tips with the Modern Stories
// branding and a soft synthesized background tune.
//   npm run cards -- --type quote            -> make + post the next quote
//   npm run cards -- --type health --dry-run -> make the next health tip only
//   npm run cards -- --type quote --id q05   -> a specific card
import RunwayML from '@runwayml/sdk';
import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { publishVideo } from './instagram.js';
import { hostVideo } from './host.js';
import { tryUploadShort } from './youtube.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const LOG = path.join(root, 'cards-posted.json');
const FONTS = path.join(root, 'assets/fonts');
const LOGO = path.join(root, 'assets/brand/logo-round.png');

const TYPES = {
  quote: {
    file: 'telugu-stories/quotes.json',
    seconds: 7.5, // short + no end card so it loops seamlessly (rewatches boost reach)
    // A-minor pad: calm, reflective.
    chord: [220, 261.63, 329.63, 440],
    palette: [['0x0b1640', '0x1d3a8a'], ['0x0c1442', '0x3a2a7a'], ['0x081030', '0x26408f']],
    caption: (c) =>
      `${c.text.replace(/\n/g, ' ')}\n\n📤 ఈ మాట ఎవరికి అవసరమో వాళ్ళకి పంపండి\n💬 మీకు నచ్చిన లైన్ కామెంట్ చేయండి\n👉 రోజూ ఇలాంటి మాటల కోసం @modern.storiez ని ఫాలో అవ్వండి\n\n` +
      'Telugu motivational quotes | Telugu quotes on life | inspiration in Telugu\n\n' +
      '#teluguquotes #telugumotivation #motivationalquotes #telugu #lifequotes',
  },
  health: {
    file: 'telugu-stories/health.json',
    seconds: 11,
    photo: true, // background photo from Runway gen4_image 720p (5 credits; muse_image isn't offered in India)
    // C-major pad: fresh, light.
    chord: [261.63, 329.63, 392, 523.25],
    palette: [['0x06303a', '0x0b5d63'], ['0x0b2a3f', '0x13607a'], ['0x072f2a', '0x0f6b57']],
    caption: (c) =>
      `Health Tip: ${c.title} 🌿\n${c.tips.map((t) => `✅ ${t}`).join('\n')}\n\n` +
      'ℹ️ General wellness info only, not medical advice. Please consult a doctor for health concerns.\n' +
      '📤 Send this to someone who needs the reminder | 💾 Save for later\n👉 Follow @modern.storiez for a daily health tip\n\n' +
      'Daily health tips | simple healthy habits | wellness tips India\n\n' +
      '#healthtips #healthyhabits #wellness #healthylifestyle #fitnesstips',
  },
};

const args = process.argv.slice(2);
const opt = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : null);

function ff(argv) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, ['-hide_banner', ...argv], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => resolve({ code, err }));
  });
}

const ts = (t) => `0:${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(2).padStart(5, '0')}`;
const esc = (t) => t.replace(/[{}]/g, '').replace(/\n/g, '\\N');
const box = (x1, y1, x2, y2) => `m ${x1} ${y1} l ${x2} ${y1} l ${x2} ${y2} l ${x1} ${y2}`;

function assFor(type, card, total, revealAt) {
  const ms = Math.round(total * 1000);
  const ev = (layer, start, end, style, text) => `Dialogue: ${layer},${ts(start)},${ts(end)},${style},,0,0,0,,${text}`;
  const common = [
    ev(0, 0, total, 'Shape', `{\\an7\\pos(0,0)\\p1\\1c&H2E1408&\\1a&H20&}${box(0, 0, 1080, 230)}{\\p0}`),
    ev(0, 0, total, 'Shape', `{\\an7\\pos(0,230)\\p1\\1c&H30C3F5&}${box(0, 0, 1080, 6)}{\\p0}`),
    ev(1, 0, total, 'Brand', '{\\pos(620,95)}మోడర్న్ కథలు'),
    ev(1, 0, total, 'BrandSub', '{\\pos(620,170)}MODERN STORIES  •  TELUGU KATHALU'),
    ev(0, 0, total, 'Shape', `{\\an7\\pos(0,1904)\\p1\\1c&HFFFFFF&\\1a&HB0&}${box(0, 0, 1080, 16)}{\\p0}`),
    ev(1, 0, total, 'Shape', `{\\an7\\pos(0,1904)\\p1\\1c&H30C3F5&\\fscx0\\t(0,${ms},\\fscx100)}${box(0, 0, 1080, 16)}{\\p0}`),
    ev(1, 0, total, 'Handle', '@modern.storiez'),
  ];
  let body;
  if (type === 'quote') {
    const [first, ...rest] = card.text.split('\n');
    const reveal = revealAt ?? total * 0.42; // punchline lands late → viewers loop back to take it in
    body = [
      ev(1, 0, total, 'QuoteMark', '{\\pos(540,620)}"'),
      ev(1, 0, total, 'Quote', `{\\pos(540,900)}${esc(first)}`),
      ev(1, reveal, total, 'Punch', `{\\fad(250,0)\\pos(540,1060)\\t(0,300,\\fscx108\\fscy108)\\t(300,600,\\fscx100\\fscy100)}${esc(rest.join('\n'))}`),
      ev(1, reveal, total, 'Shape', `{\\an7\\pos(440,1200)\\p1\\1c&H30C3F5&\\fad(250,0)}${box(0, 0, 200, 6)}{\\p0}`),
    ];
  } else {
    body = [
      // Dark translucent panel so the tips stay readable over the photo.
      ev(0, 0, total, 'Shape', `{\\an7\\pos(60,330)\\p1\\1c&H2E1408&\\1a&H58&}${box(0, 0, 960, 1260)}{\\p0}`),
      ev(1, 0.1, total, 'Pill', '{\\fad(300,0)\\pos(540,420)}DAILY HEALTH TIP'),
      ev(1, 0.3, total, 'HTitle', `{\\fad(400,0)\\pos(540,560)}${esc(card.title)}`),
      ...card.tips.map((t, i) => ev(1, 0.8 + i * 1.8, total, 'Tip', `{\\fad(400,0)\\an4\\pos(110,${800 + i * 220})}•  ${esc(t)}`)),
      ev(1, 0.3, total, 'Note', '{\\pos(540,1520)}General wellness info • Not medical advice'),
    ];
  }
  return `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Shape,Noto Sans Telugu,20,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: Brand,Noto Sans Telugu,64,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1
Style: BrandSub,Noto Sans Telugu,30,&H0030C3F5,&H0030C3F5,&H00000000,&H00000000,1,0,0,0,100,100,6,0,1,0,0,5,0,0,0,1
Style: Handle,Noto Sans Telugu,40,&H40FFFFFF,&H40FFFFFF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,0,0,2,80,80,70,1
Style: Cta,Noto Sans Telugu,52,&H0030C3F5,&H0030C3F5,&H00000000,&H80000000,1,0,0,0,100,100,4,0,1,3,2,5,0,0,0,1
Style: QuoteMark,Noto Sans Telugu,260,&H0030C3F5,&H0030C3F5,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1
Style: Punch,Noto Sans Telugu,84,&H0030C3F5,&H0030C3F5,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,2,5,90,90,0,1
Style: Quote,Noto Sans Telugu,80,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,2,5,90,90,0,1
Style: Pill,Noto Sans Telugu,42,&H0030C3F5,&H0030C3F5,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1
Style: HTitle,Noto Sans Telugu,92,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,2,5,80,80,0,1
Style: Tip,Noto Sans Telugu,58,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,2,4,110,90,0,1
Style: Note,Noto Sans Telugu,34,&H60FFFFFF,&H60FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${[...common, ...body].join('\n')}
`;
}

/** Telugu voice for a quote (Arjun, ~1 credit), kept in the repo so it's paid for once. */
async function quoteVoice(card) {
  const file = path.join(root, 'assets/voice', `${card.id}.mp3`);
  if (existsSync(file)) return file;
  await mkdir(path.dirname(file), { recursive: true });
  const task = await new RunwayML().textToSpeech
    .create({ model: 'eleven_v4', promptText: card.text.replace(/\n/g, ' '), languageCode: 'te', voice: { type: 'runway-preset', presetId: process.env.TELUGU_VOICE || 'Arjun' } })
    .waitForTaskOutput({ timeout: 5 * 60 * 1000 });
  const res = await fetch(task.output[0]);
  if (!res.ok) throw new Error(`Voice download failed: HTTP ${res.status}`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

async function seconds(file) {
  const { err } = await ff(['-i', file]);
  const m = err.match(/Duration: (\d+):(\d+):([\d.]+)/);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** One vertical photo per card, generated once and kept in workDir (5 credits with gen4_image at 720p). */
async function photoFor(card) {
  // Kept in the repo (committed by the workflow) so each photo is only ever paid for once.
  const file = path.join(root, 'assets/photos', `${card.id}.png`);
  await mkdir(path.dirname(file), { recursive: true });
  if (existsSync(file)) return file;
  const task = await new RunwayML().textToImage
    .create({
      model: 'gen4_image',
      ratio: '720:1280',
      promptText: `Professional lifestyle photograph of ${card.image}. Bright natural light, fresh and clean, Indian setting where relevant, shallow depth of field, high detail, no text, no words, no logos.`,
    })
    .waitForTaskOutput({ timeout: 5 * 60 * 1000 });
  const res = await fetch(task.output[0]);
  if (!res.ok) throw new Error(`Photo download failed: HTTP ${res.status}`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

async function render(type, card, index, workDir) {
  const t = TYPES[type];
  const voice = type === 'quote' ? await quoteVoice(card) : null;
  const voiceLen = voice ? await seconds(voice) : 0;
  const total = voice ? Math.max(6, voiceLen + 1.6) : t.seconds;
  // Punchline appears as the voice reaches line 2 (share of characters in line 1).
  const [first] = card.text ? card.text.split('\n') : [''];
  const reveal = voice ? 0.3 + voiceLen * (first.length / card.text.replace(/\n/g, '').length) : null;
  const assPath = path.join(workDir, 'card.ass');
  await writeFile(assPath, assFor(type, card, total, reveal));
  const [c0, c1] = t.palette[index % t.palette.length];
  // Background: slow zoom on the photo, or a moving gradient.
  const bgInput = t.photo
    ? ['-loop', '1', '-framerate', '30', '-i', await photoFor(card)]
    : ['-f', 'lavfi', '-i', `gradients=s=1080x1920:c0=${c0}:c1=${c1}:speed=0.02:d=${total}:r=30`];
  const bgFilter = t.photo
    ? `[0:v]scale=1296:2304:force_original_aspect_ratio=increase,crop=1296:2304,zoompan=z='min(zoom+0.0005,1.15)':d=${Math.ceil(total * 30)}:s=1080x1920:fps=30,eq=brightness=-0.06,`
    : '[0:v]';
  // Soft chord pad with a slow swell; quiet so it sits under any music viewers may have on.
  const pad = t.chord.map((f, i) => `${(0.07 - i * 0.012).toFixed(3)}*sin(2*PI*${f}*t)`).join('+');
  const out = path.join(workDir, 'final.mp4');
  const { code, err } = await ff([
    '-y', ...bgInput,
    ...(voice ? ['-i', voice] : ['-f', 'lavfi', '-i', `aevalsrc='(${pad})*(0.75+0.25*sin(2*PI*0.2*t))':s=48000:d=${total}`]),
    '-loop', '1', '-i', LOGO,
    '-filter_complex',
    `${bgFilter}ass=${assPath.replace(/:/g, '\\:')}:fontsdir=${FONTS.replace(/:/g, '\\:')}[bg];[2:v]format=rgba,scale=180:180[l];` +
      `[bg][l]overlay=70:25:shortest=1,format=yuv420p[v];` +
      (voice
        ? `[1:a]aresample=48000,adelay=300|300,apad,atrim=0:${total},pan=stereo|c0=c0|c1=c0[a]`
        : `[1:a]lowpass=f=1500,aecho=0.8:0.7:60:0.3,afade=t=in:d=0.25,afade=t=out:st=${total - 0.25}:d=0.25,pan=stereo|c0=c0|c1=c0[a]`),
    '-map', '[v]', '-map', '[a]', '-t', String(total),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out,
  ]);
  if (code !== 0) throw new Error(`ffmpeg failed:\n${err.slice(-1500)}`);
  return out;
}

async function main() {
  const type = opt('--type');
  if (!TYPES[type]) throw new Error(`--type must be one of: ${Object.keys(TYPES).join(', ')}`);
  const cards = JSON.parse(await readFile(path.join(root, TYPES[type].file), 'utf8'));
  const log = existsSync(LOG) ? JSON.parse(await readFile(LOG, 'utf8')) : [];
  const done = new Set(log.map((e) => e.id));
  // --if-due: at most one card of this type per IST day, never between 11 PM and 7 AM.
  const istDay = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const istHour = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }));
  const last = log.filter((e) => e.type === type).at(-1)?.postedAt;
  if (args.includes('--if-due') && ((last && istDay(last) === istDay(Date.now())) || istHour >= 23 || istHour < 7)) {
    return console.log(`Skipped: a ${type} was already posted today (${last}) or quiet hours.`);
  }
  // Cycle back to the start once every card has been used.
  const card = opt('--id') ? cards.find((c) => c.id === opt('--id')) : cards.find((c) => !done.has(c.id)) || cards[log.filter((e) => e.type === type).length % cards.length];
  if (!card) throw new Error('Card not found');

  const workDir = path.join(root, 'output', `card-${card.id}`);
  await mkdir(workDir, { recursive: true });
  console.log(`${type} ${card.id}${args.includes('--dry-run') ? ' [dry run]' : ''}`);
  const video = await render(type, card, cards.indexOf(card), workDir);
  console.log(`  ${video}`);
  if (args.includes('--dry-run')) return;

  const videoUrl = await hostVideo(video, `card-${card.id}.mp4`);
  const { mediaId, permalink } = await publishVideo(video, { mediaType: 'REELS', caption: TYPES[type].caption(card), videoUrl });
  const yt = await tryUploadShort(video, type === 'health'
    ? { title: `${card.title} – Daily Health Tip`, description: TYPES.health.caption(card).replace(/@modern\.storiez/g, 'Modern Stories') + '\n#Shorts', tags: ['health tips', 'healthy habits', 'wellness', 'daily health tip'], categoryId: '26' }
    : { title: `${card.text.split('\n')[0]} | Telugu Quotes`, description: TYPES.quote.caption(card).replace(/@modern\.storiez/g, 'Modern Stories') + '\n#Shorts', tags: ['telugu quotes', 'telugu motivation', 'motivational quotes', 'life quotes'] });
  log.push({ type, id: card.id, mediaId, permalink, youtube: yt?.url, postedAt: new Date().toISOString() });
  await writeFile(LOG, JSON.stringify(log, null, 2) + '\n');
  console.log(`Posted! ${permalink || mediaId}`);
}

main().catch((e) => {
  console.error(`Failed: ${e.message}`);
  process.exitCode = 1;
});
