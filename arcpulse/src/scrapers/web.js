const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');
const logger = require('../logger');

const xmlParser = new XMLParser({ ignoreAttributes: false });

// Welding subreddits to monitor via public RSS (no Reddit API key needed)
const WELDING_SUBREDDITS = [
  'welding', 'weldingadvice', 'metalworking', 'fabrication',
  'pipelinewelders', 'tig', 'mig_welding',
];

// Welding industry news/blog RSS feeds
const INDUSTRY_RSS = [
  { url: 'https://www.thefabricator.com/rss.xml',                name: 'The Fabricator' },
  { url: 'https://www.weldingjournal.com/rss.xml',               name: 'Welding Journal' },
  { url: 'https://www.aws.org/api/aws/latest-news/rss',          name: 'AWS News' },
  { url: 'https://weldingproductivity.com/feed/',                name: 'Welding Productivity' },
  { url: 'https://www.lincolnelectric.com/en/support/welding-how-to/rss', name: 'Lincoln Electric' },
];

class WebScraper {
  constructor(config) {
    this.config = config;
    this.http = axios.create({
      timeout: 15000,
      headers: { 'User-Agent': 'ArcPulse/1.0 (+https://arcpulse.app/bot)' },
    });
  }

  // Google News RSS — searches the full web (blogs, news, trade sites) for free
  async scrapeGoogleNews(terms) {
    const results = [];
    for (const { term, type } of terms) {
      try {
        const q = encodeURIComponent(term);
        const { data } = await this.http.get(
          `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`
        );
        const parsed = xmlParser.parse(data);
        const items = parsed?.rss?.channel?.item || [];
        const entries = Array.isArray(items) ? items : [items];
        entries.slice(0, 10).forEach(item => {
          const pubDate = item.pubDate || new Date().toISOString();
          if (this._isStale(pubDate)) return;
          const id = Buffer.from(item.link || item.guid || '').toString('base64').substring(0, 24);
          results.push({
            platform:    'news',
            sourceId:    `gnews_${id}`,
            type:        'article',
            title:       this._strip(item.title || ''),
            body:        this._strip(item.description || '').substring(0, 500),
            author:      item.source?.['#text'] || item.source || 'News',
            url:         item.link || '',
            publishedAt: pubDate,
            entityType:  type,
            entityName:  term,
            searchQuery: term,
          });
        });
        await this._sleep(500);
      } catch (err) {
        logger.warn(`Google News error for "${term}": ${err.message}`);
      }
    }
    return results;
  }

  // Reddit public RSS — no API key needed, covers community discussions
  async scrapeRedditRSS(terms) {
    const results = [];
    for (const sub of WELDING_SUBREDDITS) {
      try {
        const { data } = await this.http.get(`https://www.reddit.com/r/${sub}/new.json?limit=25`, {
          headers: { 'User-Agent': 'ArcPulse/1.0' },
        });
        const posts = data?.data?.children?.map(c => c.data) || [];
        posts.forEach(post => {
          const text = `${post.title} ${post.selftext}`.toLowerCase();
          const match = terms.find(t => text.includes(t.term.toLowerCase()));
          if (!match) return;
          const pubDate = new Date(post.created_utc * 1000).toISOString();
          if (this._isStale(pubDate)) return;
          results.push({
            platform:    'reddit',
            sourceId:    `reddit_${post.id}`,
            type:        'post',
            subreddit:   `r/${sub}`,
            title:       post.title || '',
            body:        (post.selftext || '').substring(0, 500),
            author:      post.author || 'unknown',
            url:         `https://reddit.com${post.permalink}`,
            score:       post.score || 0,
            numComments: post.num_comments || 0,
            publishedAt: pubDate,
            entityType:  match.type,
            entityName:  match.term,
            searchQuery: match.term,
          });
        });
        await this._sleep(1000); // be polite to Reddit
      } catch (err) {
        logger.warn(`Reddit RSS error for r/${sub}: ${err.message}`);
      }
    }
    return results;
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
          const pubDate = entry.updated || entry.published || new Date().toISOString();
          if (this._isStale(pubDate)) return;
          results.push({
            platform:    'news',
            sourceId:    `alert_${Buffer.from(entry.id || '').toString('base64').substring(0, 20)}`,
            type:        'news',
            title:       this._strip(entry.title || ''),
            body:        this._strip(entry.content || entry.summary || '').substring(0, 500),
            author:      entry.author?.name || 'Google Alerts',
            url:         entry.link?.['@_href'] || entry.link || '',
            publishedAt: pubDate,
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
          params: { query: term, tags: 'story', numericFilters: `created_at_i>${since}`, hitsPerPage: 5 },
        });
        data.hits?.forEach(hit => {
          const pubDate = hit.created_at || new Date().toISOString();
          if (this._isStale(pubDate)) return;
          results.push({
            platform:    'hackernews',
            sourceId:    `hn_${hit.objectID}`,
            type:        'post',
            title:       hit.title || '',
            body:        (hit.story_text || '').substring(0, 500),
            author:      hit.author || 'unknown',
            url:         hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
            points:      hit.points || 0,
            publishedAt: pubDate,
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

  async scrapeIndustryRSS(terms) {
    const results = [];
    for (const { url, name } of INDUSTRY_RSS) {
      try {
        const { data } = await this.http.get(url);
        const parsed = xmlParser.parse(data);
        const items = parsed?.rss?.channel?.item || parsed?.feed?.entry || [];
        const entries = Array.isArray(items) ? items : [items];
        entries.forEach(item => {
          const text = `${item.title || ''} ${item.description || item.summary || ''}`.toLowerCase();
          const match = terms.find(t => text.includes(t.term.toLowerCase()));
          if (!match) return;
          const pubDate = item.pubDate || item.updated || new Date().toISOString();
          if (this._isStale(pubDate)) return;
          results.push({
            platform:    'blog',
            sourceId:    `rss_${Buffer.from(item.link || item.id || '').toString('base64').substring(0, 20)}`,
            type:        'article',
            title:       this._strip(item.title || ''),
            body:        this._strip(item.description || item.summary || '').substring(0, 500),
            author:      item['dc:creator'] || item.author?.name || name,
            url:         item.link || item.link?.['@_href'] || '',
            publishedAt: pubDate,
            source:      name,
            entityType:  match.type,
            entityName:  match.term,
            searchQuery: match.term,
          });
        });
      } catch (err) {
        logger.warn(`Industry RSS error for ${name}: ${err.message}`);
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
        const pubDate = item.pubDate || item.updated || new Date().toISOString();
        if (this._isStale(pubDate)) return;
        results.push({
          platform:    'blog',
          sourceId:    `rss_${Buffer.from(item.link || item.id || '').toString('base64').substring(0, 20)}`,
          type:        'article',
          title:       this._strip(item.title || ''),
          body:        this._strip(item.description || item.summary || '').substring(0, 500),
          author:      item['dc:creator'] || item.author?.name || sourceName,
          url:         item.link || item.link?.['@_href'] || '',
          publishedAt: pubDate,
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

    const [googleNews, redditRSS, alerts, hn, industryRSS, ...extraRSS] = await Promise.all([
      this.scrapeGoogleNews(allTerms),
      this.scrapeRedditRSS(allTerms),
      this.scrapeGoogleAlerts(googleAlertsRssUrls),
      this.scrapeHackerNews(allTerms),
      this.scrapeIndustryRSS(allTerms),
      ...industryRssFeeds.map(({ url, name }) => this.scrapeRSSFeed(url, allTerms, name)),
    ]);

    const allResults = [...googleNews, ...redditRSS, ...alerts, ...hn, ...industryRSS, ...extraRSS.flat()];
    logger.info(`Web scan complete: ${allResults.length} results`);
    return allResults;
  }

  _isStale(dateStr) {
    if (!dateStr) return false;
    const pub = new Date(dateStr);
    if (isNaN(pub.getTime())) return false;
    return (Date.now() - pub.getTime()) > 2 * 365 * 24 * 60 * 60 * 1000;
  }

  _strip(html) { return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
  _sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
}

module.exports = WebScraper;
