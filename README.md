# Insta AI Autopost

Write short story scripts → Runway generates a clip per scene → clips are stitched into one vertical video → posted to your Instagram as a Reel (or Story) every day.

```
stories/*.json ──► Runway (one clip per scene) ──► ffmpeg stitch 1080x1920 ──► Instagram API ──► posted.json
```

## 1. One-time setup

**Instagram account**: must be a **Professional** account (Creator or Business). Instagram app → Settings → Account type and tools.

**Meta app** (developers.facebook.com → your app):
1. Add product **Instagram** → "API setup with Instagram login".
2. Add your Instagram account under **Roles → Instagram testers**, then accept the invite in Instagram (Settings → Website permissions → Apps and websites → Tester invites).
3. In "Generate access tokens", add your account and click **Generate token**. That's a 60-day token with `instagram_business_basic` + `instagram_business_content_publish`.
   Because only you (an app role) use it, **no App Review is needed**; the app can stay in development mode.

**Runway**: create an API key at https://dev.runwayml.com and add credits (API billing is separate from the Runway app subscription).

**Local config**:
```bash
cp .env.example .env      # paste RUNWAYML_API_SECRET and IG_ACCESS_TOKEN
npm install
npm run whoami            # prints IG_USER_ID — paste it into .env
```

## 2. Write stories

One JSON file per post in `stories/`. They're posted in filename order (`001-…`, `002-…`), one per day. See `stories/_TEMPLATE.json` (files starting with `_` are ignored).

- `scenes`: 3–6 short visual prompts. veo models make 4/6/8s clips with sound, and dialogue in quotes gets spoken.
- `style`: appended to every scene. Describe recurring characters here so they look the same across clips.
- `postAs`: `REELS` (default) or `STORIES` (max 60s, no caption).

```bash
npm run validate          # check files + see the queue (free)
npm run dry-run           # generate + stitch only, video lands in output/ (uses Runway credits)
npm run post              # full run: generate, stitch, post
```

## 3. Run it daily on GitHub Actions

1. Push this folder to a **private** GitHub repo.
2. Repo → Settings → Secrets and variables → Actions → add secrets `RUNWAYML_API_SECRET`, `IG_ACCESS_TOKEN`, `IG_USER_ID`.
3. Optional secret `GH_PAT`: a fine-grained token with **Secrets: read and write** on this repo, so the workflow can save the refreshed Instagram token. Without it you must regenerate the token manually every ~60 days.
4. Actions tab → "Daily Instagram post" → **Run workflow** with dry run ✓ to test.

It runs daily at 13:00 UTC (6:30 PM IST). Change the `cron` line in `.github/workflows/daily-post.yml` to move it. Each run's video is also saved as a downloadable artifact for 14 days.

## Notes
- Your Facebook-Login-based app instead? Set `IG_GRAPH_HOST=graph.facebook.com` and use that flow's Page token + IG user id.
- Instagram allows 100 API posts per 24h; this posts 1.
- AI content: Instagram may auto-label it "AI info". That's expected.
