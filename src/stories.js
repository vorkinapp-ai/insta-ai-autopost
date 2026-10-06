import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config } from './config.js';

const RUNWAY_MODELS = new Set(['veo3.1', 'veo3.1_fast', 'gen4.5']);

/** Validate a story object and fill defaults. Throws with a readable message on bad input. */
export function normalizeStory(raw, file) {
  const where = `stories/${file}`;
  if (!raw || typeof raw !== 'object') throw new Error(`${where}: not a JSON object`);
  if (!Array.isArray(raw.scenes) || raw.scenes.length === 0) {
    throw new Error(`${where}: "scenes" must be a non-empty array`);
  }
  const postAs = (raw.postAs || 'REELS').toUpperCase();
  if (!['REELS', 'STORIES'].includes(postAs)) throw new Error(`${where}: "postAs" must be REELS or STORIES`);

  const scenes = raw.scenes.map((scene, i) => {
    const s = typeof scene === 'string' ? { prompt: scene } : scene;
    if (!s.prompt || typeof s.prompt !== 'string') throw new Error(`${where}: scene ${i + 1} needs a "prompt"`);
    const model = s.model || raw.model || config.runway.model;
    if (!RUNWAY_MODELS.has(model)) {
      throw new Error(`${where}: scene ${i + 1} model "${model}" not supported (use ${[...RUNWAY_MODELS].join(', ')})`);
    }
    return { prompt: s.prompt, model, seconds: s.seconds ?? raw.secondsPerScene ?? 8 };
  });

  const totalSeconds = scenes.reduce((sum, s) => sum + s.seconds, 0);
  if (postAs === 'STORIES' && totalSeconds > 60) {
    throw new Error(`${where}: Instagram Stories max 60s, this story is ${totalSeconds}s`);
  }

  return {
    id: path.basename(file, '.json'),
    file,
    title: raw.title || path.basename(file, '.json'),
    caption: raw.caption || '',
    postAs,
    // Optional consistent style appended to every scene prompt so clips look like one video.
    style: raw.style || '',
    scenes,
  };
}

export async function loadStories() {
  const dir = fileURLToPath(config.storiesDir);
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort();
  const stories = [];
  for (const file of files) {
    const raw = JSON.parse(await readFile(path.join(dir, file), 'utf8'));
    stories.push(normalizeStory(raw, file));
  }
  return stories;
}

export async function readPostedLog() {
  try {
    return JSON.parse(await readFile(config.postedLog, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

export async function appendPostedLog(entry) {
  const log = await readPostedLog();
  log.push(entry);
  await writeFile(config.postedLog, JSON.stringify(log, null, 2) + '\n');
}

/** Next story to post: files are taken in alphabetical order, skipping ones already in posted.json. */
export async function nextStory() {
  const [stories, log] = await Promise.all([loadStories(), readPostedLog()]);
  const done = new Set(log.map((e) => e.storyId));
  return stories.find((s) => !done.has(s.id)) || null;
}
