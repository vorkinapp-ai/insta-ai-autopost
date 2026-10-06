// Check every story file parses and show the posting queue. Costs nothing (no API calls).
import { loadStories, readPostedLog } from './stories.js';

try {
  const [stories, log] = await Promise.all([loadStories(), readPostedLog()]);
  const done = new Set(log.map((e) => e.storyId));
  for (const s of stories) {
    const secs = s.scenes.reduce((t, x) => t + x.seconds, 0);
    console.log(`${done.has(s.id) ? '✓ posted ' : '  queued '} ${s.id}  ${s.postAs}  ${s.scenes.length} scenes  ~${secs}s  "${s.title}"`);
  }
  const left = stories.filter((s) => !done.has(s.id)).length;
  console.log(`\n${left} stories queued (${left} days of posts).`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
