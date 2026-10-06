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

const root = fileURLToPath(new URL('..', import.meta.url));
const STORIES = path.join(root, 'telugu-stories/stories.json');
const LOG = path.join(root, 'telugu-posted.json');
const FONTS = path.join(root, 'assets/fonts');
const VOICE = process.env.TELUGU_VOICE || 'Arjun';
const HASHTAGS = '#telugu #telugustories #telugumotivation #teluguquotes #moralstories #motivation #inspiration #modernstoriez';
// Two-colour backgrounds, picked by story number so consecutive posts look different.
const PALETTES = [
  ['0x0f2027', '0x2c5364'], ['0x1a1a2e', '0x16213e'], ['0x141e30', '0x243b55'], ['0x2c3e50', '0x000000'],
  ['0x0f0c29', '0x302b63'], ['0x42275a', '0x2b1a3a'], ['0x1d4350', '0x0b1f26'], ['0x3a1c71', '0x1b0f36'],
];

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

function assFile(story, cues, total) {
  const esc = (t) => t.replace(/[{}]/g, '').replace(/\n/g, '\\N');
  const lines = cues.map((c) => `Dialogue: 0,${ts(c.start)},${ts(c.end)},Main,,0,0,0,,{\\fad(250,200)}${esc(c.text)}`);
  return `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Main,Noto Sans Telugu,76,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,2,5,100,100,0,1
Style: Title,Noto Sans Telugu,58,&H0000D7FF,&H0000D7FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,2,8,80,80,260,1
Style: Handle,Noto Sans Telugu,40,&H80FFFFFF,&H80FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,80,80,170,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,${ts(0)},${ts(total)},Title,,0,0,0,,${esc(story.title)}
Dialogue: 0,${ts(0)},${ts(total)},Handle,,0,0,0,,@modern.storiez
${lines.join('\n')}
`;
}

async function render(story, n, workDir) {
  const audio = path.join(workDir, 'voice.mp3');
  console.log(`  voice (${VOICE}, ~${estCredits(story)} credits)…`);
  await narrate(story, audio);
  const total = (await duration(audio)) + 1.2;
  const cues = await timings(story, audio, total - 1.2);
  const assPath = path.join(workDir, 'captions.ass');
  await writeFile(assPath, assFile(story, cues, total));
  const [c0, c1] = PALETTES[n % PALETTES.length];
  const out = path.join(workDir, 'final.mp4');
  console.log('  rendering video…');
  const { code, err } = await ff([
    '-y', '-f', 'lavfi', '-i', `gradients=s=1080x1920:c0=${c0}:c1=${c1}:speed=0.015:d=${total}:r=30`,
    '-i', audio,
    '-filter_complex', `[0:v]ass=${assPath.replace(/:/g, '\\:')}:fontsdir=${FONTS.replace(/:/g, '\\:')},format=yuv420p[v];[1:a]apad,atrim=0:${total},aresample=48000[a]`,
    '-map', '[v]', '-map', '[a]', '-t', String(total),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-c:a', 'aac', '-b:a', '160k', '-ac', '2', '-movflags', '+faststart', out,
  ]);
  if (code !== 0) throw new Error(`ffmpeg failed:\n${err.slice(-1500)}`);
  return out;
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
  const video = await render(story, n, workDir);
  console.log(`  ${video}`);
  if (flag('--dry-run')) return;

  console.log('  posting to Instagram…');
  const caption = `${story.caption}\n\n${HASHTAGS}`;
  const { mediaId, permalink } = await publishVideo(video, { mediaType: 'REELS', caption });
  log.push({ id: story.id, mediaId, permalink, postedAt: new Date().toISOString() });
  await writeFile(LOG, JSON.stringify(log, null, 2) + '\n');
  console.log(`Posted! ${permalink || mediaId}`);
}

main().catch((e) => {
  console.error(`Failed: ${e.message}`);
  process.exitCode = 1;
});
