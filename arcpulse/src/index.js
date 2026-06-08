const express = require('express');
const cors    = require('cors');
const admin   = require('firebase-admin');
const { getConfig } = require('./config');
const Scanner     = require('./scheduler/scanner');
const FirestoreDB = require('./db/firestore');
const logger      = require('./logger');

admin.initializeApp();

const app = express();
app.use(cors({ origin: ['https://arcpulse.web.app', 'https://arcpulse.firebaseapp.com', 'http://localhost:3000'] }));
app.use(express.json());

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = await admin.auth().verifyIdToken(token);
    next();
  } catch {
    res.status(403).json({ error: 'Forbidden' });
  }
}

let scanner = null, db = null;
async function instances() {
  if (!scanner) {
    const config = await getConfig();
    scanner = new Scanner(config);
    db      = new FirestoreDB(config);
  }
  return { scanner, db };
}

app.get('/', (req, res) => res.json({ status: 'ok', service: 'arcpulse', time: new Date().toISOString() }));

// Scan routes — called by Cloud Scheduler (service account auth), not the browser
app.post('/scan/full',   async (req, res) => { const { scanner } = await instances(); res.json(await scanner.run('full')); });
app.post('/scan/reddit', async (req, res) => { const { scanner } = await instances(); res.json(await scanner.run('reddit')); });
app.post('/scan/web',    async (req, res) => { const { scanner } = await instances(); res.json(await scanner.run('web')); });

app.get('/mentions', requireAuth, async (req, res) => {
  const { db } = await instances();
  const mentions = await db.getMentions({
    category:  req.query.category,
    platform:  req.query.platform,
    urgent:    req.query.urgent === 'true',
    limit:     Number(req.query.limit)    || 50,
    hoursBack: Number(req.query.hoursBack) || 24,
  });
  res.json({ mentions, count: mentions.length });
});

app.get('/stats', requireAuth, async (req, res) => {
  const { db } = await instances();
  res.json(await db.getStats(Number(req.query.hoursBack) || 24));
});

app.get('/config', requireAuth, async (req, res) => {
  const { db } = await instances();
  const config = await getConfig();
  const doc = await db.getMonitoringConfig();
  res.json(doc || {
    brandNames:          config.brands,
    competitorNames:     config.competitors,
    keywords:            config.keywords,
    googleAlertsRssUrls: (process.env.GOOGLE_ALERTS_RSS_URLS || '').split(',').filter(Boolean),
  });
});

app.post('/config', requireAuth, async (req, res) => {
  const { db } = await instances();
  const { brandNames, competitorNames, keywords, googleAlertsRssUrls } = req.body;
  await db.saveMonitoringConfig({ brandNames, competitorNames, keywords, googleAlertsRssUrls });
  res.json({ success: true });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => logger.info(`ArcPulse listening on port ${PORT}`));
module.exports = app;
