const express = require('express');
const cors    = require('cors');
const { getConfig } = require('./config');
const Scanner     = require('./scheduler/scanner');
const FirestoreDB = require('./db/firestore');
const logger      = require('./logger');

const app = express();
app.use(cors());
app.use(express.json());

let scanner = null, db = null;
async function instances() {
  if (!scanner) {
    const config = await getConfig();
    scanner = new Scanner(config);
    db      = new FirestoreDB(config);
  }
  return { scanner, db };
}

app.get('/',           (req, res) => res.json({ status: 'ok', service: 'arcpulse', time: new Date().toISOString() }));
app.post('/scan/full',   async (req, res) => { const { scanner } = await instances(); res.json(await scanner.run('full')); });
app.post('/scan/reddit', async (req, res) => { const { scanner } = await instances(); res.json(await scanner.run('reddit')); });
app.post('/scan/web',    async (req, res) => { const { scanner } = await instances(); res.json(await scanner.run('web')); });

app.get('/mentions', async (req, res) => {
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

app.get('/stats', async (req, res) => {
  const { db } = await instances();
  res.json(await db.getStats(Number(req.query.hoursBack) || 24));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => logger.info(`ArcPulse listening on port ${PORT}`));
module.exports = app;
