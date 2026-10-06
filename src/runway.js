import RunwayML, { TaskFailedError } from '@runwayml/sdk';
import { writeFile } from 'node:fs/promises';
import { config } from './config.js';

let client;
function runway() {
  client ??= new RunwayML({ apiKey: config.runway.apiKey });
  return client;
}

// Snap requested seconds onto what each model accepts.
function durationFor(model, seconds) {
  if (model.startsWith('veo3.1')) return [4, 6, 8].reduce((a, b) => (Math.abs(b - seconds) < Math.abs(a - seconds) ? b : a));
  return Math.min(10, Math.max(2, Math.round(seconds))); // gen4.5: 2–10s
}

function paramsFor(scene, style) {
  const framing = 'Full-frame vertical 9:16 composition, no letterbox or black bars';
  const promptText = [scene.prompt, style && `Style: ${style}`, framing].filter(Boolean).join('. ');
  const base = {
    model: scene.model,
    promptText,
    ratio: config.runway.ratio,
    duration: durationFor(scene.model, scene.seconds),
  };
  if (scene.model.startsWith('veo3.1')) base.audio = true;
  return base;
}

/**
 * Generate one clip per scene and download each to outPaths[i].
 * Scenes are submitted in parallel; Runway queues them on its side.
 */
export async function generateClips(story, outPaths) {
  return Promise.all(
    story.scenes.map(async (scene, i) => {
      const params = paramsFor(scene, story.style);
      console.log(`  [scene ${i + 1}] ${params.model} ${params.duration}s: ${scene.prompt.slice(0, 70)}…`);
      let task;
      try {
        task = await runway()
          .textToVideo.create(params)
          .waitForTaskOutput({ timeout: 20 * 60 * 1000 });
      } catch (err) {
        if (err instanceof TaskFailedError) {
          throw new Error(`Runway failed on scene ${i + 1}: ${JSON.stringify(err.taskDetails?.failure ?? err.taskDetails)}`);
        }
        throw err;
      }
      const url = task.output?.[0];
      if (!url) throw new Error(`Runway returned no output for scene ${i + 1}`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Download of scene ${i + 1} failed: HTTP ${res.status}`);
      await writeFile(outPaths[i], Buffer.from(await res.arrayBuffer()));
      console.log(`  [scene ${i + 1}] done`);
      return { path: outPaths[i], url };
    }),
  );
}
