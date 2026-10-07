// Instagram (Instagram Login API) only accepts videos by public URL, so each video is attached
// to a GitHub release ("media") of this public repo and Instagram downloads it from there.
import { execFile } from 'node:child_process';
import { copyFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const TAG = 'media';

async function repo() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  const { stdout } = await run('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']);
  return stdout.trim();
}

/** Upload `file` as `name` and return a public download URL. */
export async function hostVideo(file, name) {
  const slug = await repo();
  const gh = (...a) => run('gh', [...a, '--repo', slug], { maxBuffer: 1 << 24 });
  try {
    await gh('release', 'view', TAG);
  } catch {
    await gh('release', 'create', TAG, '--title', 'Media for Instagram', '--notes', 'Videos fetched by Instagram when posting.');
  }
  const named = path.join(path.dirname(file), name);
  await copyFile(file, named);
  await gh('release', 'upload', TAG, named, '--clobber');
  const url = `https://github.com/${slug}/releases/download/${TAG}/${encodeURIComponent(name)}`;
  const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
  if (!res.ok) throw new Error(`Video link isn't public (HTTP ${res.status}): ${url}`);
  return url;
}
