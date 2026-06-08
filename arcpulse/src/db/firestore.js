const { Firestore } = require('@google-cloud/firestore');
const logger = require('../logger');

class FirestoreDB {
  constructor(config) {
    this.db = new Firestore({ projectId: config.firestore.projectId });
    this.col = config.firestore.collection || 'mentions';
  }

  async saveMentions(mentions) {
    if (!mentions.length) return { saved: 0, skipped: 0 };
    let saved = 0, skipped = 0;
    const chunks = this._chunk(mentions, 30);
    for (const chunk of chunks) {
      const existingDocs = await this._getExistingDocs(chunk.map(m => m.sourceId));
      const batch = this.db.batch();
      chunk.forEach(m => {
        const existing = existingDocs.get(m.sourceId);
        // Skip only if already categorized properly (not unknown)
        if (existing && existing.category && existing.category !== 'unknown') {
          skipped++;
          return;
        }
        const ref = this.db.collection(this.col).doc(m.sourceId);
        batch.set(ref, {
          ...m,
          savedAt:      Firestore.Timestamp.now(),
          category:     m.ai?.category     || 'unknown',
          sentiment:    m.ai?.sentiment    || 'neutral',
          urgencyScore: m.ai?.urgencyScore || 3,
          valueScore:   m.ai?.valueScore   || 3,
          urgent:       m.ai?.urgent       || false,
          actionNeeded: m.ai?.actionNeeded || false,
          draftReply:   m.ai?.draftReply   || null,
          insight:      m.ai?.insight      || '',
          summary:      m.ai?.summary      || '',
        });
        saved++;
      });
      await batch.commit();
    }
    logger.info(`Firestore: saved ${saved}, skipped ${skipped}`);
    return { saved, skipped };
  }

  async getMentions(filters = {}) {
    const { category, platform, urgent, limit = 50, hoursBack = 24 } = filters;
    const since = new Date(Date.now() - hoursBack * 3600000);
    const snap = await this.db.collection(this.col)
      .where('savedAt', '>=', Firestore.Timestamp.fromDate(since))
      .orderBy('savedAt', 'desc')
      .get();
    let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (category) docs = docs.filter(m => m.category === category);
    if (platform) docs = docs.filter(m => m.platform === platform);
    if (urgent)   docs = docs.filter(m => m.urgent === true);
    return docs
      .sort((a, b) => (b.urgencyScore || 0) - (a.urgencyScore || 0))
      .slice(0, limit);
  }

  async getStats(hoursBack = 24) {
    const since = new Date(Date.now() - hoursBack * 3600000);
    const snap = await this.db.collection(this.col)
      .where('savedAt', '>=', Firestore.Timestamp.fromDate(since))
      .get();
    const all = snap.docs.map(d => d.data());
    return {
      total:      all.length,
      urgent:     all.filter(m => m.urgent).length,
      defend:     all.filter(m => m.category === 'defend').length,
      engage:     all.filter(m => m.category === 'engage').length,
      competitor: all.filter(m => m.category === 'competitor').length,
      positive:   all.filter(m => m.sentiment === 'positive').length,
      negative:   all.filter(m => m.sentiment === 'negative').length,
      byPlatform: {
        reddit:     all.filter(m => m.platform === 'reddit').length,
        hackernews: all.filter(m => m.platform === 'hackernews').length,
        news:       all.filter(m => m.platform === 'news').length,
        blog:       all.filter(m => m.platform === 'blog').length,
      },
    };
  }

  async getMonitoringConfig() {
    const doc = await this.db.collection('config').doc('monitoring').get();
    return doc.exists ? doc.data() : null;
  }

  async saveMonitoringConfig({ brandNames, competitorNames, keywords, googleAlertsRssUrls }) {
    await this.db.collection('config').doc('monitoring').set({
      brandNames:           brandNames           || [],
      competitorNames:      competitorNames      || [],
      keywords:             keywords             || [],
      googleAlertsRssUrls:  googleAlertsRssUrls  || [],
      updatedAt:            Firestore.Timestamp.now(),
    });
  }

  async _getExistingDocs(ids) {
    const existing = new Map();
    if (!ids.length) return existing;
    const refs = ids.map(id => this.db.collection(this.col).doc(id));
    const docs = await this.db.getAll(...refs);
    docs.forEach(d => { if (d.exists) existing.set(d.id, d.data()); });
    return existing;
  }

  _chunk(arr, n) {
    const out = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  }
}

module.exports = FirestoreDB;
