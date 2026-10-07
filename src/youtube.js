// Upload a finished video to YouTube as a Short. Skips quietly when YouTube isn't set up yet
// (no YT_REFRESH_TOKEN), so Instagram posting never depends on it.
import { readFile, stat } from 'node:fs/promises';

const enabled = () => Boolean(process.env.YT_REFRESH_TOKEN && process.env.YT_CLIENT_ID && process.env.YT_CLIENT_SECRET);

async function accessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.YT_CLIENT_ID,
      client_secret: process.env.YT_CLIENT_SECRET,
      refresh_token: process.env.YT_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const json = await res.json();
  if (!json.access_token) throw new Error(`YouTube sign-in failed: ${json.error_description || json.error || res.status}`);
  return json.access_token;
}

/**
 * @param {string} file  local mp4
 * @param {{title: string, description: string, tags?: string[], categoryId?: string}} meta
 * @returns {Promise<{id: string, url: string} | null>} null when YouTube isn't configured
 */
export async function uploadShort(file, { title, description, tags = [], categoryId = '22' }) {
  if (!enabled()) return null;
  const token = await accessToken();
  const { size } = await stat(file);
  const metadata = {
    // "#Shorts" in the title helps YouTube classify vertical videos under 3 min as Shorts.
    snippet: { title: `${title} #Shorts`.slice(0, 100), description: description.slice(0, 4900), tags: tags.slice(0, 15), categoryId, defaultLanguage: 'te' },
    status: {
      privacyStatus: process.env.YT_PRIVACY || 'public',
      selfDeclaredMadeForKids: false,
      // Disclose AI-generated voice/images (YouTube's altered or synthetic content setting).
      containsSyntheticMedia: true,
    },
  };
  const start = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'video/mp4',
      'X-Upload-Content-Length': String(size),
    },
    body: JSON.stringify(metadata),
  });
  const uploadUrl = start.headers.get('location');
  if (!uploadUrl) throw new Error(`YouTube upload refused (HTTP ${start.status}): ${(await start.text()).slice(0, 300)}`);
  const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body: await readFile(file) });
  const json = await put.json();
  if (!json.id) throw new Error(`YouTube upload failed (HTTP ${put.status}): ${JSON.stringify(json).slice(0, 300)}`);
  return { id: json.id, url: `https://youtube.com/shorts/${json.id}` };
}

/** Never let a YouTube problem stop the Instagram post. */
export async function tryUploadShort(file, meta) {
  try {
    const r = await uploadShort(file, meta);
    if (r) console.log(`  YouTube: ${r.url}`);
    return r;
  } catch (e) {
    console.warn(`  YouTube skipped: ${e.message}`);
    return null;
  }
}
