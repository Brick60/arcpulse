const RedditScraper = require('../scrapers/reddit');
const WebScraper    = require('../scrapers/web');
const AIAnalyzer    = require('../ai/analyzer');
const FirestoreDB   = require('../db/firestore');
const Notifier      = require('./notifier');
const logger        = require('../logger');

class Scanner {
  constructor(config) {
    this.config   = config;
    this.reddit   = new RedditScraper(config);
    this.web      = new WebScraper(config);
    this.analyzer = new AIAnalyzer(config);
    this.db       = new FirestoreDB(config);
    this.notifier = new Notifier(config);
  }

  async run(scanType = 'full') {
    const start = Date.now();
    const { brands, competitors, keywords } = this.config;
    logger.info(`ArcPulse scanner: starting ${scanType} scan`);

    if (!brands.length) {
      logger.warn('No brands configured — set BRAND_NAMES env var');
      return { success: false, error: 'No brands configured' };
    }

    let raw = [];
    try {
      if (scanType === 'reddit' || scanType === 'full') {
        raw.push(...await this.reddit.runFullScan(brands, competitors, keywords));
      }
      if (scanType === 'web' || scanType === 'full') {
        raw.push(...await this.web.runFullScan(brands, competitors, keywords, {
          googleAlertsRssUrls: (process.env.GOOGLE_ALERTS_RSS_URLS || '').split(',').filter(Boolean),
          industryRssFeeds: JSON.parse(process.env.INDUSTRY_RSS_FEEDS || '[]'),
        }));
      }

      logger.info(`Scanner: ${raw.length} raw mentions collected`);
      const filtered  = raw.filter(m => m.sourceId && (m.title || m.body));
      const analyzed  = await this.analyzer.analyzeBatch(filtered);
      const relevant  = analyzed.filter(m => m.ai?.category !== 'irrelevant');
      logger.info(`Scanner: ${relevant.length} relevant after AI filter`);

      const { saved, skipped } = await this.db.saveMentions(relevant);
      await this.notifier.notifyUrgent(relevant);

      const duration = ((Date.now() - start) / 1000).toFixed(1);
      logger.info(`Scan complete in ${duration}s — saved ${saved}, skipped ${skipped}`);
      return { success: true, scanType, duration: `${duration}s`, raw: raw.length, relevant: relevant.length, saved, skipped, urgent: relevant.filter(m => m.urgent).length };
    } catch (err) {
      logger.error(`Scanner error: ${err.message}`);
      return { success: false, error: err.message };
    }
  }
}

module.exports = Scanner;
