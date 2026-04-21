const Snoowrap = require('snoowrap');
const logger = require('../logger');

class RedditScraper {
  constructor(config) {
    this.config = config;
    this.client = null;
    this.weldingSubreddits = [
      'welding', 'metalworking', 'fabrication', 'weldingmemes',
      'machining', 'DIY', 'Tools', 'smallbusiness', 'entrepreneur',
    ];
  }

  async init() {
    if (!this.config.reddit.clientId) {
      logger.warn('Reddit credentials not configured — skipping Reddit scrape');
      return false;
    }
    this.client = new Snoowrap({
      userAgent:    this.config.reddit.userAgent,
      clientId:     this.config.reddit.clientId,
      clientSecret: this.config.reddit.clientSecret,
      username: '',
      password: '',
    });
    this.client.config({ requestDelay: 1000, continueAfterRatelimitError: true });
    logger.info('Reddit client initialized');
    return true;
  }

  async searchAll(query, limit = 25) {
    try {
      const results = await this.client.search({ query, sort: 'new', time: 'day', limit });
      return results.map(post => this._normalizePost(post, query));
    } catch (err) {
      logger.error(`Reddit searchAll error for "${query}": ${err.message}`);
      return [];
    }
  }

  async searchSubreddits(query, subreddits = this.weldingSubreddits, limit = 10) {
    const results = [];
    for (const sub of subreddits) {
      try {
        const posts = await this.client.getSubreddit(sub).search({
          query, sort: 'new', time: 'week', limit,
        });
        results.push(...posts.map(post => this._normalizePost(post, query, sub)));
        await this._sleep(500);
      } catch (err) {
        logger.warn(`Reddit sub search error r/${sub}: ${err.message}`);
      }
    }
    return results;
  }

  async searchComments(query, limit = 25) {
    try {
      const comments = await this.client.search({
        query, sort: 'new', time: 'day', limit, type: 'comment',
      });
      return comments.map(c => this._normalizeComment(c, query));
    } catch (err) {
      logger.error(`Reddit comment search error: ${err.message}`);
      return [];
    }
  }

  async runFullScan(brands, competitors, keywords) {
    const ready = await this.init();
    if (!ready) return [];

    const allTerms = [
      ...brands.map(b => ({ term: b, type: 'brand' })),
      ...competitors.map(c => ({ term: c, type: 'competitor' })),
    ];

    const allResults = [];

    for (const { term, type } of allTerms) {
      logger.info(`Reddit: scanning for "${term}" (${type})`);
      const [global, subbed, comments] = await Promise.all([
        this.searchAll(term),
        this.searchSubreddits(term),
        this.searchComments(term),
      ]);
      const deduped = this._dedupe([...global, ...subbed, ...comments]);
      deduped.forEach(r => { r.entityType = type; r.entityName = term; });
      allResults.push(...deduped);
      await this._sleep(1000);
    }

    for (const keyword of keywords.slice(0, 5)) {
      logger.info(`Reddit: scanning keyword "${keyword}"`);
      const opps = await this.searchAll(keyword, 15);
      opps.forEach(r => { r.entityType = 'opportunity'; r.entityName = keyword; });
      allResults.push(...opps);
      await this._sleep(1000);
    }

    logger.info(`Reddit scan complete: ${allResults.length} results`);
    return allResults;
  }

  _normalizePost(post, query, subreddit = null) {
    return {
      platform:    'reddit',
      sourceId:    `reddit_${post.id}`,
      type:        'post',
      title:       post.title || '',
      body:        (post.selftext || '').substring(0, 500),
      author:      post.author?.name || '[deleted]',
      subreddit:   `r/${subreddit || post.subreddit?.display_name || 'unknown'}`,
      url:         `https://reddit.com${post.permalink}`,
      score:       post.score || 0,
      numComments: post.num_comments || 0,
      createdAt:   new Date(post.created_utc * 1000).toISOString(),
      searchQuery: query,
    };
  }

  _normalizeComment(comment, query) {
    return {
      platform:    'reddit',
      sourceId:    `reddit_comment_${comment.id}`,
      type:        'comment',
      title:       `Comment in ${comment.subreddit_name_prefixed || 'unknown'}`,
      body:        (comment.body || '').substring(0, 500),
      author:      comment.author?.name || '[deleted]',
      subreddit:   comment.subreddit_name_prefixed || '',
      url:         `https://reddit.com${comment.permalink}`,
      score:       comment.score || 0,
      numComments: 0,
      createdAt:   new Date(comment.created_utc * 1000).toISOString(),
      searchQuery: query,
    };
  }

  _dedupe(items) {
    const seen = new Set();
    return items.filter(item => {
      if (seen.has(item.sourceId)) return false;
      seen.add(item.sourceId);
      return true;
    });
  }

  _sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
}

module.exports = RedditScraper;
