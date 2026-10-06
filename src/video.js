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

const VIDEO_FILTER =
  'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p';
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
  args.push('-vf', VIDEO_FILTER, ...ENCODE, '-shortest', output);
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
