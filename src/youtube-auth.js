// One-time YouTube sign-in. Reads the OAuth client file you downloaded from Google Cloud
// (client_secret_*.json in this folder or ~/Downloads), opens Google's consent page, and saves
// YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN into .env. Nothing is printed.
//   npm run youtube-auth
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const PORT = 8765;
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;
const SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'];

async function findClientFile() {
  for (const dir of [root, path.join(homedir(), 'Downloads')]) {
    const hit = (await readdir(dir)).filter((f) => /^client_secret.*\.json$/.test(f)).sort().pop();
    if (hit) return path.join(dir, hit);
  }
  throw new Error('No client_secret_*.json found in this folder or ~/Downloads.');
}

async function saveEnv(values) {
  const file = path.join(root, '.env');
  let text = existsSync(file) ? await readFile(file, 'utf8') : '';
  for (const [k, v] of Object.entries(values)) {
    const line = `${k}=${v}`;
    text = new RegExp(`^${k}=.*$`, 'm').test(text) ? text.replace(new RegExp(`^${k}=.*$`, 'm'), line) : `${text.trimEnd()}\n${line}\n`;
  }
  await writeFile(file, text, { mode: 0o600 });
}

const client = JSON.parse(await readFile(await findClientFile(), 'utf8'));
const { client_id, client_secret } = client.installed || client.web;
const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
  client_id, redirect_uri: REDIRECT, response_type: 'code', scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent',
})}`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT);
  if (url.pathname !== '/callback') return res.writeHead(404).end();
  const code = url.searchParams.get('code');
  if (!code) {
    res.end(`Sign-in cancelled: ${url.searchParams.get('error') || 'no code'}`);
    return server.close();
  }
  const tok = await (await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id, client_secret, redirect_uri: REDIRECT, grant_type: 'authorization_code' }),
  })).json();
  if (!tok.refresh_token) {
    res.end('Sign-in failed — no refresh token returned. Please run npm run youtube-auth again.');
    console.error(`Failed: ${tok.error_description || tok.error || 'no refresh token'}`);
  } else {
    await saveEnv({ YT_CLIENT_ID: client_id, YT_CLIENT_SECRET: client_secret, YT_REFRESH_TOKEN: tok.refresh_token });
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end('<h2>✅ YouTube connected. You can close this tab.</h2>');
    console.log('YouTube connected — saved to .env.');
  }
  server.close();
});
server.listen(PORT, '127.0.0.1', () => {
  console.log('Opening Google sign-in in your browser… click Allow.');
  execFile('open', [authUrl]);
});
