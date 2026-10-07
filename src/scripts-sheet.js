// Writes telugu-stories/SCRIPTS.md: every unposted story as a phone-friendly reading script
// (open it on GitHub on your phone while recording). Run: npm run scripts-sheet
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const stories = JSON.parse(await readFile(path.join(root, 'telugu-stories/stories.json'), 'utf8'));
const logFile = path.join(root, 'telugu-posted.json');
const posted = new Set((existsSync(logFile) ? JSON.parse(await readFile(logFile, 'utf8')) : []).map((e) => e.id));
const recorded = (id) => ['m4a', 'mp3', 'wav', 'aac', 'ogg'].some((x) => existsSync(path.join(root, 'assets/voice/own', `${id}.${x}`)));

let md = `# 🎙️ Recording scripts — మోడర్న్ కథలు

**How to record (1 minute per story):**
1. Quiet room, phone ~20 cm from your mouth, Voice Memos app.
2. Start reading immediately (no "hello"), with feeling — like telling a story to a friend.
3. Small pause between lines. Last line (the lesson) slowly and clearly.
4. Save the file named with the story number, e.g. **03.m4a**, and AirDrop it to the Mac.
5. Drop it into the folder **insta-ai-autopost/assets/voice/own/** — the next post of that story uses your voice automatically.

Stories without a recording still go out with the AI voice, so nothing ever stops.

---
`;
for (const s of stories.filter((x) => !posted.has(x.id))) {
  md += `\n## ${s.id} · ${s.title} ${recorded(s.id) ? '✅ recorded' : ''}\n\n`;
  md += s.lines.map((l) => `> ${l}`).join('\n>\n') + '\n\n---\n';
}
await writeFile(path.join(root, 'telugu-stories/SCRIPTS.md'), md);
console.log(`SCRIPTS.md: ${stories.length - posted.size} stories to record`);
