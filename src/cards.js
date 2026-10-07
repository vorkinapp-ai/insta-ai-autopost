// Free short Reels (no credits): Telugu motivational quotes and health tips with the Modern Stories
// branding and a soft synthesized background tune.
//   npm run cards -- --type quote            -> make + post the next quote
//   npm run cards -- --type health --dry-run -> make the next health tip only
//   npm run cards -- --type quote --id q05   -> a specific card
import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { publishVideo } from './instagram.js';
import { hostVideo } from './host.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const LOG = path.join(root, 'cards-posted.json');
const FONTS = path.join(root, 'assets/fonts');
const LOGO = path.join(root, 'assets/brand/logo-round.png');

const TYPES = {
  quote: {
    file: 'telugu-stories/quotes.json',
    seconds: 9,
    // A-minor pad: calm, reflective.
    chord: [220, 261.63, 329.63, 440],
    palette: [['0x0b1640', '0x1d3a8a'], ['0x0c1442', '0x3a2a7a'], ['0x081030', '0x26408f']],
    caption: (c) =>
      `${c.text.replace(/\n/g, ' ')}\n\nమీకు నచ్చితే ❤️ చేయండి, మీ ఫ్రెండ్‌కి షేర్ చేయండి 📤\n👉 రోజూ ఇలాంటి మాటల కోసం @modern.storiez ని ఫాలో అవ్వండి\n\n` +
      '#telugumotivation #teluguquotes #motivationalquotes #lifequotes #telugu #telugureels #modernstoriez',
  },
  health: {
    file: 'telugu-stories/health.json',
    seconds: 13,
    // C-major pad: fresh, light.
    chord: [261.63, 329.63, 392, 523.25],
    palette: [['0x06303a', '0x0b5d63'], ['0x0b2a3f', '0x13607a'], ['0x072f2a', '0x0f6b57']],
    caption: (c) =>
      `Health Tip: ${c.title} 🌿\n${c.tips.map((t) => `✅ ${t}`).join('\n')}\n\n` +
      'ℹ️ General wellness info only, not medical advice. Please consult a doctor for health concerns.\n💾 Save this for later | 👉 Follow @modern.storiez for daily tips\n\n' +
      '#healthtips #healthylifestyle #wellness #healthyhabits #fitnesstips #dailyhealthtips #indianhealth #modernstoriez',
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

function assFor(type, card, total) {
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
    ev(2, total - 2.4, total, 'Cta', '{\\fad(300,0)\\pos(540,1640)}FOLLOW  •  LIKE  •  SHARE'),
  ];
  let body;
  if (type === 'quote') {
    body = [
      ev(1, 0.2, total, 'QuoteMark', '{\\fad(400,0)\\pos(540,620)}"'),
      ev(1, 0.6, total, 'Quote', `{\\fad(600,0)\\pos(540,960)}${esc(card.text)}`),
      ev(1, 0.6, total, 'Shape', `{\\an7\\pos(440,1180)\\p1\\1c&H30C3F5&\\fad(600,0)}${box(0, 0, 200, 6)}{\\p0}`),
    ];
  } else {
    body = [
      ev(1, 0.1, total, 'Pill', '{\\fad(300,0)\\pos(540,420)}DAILY HEALTH TIP'),
      ev(1, 0.3, total, 'HTitle', `{\\fad(400,0)\\pos(540,560)}${esc(card.title)}`),
      ...card.tips.map((t, i) => ev(1, 1.2 + i * 2.2, total, 'Tip', `{\\fad(400,0)\\an4\\pos(110,${800 + i * 220})}•  ${esc(t)}`)),
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

async function render(type, card, index, workDir) {
  const t = TYPES[type];
  const total = t.seconds;
  const assPath = path.join(workDir, 'card.ass');
  await writeFile(assPath, assFor(type, card, total));
  const [c0, c1] = t.palette[index % t.palette.length];
  // Soft chord pad with a slow swell; quiet so it sits under any music viewers may have on.
  const pad = t.chord.map((f, i) => `${(0.07 - i * 0.012).toFixed(3)}*sin(2*PI*${f}*t)`).join('+');
  const out = path.join(workDir, 'final.mp4');
  const { code, err } = await ff([
    '-y', '-f', 'lavfi', '-i', `gradients=s=1080x1920:c0=${c0}:c1=${c1}:speed=0.02:d=${total}:r=30`,
    '-f', 'lavfi', '-i', `aevalsrc='(${pad})*(0.75+0.25*sin(2*PI*0.2*t))':s=48000:d=${total}`,
    '-loop', '1', '-i', LOGO,
    '-filter_complex',
    `[0:v]ass=${assPath.replace(/:/g, '\\:')}:fontsdir=${FONTS.replace(/:/g, '\\:')}[bg];[2:v]format=rgba,scale=180:180[l];` +
      `[bg][l]overlay=70:25:shortest=1,format=yuv420p[v];` +
      `[1:a]lowpass=f=1500,aecho=0.8:0.7:60:0.3,afade=t=in:d=1.2,afade=t=out:st=${total - 1.8}:d=1.8,pan=stereo|c0=c0|c1=c0[a]`,
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
  log.push({ type, id: card.id, mediaId, permalink, postedAt: new Date().toISOString() });
  await writeFile(LOG, JSON.stringify(log, null, 2) + '\n');
  console.log(`Posted! ${permalink || mediaId}`);
}

main().catch((e) => {
  console.error(`Failed: ${e.message}`);
  process.exitCode = 1;
});
