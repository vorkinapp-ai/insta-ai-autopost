// Extend the long-lived Instagram token (valid 60 days; must be refreshed before it expires).
// Writes the token to the file given by REFRESHED_TOKEN_FILE (used by the GitHub workflow),
// otherwise just reports the new expiry without printing the token.
import { writeFile } from 'node:fs/promises';
import { refreshToken } from './instagram.js';

try {
  const { access_token, expires_in } = await refreshToken();
  const days = Math.floor(expires_in / 86400);
  if (process.env.REFRESHED_TOKEN_FILE) {
    await writeFile(process.env.REFRESHED_TOKEN_FILE, access_token, { mode: 0o600 });
  } else if (access_token !== process.env.IG_ACCESS_TOKEN) {
    console.log('Instagram issued a new token string. Run with REFRESHED_TOKEN_FILE=<path> to save it, then update .env.');
  }
  console.log(`Token valid for another ${days} days.`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
