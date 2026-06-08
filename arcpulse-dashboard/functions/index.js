const { onRequest } = require('firebase-functions/v2/https');
const { GoogleAuth } = require('google-auth-library');
const fetch = require('node-fetch');

const CLOUD_RUN_URL = 'https://arcpulse-304203583577.us-central1.run.app';
const auth = new GoogleAuth();

exports.api = onRequest({ region: 'us-central1', cors: true }, async (req, res) => {
  try {
    const client = await auth.getIdTokenClient(CLOUD_RUN_URL);
    const headers = await client.getRequestHeaders(CLOUD_RUN_URL);

    const targetUrl = CLOUD_RUN_URL + req.path + (req.originalUrl.includes('?') ? '?' + req.originalUrl.split('?')[1] : '');

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error('Proxy error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
