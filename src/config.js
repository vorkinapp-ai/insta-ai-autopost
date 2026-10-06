// Central config, read from environment variables (.env locally, secrets in GitHub Actions).

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}. See .env.example.`);
  return value;
}

export const config = {
  runway: {
    get apiKey() {
      return required('RUNWAYML_API_SECRET');
    },
    // Default model for scenes that don't set their own. veo3.1_fast supports vertical video + generated audio.
    model: process.env.RUNWAY_MODEL || 'veo3.1_fast',
    ratio: process.env.RUNWAY_RATIO || '720:1280',
  },
  instagram: {
    get accessToken() {
      return required('IG_ACCESS_TOKEN');
    },
    get userId() {
      return required('IG_USER_ID');
    },
    apiVersion: process.env.IG_API_VERSION || 'v25.0',
    // graph.instagram.com for "Instagram API with Instagram Login",
    // graph.facebook.com for "Instagram API with Facebook Login" (account linked to a Facebook Page).
    graphHost: process.env.IG_GRAPH_HOST || 'graph.instagram.com',
  },
  storiesDir: new URL('../stories/', import.meta.url),
  outputDir: new URL('../output/', import.meta.url),
  postedLog: new URL('../posted.json', import.meta.url),
};
