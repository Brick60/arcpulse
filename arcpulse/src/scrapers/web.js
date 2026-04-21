const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');
const logger = require('../logger');

const xmlParser = new XMLParser({ ignoreAttributes: false });

class WebScraper {
  constructor(config) {
    this.config = config;
    this.http = axios.create({
      timeout: 15000,
      headers: { 'User-Agent': 'ArcPulse/1.0 (+https://arcpulse.app/bot)' },
    });
  }

  async scrapeGoogleAlerts(rssUrls) {
    const results = [];
    for (const url of rssUrls) {
      try {
        const { data } = await this.http.get(url);
        const parsed = xmlParser.parse(data);
        const items = parsed?.feed?.entry || [];
        const entries = Array.isArray(items) ? items : [items];
        entries.forEach(entry => {
          results.push({
            platform:    'news',
            sourceId:    `alert_${Buffer.from(entry.id || '').toString('base64').substring(0, 20)}`,
            type:        'news',
            title:       this._strip(entry.title || ''),
            body:        this._strip(entry.content || entry.summary || '').substring(0, 500),
            author:      entry.author?.name || 'Google Alerts',
            url:         entry.link?.['@_href'] || entry.link || '',
            createdAt:   entry.updated || entry.published || new Date().toISOString(),
            searchQuery: url,
          });
        });
      } catch (err) {
        logger.warn(`Google Alerts error for ${url}: ${err.message}`);
      }
    }
    return results;
  }

  async scrapeHackerNews(terms, daysBack = 7) {
    const results = [];
    const since = Math.floor((Date.now() - daysBack * 86400000) / 1000);
    for (const { term, type } of terms) {
      try {
        const { data } = await this.http.get('https://hn.algolia.com/api/v1/search_by_date', {
          params: { query: term, tags: '(story,comment)', numericFilters: `created_at_i>${since}`, hitsPerPage: 20 },
        });
        data.hits?.forEach(hit => {
          results.push({
            platform:    'hackernews',
            sourceId:    `hn_${hit.objectID}`,
            type:        hit._tags?.includes('comment') ? 'comment' : 'post',
            title:       hit.title || hit.comment_text?.substring(0, 100) || '',
            body:        (hit.story_text || hit.comment_text || '').substring(0, 500),
            author:      hit.author || 'unknown',
            url:         hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
            points:      hit.points || 0,
            createdAt:   hit.created_at || new Date().toISOString(),
            entityType:  type,
            entityName:  term,
            searchQuery: term,
          });
        });
        await this._sleep(300);
      } catch (err) {
        logger.warn(`HN search error for "${term}": ${err.message}`);
      }
    }
    return results;
  }

  async scrapeRSSFeed(feedUrl, terms, sourceName = 'RSS') {
    const results = [];
    try {
      const { data } = await this.http.get(feedUrl);
      const parsed = xmlParser.parse(data);
      const items = parsed?.rss?.channel?.item || parsed?.feed?.entry || [];
      const entries = Array.isArray(items) ? items : [items];
      entries.forEach(item => {
        const text = `${item.title || ''} ${item.description || item.summary || ''}`.toLowerCase();
        const match = terms.find(t => text.includes(t.term.toLowerCase()));
        if (!match) return;
        results.push({
          platform:    'blog',
          sourceId:    `rss_${Buffer.from(item.link || item.id || '').toString('base64').substring(0, 20)}`,
          type:        'article',
          title:       this._strip(item.title || ''),
          body:        this._strip(item.description || item.summary || '').substring(0, 500),
          author:      item['dc:creator'] || item.author?.name || sourceName,
          url:         item.link || item.link?.['@_href'] || '',
          createdAt:   item.pubDate || item.updated || new Date().toISOString(),
          source:      sourceName,
          entityType:  match.type,
          entityName:  match.term,
          searchQuery: match.term,
        });
      });
    } catch (err) {
      logger.warn(`RSS feed error for ${feedUrl}: ${err.message}`);
    }
    return results;
  }

  async runFullScan(brands, competitors, keywords, options = {}) {
    const { googleAlertsRssUrls = [], industryRssFeeds = [] } = options;
    const allTerms = [
      ...brands.map(b => ({ term: b, type: 'brand' })),
      ...competitors.map(c => ({ term: c, type: 'competitor' })),
      ...keywords.map(k => ({ term: k, type: 'opportunity' })),
    ];
    logger.info('Web scraper: starting scan');
    const [alerts, hn, ...rssResults] = await Promise.all([
      this.scrapeGoogleAlerts(googleAlertsRssUrls),
      this.scrapeHackerNews(allTerms),
      ...industryRssFeeds.map(({ url, name }) => this.scrapeRSSFeed(url, allTerms, name)),
    ]);
    const allResults = [...alerts, ...hn, ...rssResults.flat()];
    logger.info(`Web scan complete: ${allResults.length} results`);
    return allResults;
  }

  _strip(html) { return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
  _sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
}

module.exports = WebScraper;
