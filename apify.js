// src/scrapers/apify.js
// Uses Apify cloud actors to scrape Facebook, Instagram, and TikTok
// Apify maintains these scrapers and fixes them when platforms change
// Docs: https://apify.com/store

const { ApifyClient } = require('apify-client');
const logger = require('../logger');

class ApifyScraper {
  constructor(config) {
    this.config = config;
    this.client = null;
    this.actors = config.apifyActors;
  }

  init() {
    if (!this.config.apify.token) {
      logger.warn('Apify token not configured — skipping social scrapes');
      return false;
    }
    this.client = new ApifyClient({ token: this.config.apify.token });
    return true;
  }

  // ── FACEBOOK ──────────────────────────────────────────────
  // Scrapes public Facebook posts and pages mentioning a keyword
  // Actor: https://apify.com/apify/facebook-posts-scraper
  async scrapeFacebook(terms, options = {}) {
    if (!this.client) return [];
    const { maxPostsPerQuery = 20, daysBack = 3 } = options;

    logger.info(`Facebook: scraping ${terms.length} terms`);

    try {
      const run = await this.client.actor(this.actors.facebook).call({
        // Search queries — one per brand/competitor
        queries: terms.map(t => t.term),
        maxPosts: maxPostsPerQuery,
        // Only fetch recent posts
        startUrls: [],
        // Filter to posts from the last N days
        onlyPostsNewerThan: new Date(
          Date.now() - daysBack * 24 * 60 * 60 * 1000
        ).toISOString(),
        language: 'en',
      });

      const { items } = await this.client.dataset(run.defaultDatasetId).listItems();

      return items.flatMap(item =>
        this._normalizeFacebookPost(item, terms)
      ).filter(Boolean);
    } catch (err) {
      logger.error(`Facebook scrape error: ${err.message}`);
      return [];
    }
  }

  // ── INSTAGRAM ─────────────────────────────────────────────
  // Scrapes public Instagram posts by hashtag and by profile
  // Actor: https://apify.com/apify/instagram-hashtag-scraper
  async scrapeInstagram(terms, options = {}) {
    if (!this.client) return [];
    const { maxPostsPerHashtag = 30 } = options;

    // Convert brand names to likely hashtags
    const hashtags = terms.flatMap(t => [
      t.term.toLowerCase().replace(/\s+/g, ''),
      t.term.toLowerCase().replace(/\s+/g, '_'),
    ]);

    logger.info(`Instagram: scraping hashtags: ${hashtags.join(', ')}`);

    try {
      const run = await this.client.actor(this.actors.instagram).call({
        hashtags,
        resultsLimit: maxPostsPerHashtag,
        // Also check profile posts for competitor profiles
        directUrls: terms
          .filter(t => t.instagramHandle)
          .map(t => `https://www.instagram.com/${t.instagramHandle}/`),
      });

      const { items } = await this.client.dataset(run.defaultDatasetId).listItems();

      return items.map(item => this._normalizeInstagramPost(item, terms)).filter(Boolean);
    } catch (err) {
      logger.error(`Instagram scrape error: ${err.message}`);
      return [];
    }
  }

  // ── TIKTOK ────────────────────────────────────────────────
  // Scrapes TikTok videos and comments by keyword
  // Actor: https://apify.com/apify/tiktok-scraper
  async scrapeTikTok(terms, options = {}) {
    if (!this.client) return [];
    const { maxVideosPerQuery = 20 } = options;

    logger.info(`TikTok: scraping ${terms.length} terms`);

    try {
      const run = await this.client.actor(this.actors.tiktok).call({
        // Keyword searches
        keywords: terms.map(t => t.term),
        maxVideos: maxVideosPerQuery,
        // Also scrape competitor profiles if handles are known
        profiles: terms
          .filter(t => t.tiktokHandle)
          .map(t => t.tiktokHandle),
        scrapeComments: true,
        maxComments: 50,
      });

      const { items } = await this.client.dataset(run.defaultDatasetId).listItems();

      return items.map(item => this._normalizeTikTokPost(item, terms)).filter(Boolean);
    } catch (err) {
      logger.error(`TikTok scrape error: ${err.message}`);
      return [];
    }
  }

  // ── FULL SCAN ─────────────────────────────────────────────
  // Run all three social scrapers for all brands + competitors
  async runFullScan(brands, competitors) {
    const ready = this.init();
    if (!ready) return { facebook: [], instagram: [], tiktok: [] };

    const brandTerms      = brands.map(b => ({ term: b, type: 'brand' }));
    const competitorTerms = competitors.map(c => ({ term: c, type: 'competitor' }));
    const allTerms        = [...brandTerms, ...competitorTerms];

    // Run all three scrapers in parallel
    const [facebook, instagram, tiktok] = await Promise.all([
      this.scrapeFacebook(allTerms),
      this.scrapeInstagram(allTerms),
      this.scrapeTikTok(allTerms),
    ]);

    logger.info(`Apify scan complete — FB: ${facebook.length}, IG: ${instagram.length}, TT: ${tiktok.length}`);

    return {
      facebook,
      instagram,
      tiktok,
      all: [...facebook, ...instagram, ...tiktok],
    };
  }

  // ── NORMALISERS ───────────────────────────────────────────

  _normalizeFacebookPost(item, terms) {
    const matchedTerm = terms.find(t =>
      (item.text || '').toLowerCase().includes(t.term.toLowerCase())
    );
    return {
      platform:    'facebook',
      sourceId:    `fb_${item.postId || item.id}`,
      type:        item.type || 'post',
      title:       (item.text || '').substring(0, 100),
      body:        (item.text || '').substring(0, 500),
      author:      item.authorName || item.authorId || 'unknown',
      pageUrl:     item.url || item.postUrl || '',
      url:         item.url || item.postUrl || '',
      likes:       item.likes || 0,
      comments:    item.comments || 0,
      shares:      item.shares || 0,
      createdAt:   item.date || item.time || new Date().toISOString(),
      entityType:  matchedTerm?.type || 'unknown',
      entityName:  matchedTerm?.term || '',
      searchQuery: matchedTerm?.term || '',
    };
  }

  _normalizeInstagramPost(item, terms) {
    const caption = item.caption || item.alt || '';
    const matchedTerm = terms.find(t =>
      caption.toLowerCase().includes(t.term.toLowerCase()) ||
      (item.hashtags || []).some(h => h.toLowerCase().includes(t.term.toLowerCase().replace(/\s/g, '')))
    );
    return {
      platform:    'instagram',
      sourceId:    `ig_${item.id || item.shortCode}`,
      type:        item.type || 'post',
      title:       caption.substring(0, 100),
      body:        caption.substring(0, 500),
      author:      item.ownerUsername || item.ownerId || 'unknown',
      url:         item.url || `https://www.instagram.com/p/${item.shortCode}/`,
      likes:       item.likesCount || 0,
      comments:    item.commentsCount || 0,
      hashtags:    item.hashtags || [],
      createdAt:   item.timestamp || new Date().toISOString(),
      entityType:  matchedTerm?.type || 'unknown',
      entityName:  matchedTerm?.term || '',
      searchQuery: matchedTerm?.term || '',
    };
  }

  _normalizeTikTokPost(item, terms) {
    const text = item.text || item.description || '';
    const matchedTerm = terms.find(t =>
      text.toLowerCase().includes(t.term.toLowerCase())
    );
    return {
      platform:    'tiktok',
      sourceId:    `tt_${item.id}`,
      type:        'video',
      title:       text.substring(0, 100),
      body:        text.substring(0, 500),
      author:      item.authorMeta?.name || item.author || 'unknown',
      authorHandle:item.authorMeta?.nickName || '',
      url:         item.webVideoUrl || `https://www.tiktok.com/@${item.authorMeta?.name}/video/${item.id}`,
      plays:       item.playCount || 0,
      likes:       item.diggCount || 0,
      comments:    item.commentCount || 0,
      shares:      item.shareCount || 0,
      hashtags:    (item.hashtags || []).map(h => h.name || h),
      createdAt:   item.createTimeISO || new Date(item.createTime * 1000).toISOString(),
      entityType:  matchedTerm?.type || 'unknown',
      entityName:  matchedTerm?.term || '',
      searchQuery: matchedTerm?.term || '',
    };
  }
}

module.exports = ApifyScraper;
