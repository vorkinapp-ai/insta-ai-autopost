// Check the Instagram token works and print the IG user id to put in IG_USER_ID.
import { me } from './instagram.js';

try {
  const info = await me();
  console.log(`Connected as @${info.username} (${info.account_type})`);
  console.log(`IG_USER_ID=${info.user_id}`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
