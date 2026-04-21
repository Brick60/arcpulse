const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
let _config = null;

async function loadSecret(client, projectId, name) {
  try {
    const [version] = await client.accessSecretVersion({
      name: `projects/${projectId}/secrets/${name}/versions/latest`,
    });
    return version.payload.data.toString('utf8').trim();
  } catch {
    return process.env[name] || null;
  }
}

async function getConfig() {
  if (_config) return _config;
  const isProduction = process.env.NODE_ENV === 'production';
  const projectId = process.env.GCP_PROJECT_ID;

  if (isProduction && projectId) {
    const client = new SecretManagerServiceClient();
    const [redditId, redditSecret, redditAgent, anthropicKey, slackUrl] =
      await Promise.all([
        loadSecret(client, projectId, 'REDDIT_CLIENT_ID'),
        loadSecret(client, projectId, 'REDDIT_CLIENT_SECRET'),
        loadSecret(client, projectId, 'REDDIT_USER_AGENT'),
        loadSecret(client, projectId, 'ANTHROPIC_API_KEY'),
        loadSecret(client, projectId, 'SLACK_WEBHOOK_URL'),
      ]);
    _config = {
      reddit: { clientId: redditId, clientSecret: redditSecret, userAgent: redditAgent },
      anthropic: { apiKey: anthropicKey },
      slack: { webhookUrl: slackUrl },
      firestore: { projectId, collection: process.env.FIRESTORE_COLLECTION || 'mentions' },
      brands: (process.env.BRAND_NAMES || '').split(',').map(s => s.trim()).filter(Boolean),
      competitors: (process.env.COMPETITOR_NAMES || '').split(',').map(s => s.trim()).filter(Boolean),
      keywords: (process.env.KEYWORDS || '').split(',').map(s => s.trim()).filter(Boolean),
    };
  } else {
    require('dotenv').config();
    _config = {
      reddit: {
        clientId: process.env.REDDIT_CLIENT_ID,
        clientSecret: process.env.REDDIT_CLIENT_SECRET,
        userAgent: process.env.REDDIT_USER_AGENT || 'ArcPulse/1.0',
      },
      anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
      slack: { webhookUrl: process.env.SLACK_WEBHOOK_URL },
      firestore: {
        projectId: process.env.GCP_PROJECT_ID,
        collection: process.env.FIRESTORE_COLLECTION || 'mentions',
      },
      brands: (process.env.BRAND_NAMES || '').split(',').map(s => s.trim()).filter(Boolean),
      competitors: (process.env.COMPETITOR_NAMES || '').split(',').map(s => s.trim()).filter(Boolean),
      keywords: (process.env.KEYWORDS || '').split(',').map(s => s.trim()).filter(Boolean),
    };
  }
  return _config;
}

module.exports = { getConfig };
