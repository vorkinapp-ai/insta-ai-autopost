// Telugu narrated story Reels: Runway eleven_v4 voice + moving gradient + Telugu captions.
//   npm run telugu                -> make + post the next unposted story
//   npm run telugu -- --dry-run   -> make the video only
//   npm run telugu -- --id 03     -> a specific story
//   npm run telugu -- --list      -> show the queue and estimated credits (free)
import RunwayML from '@runwayml/sdk';
import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { publishVideo } from './instagram.js';
import { hostVideo } from './host.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const STORIES = path.join(root, 'telugu-stories/stories.json');
const LOG = path.join(root, 'telugu-posted.json');
const FONTS = path.join(root, 'assets/fonts');
const VOICE = process.env.TELUGU_VOICE || 'Arjun';
// Instagram caps posts at 5 hashtags (more gets demoted from Explore/Reels), so: 2 category + 3 core.
const CORE_TAGS = '#telugustories #telugukathalu #telugu';
const CATEGORY_TAGS = {
  motivation: '#telugumotivation #lifelessons',
  moral: '#moralstories #neethikathalu',
  family: '#amma #emotionalstory',
  comedy: '#telugucomedy #tenaliramakrishna',
};
// Searchable words: Instagram search reads captions, so plain keywords help discovery more than extra tags.
const KEYWORDS = {
  motivation: 'Telugu motivational story | Telugu kathalu | life lessons in Telugu',
  moral: 'Telugu moral story | neethi kathalu | kids stories in Telugu',
  family: 'Telugu emotional story | amma prema | family story in Telugu',
  comedy: 'Telugu comedy story | Tenali Ramakrishna kathalu | funny Telugu story',
};
const hashtagsFor = (s) => `${CATEGORY_TAGS[s.category] || CATEGORY_TAGS.motivation} ${CORE_TAGS}`;
// Two-colour backgrounds, picked by story number so consecutive posts look different.
// Navy/blue family to match the Modern Stories logo.
const PALETTES = [
  ['0x0b1640', '0x1d3a8a'], ['0x0a1235', '0x2a2f7a'], ['0x0d1b4c', '0x16306e'], ['0x081030', '0x26408f'],
  ['0x0c1442', '0x3a2a7a'], ['0x0b1a48', '0x1f4f9a'],
];
const LOGO = path.join(root, 'assets/brand/logo-round.png');

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
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

const loadStories = async () => JSON.parse(await readFile(STORIES, 'utf8'));
const loadLog = async () => (existsSync(LOG) ? JSON.parse(await readFile(LOG, 'utf8')) : []);
const fullText = (s) => s.lines.join(' ');
// eleven_v4: 5 credits / 1000 chars (2.2 until 2026-10-12), min 1.
const estCredits = (s) => Math.max(1, Math.ceil((fullText(s).length / 1000) * 5));

async function narrate(story, outFile) {
  if (existsSync(outFile)) return; // never pay twice for the same audio
  const runway = new RunwayML();
  const task = await runway.textToSpeech
    .create({ model: 'eleven_v4', promptText: fullText(story), languageCode: 'te', voice: { type: 'runway-preset', presetId: VOICE } })
    .waitForTaskOutput({ timeout: 5 * 60 * 1000 });
  const res = await fetch(task.output[0]);
  if (!res.ok) throw new Error(`Voice download failed: HTTP ${res.status}`);
  await writeFile(outFile, Buffer.from(await res.arrayBuffer()));
}

async function duration(file) {
  const { err } = await ff(['-i', file]);
  const m = err.match(/Duration: (\d+):(\d+):([\d.]+)/);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

async function silences(file) {
  const { err } = await ff(['-i', file, '-af', 'silencedetect=noise=-35dB:d=0.25', '-f', 'null', '-']);
  const starts = [...err.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...err.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  return starts.map((s, i) => (s + (ends[i] ?? s)) / 2);
}

/** Caption timings: split by character share, then snap each boundary to the nearest pause in the voice. */
async function timings(story, audio, total) {
  const pauses = await silences(audio);
  const lens = story.lines.map((l) => l.length);
  const sum = lens.reduce((a, b) => a + b, 0);
  const bounds = [0];
  let acc = 0;
  for (let i = 0; i < lens.length - 1; i++) {
    acc += lens[i];
    const guess = (acc / sum) * total;
    const near = pauses.filter((p) => Math.abs(p - guess) < 1.2 && p > bounds.at(-1) + 0.6).sort((a, b) => Math.abs(a - guess) - Math.abs(b - guess))[0];
    bounds.push(near ?? guess);
  }
  bounds.push(total);
  return story.lines.map((text, i) => ({ text, start: bounds[i], end: bounds[i + 1] }));
}

const ts = (t) => {
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = (t % 60).toFixed(2).padStart(5, '0');
  return `${h}:${String(m).padStart(2, '0')}:${s}`;
};

const BRAND_TE = 'మోడర్న్ కథలు';
const BRAND_EN = 'MODERN STORIES';

// storyEnd = when narration stops and the "thanks for watching" end card starts.
function assFile(story, cues, total, storyEnd) {
  const esc = (t) => t.replace(/[{}]/g, '').replace(/\n/g, '\\N');
  const lines = cues.map((c) => `Dialogue: 1,${ts(c.start)},${ts(Math.min(c.end, storyEnd))},Main,,0,0,0,,{\\fad(250,200)}${esc(c.text)}`);
  const ms = Math.round(total * 1000);
  const box = (x1, y1, x2, y2) => `m ${x1} ${y1} l ${x2} ${y1} l ${x2} ${y2} l ${x1} ${y2}`;
  const branding = [
    // Top banner: dark translucent bar with gold accent line + brand name (same on every video).
    // Logo image is overlaid at the left of this bar by ffmpeg (see render()).
    `Dialogue: 0,${ts(0)},${ts(total)},Shape,,0,0,0,,{\\an7\\pos(0,0)\\p1\\1c&H2E1408&\\1a&H20&}${box(0, 0, 1080, 230)}{\\p0}`,
    `Dialogue: 0,${ts(0)},${ts(total)},Shape,,0,0,0,,{\\an7\\pos(0,230)\\p1\\1c&H30C3F5&\\1a&H00&}${box(0, 0, 1080, 6)}{\\p0}`,
    `Dialogue: 1,${ts(0)},${ts(total)},Brand,,0,0,0,,{\\pos(620,95)}${BRAND_TE}`,
    `Dialogue: 1,${ts(0)},${ts(total)},BrandSub,,0,0,0,,{\\pos(620,170)}${BRAND_EN}  •  TELUGU KATHALU`,
    `Dialogue: 1,${ts(0)},${ts(storyEnd)},Title,,0,0,0,,${esc(story.title)}`,
    // Open-loop hook: a question only the ending answers, so viewers stay (and replay the start).
    `Dialogue: 3,${ts(0)},${ts(3.2)},Hook,,0,0,0,,{\\fad(0,300)\\pos(540,560)\\t(0,400,\\fscx110\\fscy110)\\t(400,800,\\fscx100\\fscy100)}${esc(story.hook || 'చివరి వరకు చూడండి')}`,
    // Progress bar along the bottom fills up over the whole video.
    `Dialogue: 0,${ts(0)},${ts(total)},Shape,,0,0,0,,{\\an7\\pos(0,1904)\\p1\\1c&HFFFFFF&\\1a&HB0&}${box(0, 0, 1080, 16)}{\\p0}`,
    `Dialogue: 1,${ts(0)},${ts(total)},Shape,,0,0,0,,{\\an7\\pos(0,1904)\\p1\\1c&H30C3F5&\\fscx0\\t(0,${ms},\\fscx100)}${box(0, 0, 1080, 16)}{\\p0}`,
    `Dialogue: 1,${ts(0)},${ts(total)},Handle,,0,0,0,,@modern.storiez`,
    // End card (big logo is overlaid above this text by ffmpeg).
    `Dialogue: 2,${ts(storyEnd)},${ts(total)},EndBig,,0,0,0,,{\\fad(300,0)\\pos(540,1080)}చూసినందుకు ధన్యవాదాలు`,
    `Dialogue: 2,${ts(storyEnd + 0.4)},${ts(total)},EndCta,,0,0,0,,{\\fad(300,0)\\pos(540,1230)}LIKE  •  SHARE  •  FOLLOW`,
    `Dialogue: 2,${ts(storyEnd + 0.8)},${ts(total)},EndSmall,,0,0,0,,{\\fad(300,0)\\pos(540,1340)}ఇలాంటి మరిన్ని కథల కోసం ఫాలో అవ్వండి`,
  ];
  return `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Main,Noto Sans Telugu,76,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,2,5,100,100,0,1
Style: Title,Noto Sans Telugu,60,&H0030C3F5,&H0030C3F5,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,2,8,80,80,300,1
Style: Brand,Noto Sans Telugu,64,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1
Style: BrandSub,Noto Sans Telugu,30,&H0030C3F5,&H0030C3F5,&H00000000,&H00000000,1,0,0,0,100,100,6,0,1,0,0,5,0,0,0,1
Style: Shape,Noto Sans Telugu,20,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: Handle,Noto Sans Telugu,40,&H40FFFFFF,&H40FFFFFF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,0,0,2,80,80,70,1
Style: Hook,Noto Sans Telugu,70,&H0030C3F5,&H0030C3F5,&H00000000,&H90000000,1,0,0,0,100,100,0,0,3,0,0,5,0,0,0,1
Style: EndBig,Noto Sans Telugu,84,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,4,3,5,80,80,160,1
Style: EndCta,Noto Sans Telugu,58,&H0030C3F5,&H0030C3F5,&H00000000,&H80000000,1,0,0,0,100,100,4,0,1,3,2,5,80,80,-140,1
Style: EndSmall,Noto Sans Telugu,46,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,2,5,80,80,-290,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${branding.join('\n')}
${lines.join('\n')}
`;
}

const SPEED = 1.12; // slightly faster narration keeps viewers watching (pitch unchanged)
const END_CARD = 2.8; // seconds; short so it doesn't drag down average watch %

async function render(story, n, workDir) {
  // Raw voice is kept in the repo (committed by the workflow) so each story's narration is paid for once.
  const audio = path.join(root, 'assets/voice', `${story.id}.mp3`);
  await mkdir(path.dirname(audio), { recursive: true });
  const legacy = path.join(workDir, 'voice.mp3');
  if (!existsSync(audio) && existsSync(legacy)) await writeFile(audio, await readFile(legacy));
  console.log(`  voice (${VOICE}, ${existsSync(audio) ? 'cached, 0' : `~${estCredits(story)}`} credits)…`);
  await narrate(story, audio);
  const fast = path.join(workDir, 'voice-fast.wav');
  const sped = await ff(['-y', '-i', audio, '-af', `atempo=${SPEED},aresample=48000`, fast]);
  if (sped.code !== 0) throw new Error(`ffmpeg atempo failed:\n${sped.err.slice(-800)}`);
  const voiceLen = await duration(fast);
  const storyEnd = voiceLen + 0.4;
  const total = storyEnd + END_CARD;
  const cues = await timings(story, fast, voiceLen);
  const assPath = path.join(workDir, 'captions.ass');
  await writeFile(assPath, assFile(story, cues, total, storyEnd));
  const [c0, c1] = PALETTES[n % PALETTES.length];
  // Quiet A-minor pad under the narration (free, no copyright).
  const pad = [220, 261.63, 329.63, 440].map((f, i) => `${(0.05 - i * 0.009).toFixed(3)}*sin(2*PI*${f}*t)`).join('+');
  const out = path.join(workDir, 'final.mp4');
  console.log('  rendering video…');
  const { code, err } = await ff([
    '-y', '-f', 'lavfi', '-i', `gradients=s=1080x1920:c0=${c0}:c1=${c1}:speed=0.015:d=${total}:r=30`,
    '-i', fast, '-f', 'lavfi', '-i', `aevalsrc='(${pad})*(0.75+0.25*sin(2*PI*0.15*t))':s=48000:d=${total}`, '-loop', '1', '-i', LOGO,
    '-filter_complex', `[0:v]ass=${assPath.replace(/:/g, '\\:')}:fontsdir=${FONTS.replace(/:/g, '\\:')}[bg];` +
      `[3:v]format=rgba,split[l1][l2];[l1]scale=180:180[ls];[l2]scale=520:520,fade=t=in:st=${storyEnd}:d=0.4:alpha=1[lb];` +
      `[bg][ls]overlay=70:25:shortest=1[t1];[t1][lb]overlay=(W-w)/2:430:enable='gte(t,${storyEnd})',format=yuv420p[v];` +
      `[1:a]apad,atrim=0:${total}[vo];[2:a]lowpass=f=1400,afade=t=in:d=1,afade=t=out:st=${total - 1.5}:d=1.5[m];` +
      `[vo][m]amix=inputs=2:normalize=0:duration=first,pan=stereo|c0=c0|c1=c0[a]`,
    '-map', '[v]', '-map', '[a]', '-t', String(total),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out,
  ]);
  if (code !== 0) throw new Error(`ffmpeg failed:\n${err.slice(-1500)}`);
  return { out, seconds: total };
}

async function main() {
  const stories = await loadStories();
  const log = await loadLog();
  const done = new Set(log.map((e) => e.id));

  if (flag('--list')) {
    let total = 0;
    for (const s of stories) {
      total += done.has(s.id) ? 0 : estCredits(s);
      console.log(`${done.has(s.id) ? '✓' : ' '} ${s.id}  ~${estCredits(s)}cr  ${s.title}`);
    }
    console.log(`\n${stories.filter((s) => !done.has(s.id)).length} queued, ~${total} credits to make them all.`);
    return;
  }

  const story = opt('--id') ? stories.find((s) => s.id === opt('--id')) : stories.find((s) => !done.has(s.id));
  if (!story) return console.log('No Telugu stories left in the queue.');
  const n = stories.indexOf(story);
  const workDir = path.join(root, 'output', `telugu-${story.id}`);
  await mkdir(workDir, { recursive: true });

  console.log(`Story ${story.id}: ${story.title}${flag('--dry-run') ? ' [dry run]' : ''}`);
  const { out: video, seconds } = await render(story, n, workDir);
  console.log(`  ${video}`);
  if (flag('--dry-run')) return;

  console.log('  posting to Instagram…');
  // "Send to someone" drives DM shares — Instagram's strongest signal for reaching non-followers.
  const caption = `${story.caption}\n\n📤 ఈ కథ అవసరమైన ఒక్కరికి పంపండి\n👉 రోజూ ఒక కొత్త కథ కోసం @modern.storiez ని ఫాలో అవ్వండి\n\n${KEYWORDS[story.category] || KEYWORDS.motivation}\n\n${hashtagsFor(story)}`;
  const videoUrl = await hostVideo(video, `telugu-${story.id}.mp4`);
  console.log(`  hosted at ${videoUrl}`);
  const { mediaId, permalink } = await publishVideo(video, { mediaType: 'REELS', caption, videoUrl });
  log.push({ id: story.id, mediaId, permalink, seconds: Math.round(seconds), postedAt: new Date().toISOString() });
  await writeFile(LOG, JSON.stringify(log, null, 2) + '\n');
  console.log(`Posted! ${permalink || mediaId}`);
}

main().catch((e) => {
  console.error(`Failed: ${e.message}`);
  process.exitCode = 1;
});
