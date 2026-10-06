// Daily job: pick the next story, generate clips with Runway, stitch, post to Instagram.
//   npm run post                  -> post the next unposted story
//   npm run dry-run               -> generate + stitch only, no Instagram post
//   npm run post -- --story 002-x -> post a specific story file (without .json)
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config } from './config.js';
import { loadStories, nextStory, appendPostedLog } from './stories.js';
import { generateClips } from './runway.js';
import { stitch } from './video.js';
import { publishVideo } from './instagram.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const storyArg = args.includes('--story') ? args[args.indexOf('--story') + 1] : null;

async function main() {
  const story = storyArg
    ? (await loadStories()).find((s) => s.id === storyArg)
    : await nextStory();
  if (!story) {
    console.log(storyArg ? `No story named "${storyArg}" in stories/.` : 'No unposted stories left. Add more JSON files to stories/.');
    process.exitCode = storyArg ? 1 : 0;
    return;
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const workDir = path.join(fileURLToPath(config.outputDir), `${stamp}-${story.id}`);
  await mkdir(workDir, { recursive: true });

  console.log(`Story "${story.title}" (${story.scenes.length} scenes) -> ${story.postAs}${dryRun ? ' [dry run]' : ''}`);

  const clipPaths = story.scenes.map((_, i) => path.join(workDir, `scene-${i + 1}.mp4`));
  const finalPath = path.join(workDir, 'final.mp4');

  // Reuse anything already generated today (e.g. after a dry run or a failed upload) so credits aren't spent twice.
  if (existsSync(finalPath)) {
    console.log(`1-2/3 Reusing already generated video: ${finalPath}`);
  } else {
    const missing = story.scenes.map((s, i) => i).filter((i) => !existsSync(clipPaths[i]));
    console.log(`1/3 Generating ${missing.length} clip(s) with Runway${missing.length < clipPaths.length ? ' (reusing the rest)' : ''}…`);
    if (missing.length) {
      await generateClips({ ...story, scenes: missing.map((i) => story.scenes[i]) }, missing.map((i) => clipPaths[i]));
    }
    console.log('2/3 Stitching…');
    await stitch(clipPaths, finalPath);
    console.log(`  ${finalPath}`);
  }

  if (dryRun) {
    console.log('Dry run: skipping Instagram. Review the video above.');
    return;
  }

  console.log('3/3 Posting to Instagram…');
  const { mediaId, permalink } = await publishVideo(finalPath, { mediaType: story.postAs, caption: story.caption });
  await appendPostedLog({ storyId: story.id, mediaId, permalink, postAs: story.postAs, postedAt: new Date().toISOString() });
  console.log(`Posted! ${permalink || `media id ${mediaId}`}`);
}

main().catch((err) => {
  console.error(`\nFailed: ${err.message}`);
  process.exitCode = 1;
});
