import { readFile, stat } from 'node:fs/promises';
import { config } from './config.js';

const ig = config.instagram;
const graph = (p) => `https://${ig.graphHost}/${ig.apiVersion}/${p}`;

async function call(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${ig.accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const e = json.error || {};
    throw new Error(`Instagram API ${method} ${url.split('?')[0]} failed (HTTP ${res.status}): ${e.message || JSON.stringify(json)}`);
  }
  return json;
}

export function me() {
  return call('GET', graph('me?fields=user_id,username,account_type'));
}

/** Upload a local MP4 via resumable upload and return the container id. */
async function createContainerFromFile(filePath, { mediaType, caption }) {
  const body = { media_type: mediaType, upload_type: 'resumable' };
  if (mediaType === 'REELS') {
    body.caption = caption;
    body.share_to_feed = true;
  }
  const container = await call('POST', graph(`${ig.userId}/media`), body);
  const uploadUri = container.uri || `https://rupload.facebook.com/ig-api-upload/${ig.apiVersion}/${container.id}`;

  const { size } = await stat(filePath);
  const res = await fetch(uploadUri, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${ig.accessToken}`,
      offset: '0',
      file_size: String(size),
    },
    body: await readFile(filePath),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false || json.error) {
    throw new Error(`Instagram video upload failed (HTTP ${res.status}): ${JSON.stringify(json)}`);
  }
  return container.id;
}

/** Wait until Instagram has processed the video. Docs suggest polling ~1/min; videos can take a few minutes. */
async function waitUntilReady(containerId, { timeoutMs = 15 * 60 * 1000, intervalMs = 30_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { status_code, status } = await call('GET', graph(`${containerId}?fields=status_code,status`));
    if (status_code === 'FINISHED') return;
    if (status_code === 'ERROR' || status_code === 'EXPIRED') {
      throw new Error(`Instagram rejected the video (${status_code}): ${status || 'no details'}`);
    }
    console.log(`  Instagram processing… (${status_code})`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('Timed out waiting for Instagram to process the video');
}

/** Create a container from a public video URL (what the Instagram Login API requires). */
async function createContainerFromUrl(videoUrl, { mediaType, caption }) {
  const body = { media_type: mediaType, video_url: videoUrl };
  if (mediaType === 'REELS') {
    body.caption = caption;
    body.share_to_feed = true;
  }
  return (await call('POST', graph(`${ig.userId}/media`), body)).id;
}

/**
 * Publish a video. Pass `videoUrl` (public link) for graph.instagram.com; without it, falls back to
 * resumable file upload, which only graph.facebook.com (Facebook Login) accepts.
 * Returns { mediaId, permalink }.
 */
export async function publishVideo(filePath, { mediaType = 'REELS', caption = '', videoUrl } = {}) {
  const containerId = videoUrl
    ? await createContainerFromUrl(videoUrl, { mediaType, caption })
    : await createContainerFromFile(filePath, { mediaType, caption });
  console.log(`  container ${containerId} created`);
  await waitUntilReady(containerId);
  const { id: mediaId } = await call('POST', graph(`${ig.userId}/media_publish`), { creation_id: containerId });
  let permalink = null;
  try {
    ({ permalink } = await call('GET', graph(`${mediaId}?fields=permalink`)));
  } catch {
    // Stories don't always expose a permalink; not fatal.
  }
  return { mediaId, permalink };
}

/** Extend a long-lived Instagram Login token by another 60 days. Returns { access_token, expires_in }. */
export async function refreshToken() {
  const url = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(ig.accessToken)}`;
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(`Token refresh failed: ${json.error?.message || res.status}`);
  return json;
}
