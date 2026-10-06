import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';

function run(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, ['-hide_banner', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d));
    proc.on('error', reject);
    proc.on('close', (code) => resolve({ code, stderr }));
  });
}

async function runOrThrow(args, what) {
  const { code, stderr } = await run(args);
  if (code !== 0) throw new Error(`ffmpeg ${what} failed:\n${stderr.slice(-2000)}`);
}

async function hasAudio(file) {
  // `ffmpeg -i` with no output exits non-zero but still prints stream info.
  const { stderr } = await run(['-i', file]);
  return /Stream #.*Audio:/.test(stderr);
}

/**
 * Runway sometimes letterboxes inside the 9:16 frame. Find the real picture area so we can crop the bars off.
 * Returns an ffmpeg crop filter or '' when there are no meaningful bars.
 */
async function detectBars(file) {
  const { stderr } = await run(['-ss', '1', '-i', file, '-vf', 'cropdetect=24:2:0', '-frames:v', '60', '-f', 'null', '-']);
  const matches = [...stderr.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)];
  if (!matches.length) return '';
  // Use the largest detected area so dark scenes don't get over-cropped.
  const [w, h, x, y] = matches.map((m) => m.slice(1).map(Number)).sort((a, b) => b[0] * b[1] - a[0] * a[1])[0];
  const { w: fw, h: fh } = await dimensions(file);
  if (fw - w < 8 && fh - h < 8) return '';
  return `crop=${w}:${h}:${x}:${y},`;
}

async function dimensions(file) {
  const { stderr } = await run(['-i', file]);
  const m = stderr.match(/Video:.*?, (\d{2,5})x(\d{2,5})/);
  return { w: Number(m?.[1]), h: Number(m?.[2]) };
}

// Fill the whole 1080x1920 frame (crop overflow) rather than padding, so there are never black bars.
const FILL_FILTER = 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,format=yuv420p';
const ENCODE = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-profile:v', 'high',
  '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2'];

/** Re-encode one clip to the common format; add a silent track if it has no audio. */
async function normalize(input, output) {
  const args = ['-y', '-i', input];
  if (await hasAudio(input)) {
    args.push('-map', '0:v:0', '-map', '0:a:0', '-af', 'apad');
  } else {
    args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000', '-map', '0:v:0', '-map', '1:a:0');
  }
  // -shortest ends at the video's length, so padded/silent audio never runs past it.
  args.push('-vf', (await detectBars(input)) + FILL_FILTER, ...ENCODE, '-shortest', output);
  await runOrThrow(args, `normalize ${path.basename(input)}`);
}

/** Join clips into one Instagram-ready vertical MP4 (1080x1920, 30fps, H.264 + AAC). */
export async function stitch(clipPaths, outPath) {
  const dir = path.dirname(outPath);
  const normalized = [];
  for (const [i, clip] of clipPaths.entries()) {
    const out = path.join(dir, `norm-${i + 1}.mp4`);
    await normalize(clip, out);
    normalized.push(out);
  }
  const listFile = path.join(dir, 'concat.txt');
  await writeFile(listFile, normalized.map((p) => `file '${p.replaceAll("'", "'\\''")}'`).join('\n') + '\n');
  await runOrThrow(['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', '-movflags', '+faststart', outPath], 'concat');
  return outPath;
}
