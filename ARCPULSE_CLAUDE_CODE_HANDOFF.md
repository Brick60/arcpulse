# ArcPulse — Claude Code Build Instructions

## YOUR JOB
Scaffold, install, and validate the full ArcPulse MVP project in this workspace.
Follow each phase in order. Do not skip steps.

---

## CONTEXT
ArcPulse is a brand & competitor monitoring tool for the welding industry.
It scans Reddit, Hacker News, Google Alerts RSS, and industry RSS feeds,
uses Claude AI to analyze mentions, stores results in Google Firestore,
and displays them in a React dashboard hosted on Firebase.

**MVP scope — NO Twitter, NO Apify, NO Facebook/Instagram/TikTok.**
Architecture is clean so those can be added later.

**Two folders to create:**
- `arcpulse/` — Node.js backend (Google Cloud Run)
- `arcpulse-dashboard/` — React frontend (Firebase Hosting)

---

## PHASE 1 — SCAFFOLD BACKEND

Create folder `arcpulse/` with this exact structure:
```
arcpulse/
  src/
    scrapers/
      reddit.js
      web.js
    ai/
      analyzer.js
    db/
      firestore.js
    scheduler/
      scanner.js
      notifier.js
    config.js
    logger.js
    index.js
  .env.example
  .gitignore
  Dockerfile
  cloudbuild.yaml
  setup-schedulers.sh
  package.json
  README.md
```

### arcpulse/package.json
```json
{
  "name": "arcpulse",
  "version": "1.0.0",
  "description": "ArcPulse — welding industry brand monitoring service",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "test:reddit": "node src/test-reddit.js"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.24.0",
    "@google-cloud/firestore": "^7.6.0",
    "@google-cloud/secret-manager": "^5.0.0",
    "axios": "^1.6.0",
    "cors": "^2.8.5",
    "dotenv": "^16.0.0",
    "express": "^4.18.0",
    "fast-xml-parser": "^4.3.0",
    "snoowrap": "^1.23.0",
    "winston": "^3.11.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.0"
  },
  "engines": { "node": ">=20" }
}
```

### arcpulse/.gitignore
```
node_modules/
.env
.env.local
*.log
dist/
.DS_Store
```

### arcpulse/.env.example
```
# Reddit API — create app at reddit.com/prefs/apps (type: script)
REDDIT_CLIENT_ID=your_client_id_here
REDDIT_CLIENT_SECRET=your_client_secret_here
REDDIT_USER_AGENT=ArcPulse/1.0 by u/your_scraper_username

# Anthropic — console.anthropic.com
ANTHROPIC_API_KEY=your_anthropic_key_here

# Google Cloud
GCP_PROJECT_ID=your-gcp-project-id
FIRESTORE_COLLECTION=mentions

# Slack alerts (optional — leave blank to skip)
SLACK_WEBHOOK_URL=

# Your brands and competitors (comma-separated)
BRAND_NAMES=YourWeldingBrand
COMPETITOR_NAMES=CompetitorA,CompetitorB
KEYWORDS=welding equipment,mig welder,tig welding,welding rod,welding wire

# Google Alerts RSS URLs (comma-separated, from google.com/alerts)
GOOGLE_ALERTS_RSS_URLS=

# Industry RSS feeds as JSON array
# Example: [{"url":"https://thefabricator.com/rss","name":"The Fabricator"}]
INDUSTRY_RSS_FEEDS=[]

PORT=8080
```

### arcpulse/src/logger.js
```javascript
const winston = require('winston');
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message }) =>
      `${timestamp} [${level}]: ${message}`
    )
  ),
  transports: [new winston.transports.Console()],
});
module.exports = logger;
```

### arcpulse/src/config.js
```javascript
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
```

### arcpulse/src/scrapers/reddit.js
```javascript
const Snoowrap = require('snoowrap');
const logger = require('../logger');

class RedditScraper {
  constructor(config) {
    this.config = config;
    this.client = null;
    // Welding-specific subreddits — extend as needed
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
```

### arcpulse/src/scrapers/web.js
```javascript
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
```

### arcpulse/src/ai/analyzer.js
```javascript
const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../logger');

class AIAnalyzer {
  constructor(config) {
    this.client = new Anthropic({ apiKey: config.anthropic.apiKey });
    this.brands = config.brands;
    this.competitors = config.competitors;
    this.batchSize = 10;
  }

  async analyzeBatch(mentions) {
    const results = [];
    for (let i = 0; i < mentions.length; i += this.batchSize) {
      const batch = mentions.slice(i, i + this.batchSize);
      logger.info(`AI: analyzing batch ${Math.floor(i / this.batchSize) + 1} (${batch.length} mentions)`);
      const analyzed = await Promise.all(batch.map(m => this._analyzeSingle(m)));
      results.push(...analyzed);
      await this._sleep(500);
    }
    return results;
  }

  async _analyzeSingle(mention) {
    try {
      const response = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{ role: 'user', content: this._buildPrompt(mention) }],
      });
      return { ...mention, ai: this._parse(response.content[0]?.text || '') };
    } catch (err) {
      logger.error(`AI error for ${mention.sourceId}: ${err.message}`);
      return { ...mention, ai: { category: 'unknown', sentiment: 'neutral', urgencyScore: 3, valueScore: 3, urgent: false, actionNeeded: false, summary: '', draftReply: null, insight: '' } };
    }
  }

  _buildPrompt(mention) {
    return `You are a brand intelligence analyst for a welding industry company.
MY BRANDS: ${this.brands.join(', ')}
COMPETITORS: ${this.competitors.join(', ') || 'none'}

MENTION:
Platform: ${mention.platform}
Source: ${mention.subreddit || mention.source || ''}
Title: ${mention.title || ''}
Content: ${(mention.body || '').substring(0, 400)}
Author: ${mention.author || 'unknown'}
Score/Engagement: ${mention.score || mention.points || 0}
Posted: ${mention.createdAt || 'unknown'}

Respond with ONLY valid JSON, no markdown:
{
  "category": "defend|engage|competitor|irrelevant",
  "sentiment": "positive|negative|neutral",
  "urgencyScore": <1-10>,
  "valueScore": <1-10>,
  "urgent": <true if urgencyScore >= 8>,
  "actionNeeded": <true if we should respond>,
  "summary": "<1 sentence>",
  "draftReply": "<reply text or null — welding industry tone, helpful not salesy, max 3 sentences>",
  "insight": "<1 sentence strategic insight>"
}

Categories:
- defend: our brand mentioned, should respond
- engage: relevant welding/industry conversation we could join for visibility
- competitor: competitor being discussed
- irrelevant: not relevant`;
  }

  _parse(text) {
    try {
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
      return {
        category:     parsed.category     || 'unknown',
        sentiment:    parsed.sentiment    || 'neutral',
        urgencyScore: Number(parsed.urgencyScore) || 3,
        valueScore:   Number(parsed.valueScore)   || 3,
        urgent:       Boolean(parsed.urgent),
        actionNeeded: Boolean(parsed.actionNeeded),
        summary:      parsed.summary    || '',
        draftReply:   parsed.draftReply || null,
        insight:      parsed.insight    || '',
      };
    } catch {
      return { category: 'unknown', sentiment: 'neutral', urgencyScore: 3, valueScore: 3, urgent: false, actionNeeded: false, summary: '', draftReply: null, insight: '' };
    }
  }

  _sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
}

module.exports = AIAnalyzer;
```

### arcpulse/src/db/firestore.js
```javascript
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
      const existingIds = await this._getExistingIds(chunk.map(m => m.sourceId));
      const batch = this.db.batch();
      chunk.forEach(m => {
        if (existingIds.has(m.sourceId)) { skipped++; return; }
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
    let q = this.db.collection(this.col)
      .where('savedAt', '>=', Firestore.Timestamp.fromDate(since));
    if (category) q = q.where('category', '==', category);
    if (platform) q = q.where('platform', '==', platform);
    if (urgent)   q = q.where('urgent', '==', true);
    q = q.orderBy('urgencyScore', 'desc').limit(limit);
    const snap = await q.get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
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

  async _getExistingIds(ids) {
    const existing = new Set();
    if (!ids.length) return existing;
    const refs = ids.map(id => this.db.collection(this.col).doc(id));
    const docs = await this.db.getAll(...refs);
    docs.forEach(d => { if (d.exists) existing.add(d.id); });
    return existing;
  }

  _chunk(arr, n) {
    const out = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  }
}

module.exports = FirestoreDB;
```

### arcpulse/src/scheduler/notifier.js
```javascript
const axios = require('axios');
const logger = require('../logger');

class Notifier {
  constructor(config) {
    this.webhook = config.slack?.webhookUrl;
  }

  async notifyUrgent(mentions) {
    const urgent = mentions.filter(m => (m.urgencyScore || 0) >= 8);
    if (!urgent.length || !this.webhook) return;
    const top = urgent.sort((a, b) => (b.urgencyScore || 0) - (a.urgencyScore || 0)).slice(0, 5);
    const emoji = { reddit: '🔴', hackernews: '🟠', news: '📰', blog: '📝' };
    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: `🔔 ArcPulse — ${urgent.length} urgent mention${urgent.length > 1 ? 's' : ''}` } },
      { type: 'divider' },
      ...top.map(m => ({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            `${emoji[m.platform] || '🌐'} *${(m.platform || '').toUpperCase()}* · ${m.subreddit || m.source || ''}`,
            `*🚨 ${m.title?.substring(0, 80) || 'Untitled'}*`,
            m.summary || m.body?.substring(0, 120) || '',
            m.draftReply ? `_Suggested: "${m.draftReply.substring(0, 100)}..."_` : '',
            m.url ? `<${m.url}|View thread →>` : '',
          ].filter(Boolean).join('\n'),
        },
      })),
    ];
    try {
      await axios.post(this.webhook, { blocks });
      logger.info(`Slack: notified ${top.length} urgent mentions`);
    } catch (err) {
      logger.error(`Slack error: ${err.message}`);
    }
  }
}

module.exports = Notifier;
```

### arcpulse/src/scheduler/scanner.js
```javascript
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
```

### arcpulse/src/index.js
```javascript
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
```

### arcpulse/Dockerfile
```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
RUN useradd -m appuser && chown -R appuser /app
USER appuser
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["node", "src/index.js"]
```

### arcpulse/cloudbuild.yaml
```yaml
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'gcr.io/$PROJECT_ID/arcpulse:$COMMIT_SHA', '.']
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/arcpulse:$COMMIT_SHA']
  - name: 'gcr.io/cloud-builders/gcloud'
    args:
      - run
      - deploy
      - arcpulse
      - '--image=gcr.io/$PROJECT_ID/arcpulse:$COMMIT_SHA'
      - '--region=us-central1'
      - '--platform=managed'
      - '--allow-unauthenticated'
      - '--memory=512Mi'
      - '--cpu=1'
      - '--timeout=540'
      - '--min-instances=0'
      - '--max-instances=3'
      - '--set-env-vars=NODE_ENV=production,GCP_PROJECT_ID=$PROJECT_ID'
options:
  logging: CLOUD_LOGGING_ONLY
```

### arcpulse/setup-schedulers.sh
```bash
#!/bin/bash
# Usage: bash setup-schedulers.sh your-gcp-project-id your-cloud-run-url
PROJECT_ID=${1:-"your-project-id"}
SERVICE_URL=${2:-"https://arcpulse-XXXX-uc.a.run.app"}
REGION="us-central1"

echo "Setting up ArcPulse schedulers..."

gcloud scheduler jobs create http arcpulse-reddit \
  --project=$PROJECT_ID --location=$REGION \
  --schedule="*/15 * * * *" \
  --uri="$SERVICE_URL/scan/reddit" \
  --http-method=POST --message-body='{}' \
  --headers="Content-Type=application/json" \
  --description="Reddit scan every 15 minutes"

gcloud scheduler jobs create http arcpulse-web \
  --project=$PROJECT_ID --location=$REGION \
  --schedule="0 * * * *" \
  --uri="$SERVICE_URL/scan/web" \
  --http-method=POST --message-body='{}' \
  --headers="Content-Type=application/json" \
  --description="Web/RSS/HN scan every hour"

echo "Done. Jobs created:"
gcloud scheduler jobs list --project=$PROJECT_ID --location=$REGION
```

---

## PHASE 2 — SCAFFOLD DASHBOARD

Create folder `arcpulse-dashboard/` with this structure:
```
arcpulse-dashboard/
  public/
    index.html
  src/
    lib/
      api.js
    App.js
    App.css
    index.js
  .env.example
  .gitignore
  firebase.json
  package.json
```

### arcpulse-dashboard/package.json
```json
{
  "name": "arcpulse-dashboard",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-scripts": "5.0.1",
    "recharts": "^2.12.0"
  },
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build",
    "deploy": "npm run build && firebase deploy --only hosting"
  },
  "browserslist": {
    "production": [">0.2%", "not dead"],
    "development": ["last 1 chrome version"]
  }
}
```

### arcpulse-dashboard/.env.example
```
# Your Cloud Run backend URL — get this after deploying the backend
REACT_APP_API_URL=https://arcpulse-XXXX-uc.a.run.app
```

### arcpulse-dashboard/.gitignore
```
node_modules/
.env
.env.local
build/
.DS_Store
```

### arcpulse-dashboard/firebase.json
```json
{
  "hosting": {
    "public": "build",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }]
  }
}
```

### arcpulse-dashboard/public/index.html
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ArcPulse</title>
  <style>body { margin: 0; background: #0a0c0f; }</style>
</head>
<body><div id="root"></div></body>
</html>
```

### arcpulse-dashboard/src/index.js
```javascript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
);
```

### arcpulse-dashboard/src/lib/api.js
```javascript
const BASE = process.env.REACT_APP_API_URL || 'http://localhost:8080';

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

export const api = {
  getStats:    (h = 24)   => req(`/stats?hoursBack=${h}`),
  getMentions: (f = {})   => req(`/mentions?${new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([,v]) => v != null && v !== '')))}`),
  triggerScan: (t = 'full') => req(`/scan/${t}`, { method: 'POST', body: '{}' }),
};

// Demo data — used when no API is reachable
export const DEMO_STATS = {
  total: 31, urgent: 4, defend: 9, engage: 14, competitor: 8,
  positive: 12, negative: 7,
  byPlatform: { reddit: 22, hackernews: 5, news: 2, blog: 2 },
};

export const DEMO_MENTIONS = [
  {
    id: 'd1', platform: 'reddit', subreddit: 'r/welding', category: 'defend',
    entityName: 'YourBrand',
    title: 'Has anyone used YourBrand welding wire? Is it worth the price?',
    body: 'Looking at switching from Lincoln to YourBrand for our shop. The price difference is significant — is the quality actually there?',
    author: 'weldpro_mike', url: 'https://reddit.com/r/welding/demo1',
    urgencyScore: 9, sentiment: 'neutral', urgent: true, actionNeeded: true,
    insight: 'Purchase intent question in r/welding — early response from brand can drive conversion.',
    draftReply: "Hey Mike! We actually offer a free sample pack for shop owners evaluating a switch — the quality difference is easiest to judge firsthand. DM me your address and I'll get one out to you this week.",
    createdAt: new Date(Date.now() - 45 * 60000).toISOString(),
  },
  {
    id: 'd2', platform: 'reddit', subreddit: 'r/welding', category: 'engage',
    entityName: 'mig welding',
    title: 'Best settings for thin sheet metal MIG welding? Keep burning through',
    body: 'Working with 18 gauge steel and keep getting burn-through. Running a Miller 211 at 3/17. Any tips from experienced welders?',
    author: 'fabricator_dan', url: 'https://reddit.com/r/welding/demo2',
    urgencyScore: 6, sentiment: 'neutral', urgent: false, actionNeeded: true,
    insight: 'High-engagement technical thread — helpful answer builds brand credibility in the welding community.',
    draftReply: "18 gauge is tricky with MIG. Try dropping to setting 2 with about 14-15 wire speed, and use a slight push angle. If you have it, bumping your gas to 20-22 CFH can also help. What wire diameter are you running?",
    createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
  },
  {
    id: 'd3', platform: 'hackernews', category: 'engage',
    entityName: 'manufacturing automation',
    title: 'Ask HN: How are small manufacturers adopting automation without breaking the bank?',
    body: 'HN discussion about cost-effective automation for small fabrication and manufacturing shops.',
    author: 'hn_user', url: 'https://news.ycombinator.com/item?id=demo3',
    urgencyScore: 7, sentiment: 'neutral', urgent: false, actionNeeded: true,
    insight: 'Influential audience discussing your exact market — a specific answer gets upvotes and visibility.',
    draftReply: "We run a welding consumables business and have gone through this. The highest ROI for us was automating reorder triggers on high-velocity SKUs rather than trying to automate the welding itself. Saved ~8hrs/week of procurement overhead.",
    createdAt: new Date(Date.now() - 3 * 3600000).toISOString(),
  },
  {
    id: 'd4', platform: 'reddit', subreddit: 'r/metalworking', category: 'competitor',
    entityName: 'CompetitorA',
    title: 'CompetitorA raised their prices again — third time this year',
    body: 'Just got the notice that CompetitorA welding wire is going up another 8%. Starting to look at alternatives seriously.',
    author: 'shop_owner_tx', url: 'https://reddit.com/r/metalworking/demo4',
    urgencyScore: 8, sentiment: 'negative', urgent: true, actionNeeded: true,
    insight: 'Competitor pricing complaint with active switcher intent — prime acquisition opportunity.',
    draftReply: "We locked in our pricing through Q3 and are actively looking for shops making the switch. Happy to send over a comparison sheet and a sample run if you want to evaluate before committing.",
    createdAt: new Date(Date.now() - 90 * 60000).toISOString(),
  },
];
```

For `arcpulse-dashboard/src/App.js` and `arcpulse-dashboard/src/App.css`, use the full code from the files already downloaded in the project — they are complete and just need the following find-and-replace updates applied:
- Replace `"Brand Monitor"` → `"ArcPulse"`
- Replace `brand-monitor` → `arcpulse`
- Replace `Monitor` in logo text → `ArcPulse`
- Replace the DEMO_MENTIONS import to use the new welding-industry demo data above
- Remove `twitter` and `social` from the quick-scan buttons in the sidebar
- Update byPlatform in stats to show `reddit`, `hackernews`, `news`, `blog` only (remove twitter/facebook/instagram/tiktok)

---

## PHASE 3 — INSTALL & VALIDATE

Run these commands in order:

```bash
# Backend
cd arcpulse
npm install

# Verify no missing deps
node -e "require('./src/logger'); console.log('logger ok')"
node -e "require('./src/config'); console.log('config ok')"
node -e "require('./src/scrapers/reddit'); console.log('reddit ok')"
node -e "require('./src/scrapers/web'); console.log('web ok')"
node -e "require('./src/ai/analyzer'); console.log('analyzer ok')"
node -e "require('./src/scheduler/scanner'); console.log('scanner ok')"
node -e "require('./src/index'); console.log('index ok')" 2>&1 | head -5

# Dashboard
cd ../arcpulse-dashboard
npm install
```

---

## PHASE 4 — CREATE .env AND TEST REDDIT

1. Copy `.env.example` to `.env` in `arcpulse/`
2. Fill in the values I provide:
   - `REDDIT_CLIENT_ID` — from reddit.com/prefs/apps
   - `REDDIT_CLIENT_SECRET` — from reddit.com/prefs/apps
   - `REDDIT_USER_AGENT` — `ArcPulse/1.0 by u/[scraper_username]`
   - `ANTHROPIC_API_KEY` — from console.anthropic.com
   - `BRAND_NAMES` — the actual welding brand name
   - `COMPETITOR_NAMES` — competitor brand names
   - `KEYWORDS` — welding industry keywords

3. Create and run `arcpulse/src/test-reddit.js`:
```javascript
require('dotenv').config();
const { getConfig } = require('./config');
const RedditScraper = require('./scrapers/reddit');

async function test() {
  const config = await getConfig();
  const scraper = new RedditScraper(config);
  console.log('Testing Reddit connection...');
  const results = await scraper.runFullScan(
    config.brands.length ? config.brands : ['welding'],
    [],
    ['mig welding', 'tig welding']
  );
  console.log(`\nFound ${results.length} results:`);
  results.slice(0, 5).forEach(r => {
    console.log(`\n[${r.platform}] ${r.subreddit || ''}`);
    console.log(`  ${r.title.substring(0, 80)}`);
    console.log(`  ${r.url}`);
  });
}

test().catch(console.error);
```

Run it: `node src/test-reddit.js`

---

## PHASE 5 — GIT COMMIT

```bash
# From the workspace root
git add arcpulse/ arcpulse-dashboard/
git commit -m "feat: ArcPulse MVP — Reddit + web monitoring, AI analysis, React dashboard"
git push origin main
```

---

## PHASE 6 — GCP SETUP (when ready)

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  cloudscheduler.googleapis.com \
  secretmanager.googleapis.com \
  firestore.googleapis.com

gcloud firestore databases create --location=us-central1

# Store secrets
echo -n "YOUR_VALUE" | gcloud secrets create REDDIT_CLIENT_ID --data-file=-
echo -n "YOUR_VALUE" | gcloud secrets create REDDIT_CLIENT_SECRET --data-file=-
echo -n "YOUR_VALUE" | gcloud secrets create REDDIT_USER_AGENT --data-file=-
echo -n "YOUR_VALUE" | gcloud secrets create ANTHROPIC_API_KEY --data-file=-
echo -n "YOUR_VALUE" | gcloud secrets create SLACK_WEBHOOK_URL --data-file=-

# Deploy
cd arcpulse
gcloud builds submit --config cloudbuild.yaml

# Get URL and set up schedulers
SERVICE_URL=$(gcloud run services describe arcpulse --region=us-central1 --format='value(status.url)')
bash setup-schedulers.sh YOUR_PROJECT_ID $SERVICE_URL

# Set brand config on Cloud Run
gcloud run services update arcpulse --region=us-central1 \
  --set-env-vars="BRAND_NAMES=YourBrand" \
  --set-env-vars="COMPETITOR_NAMES=CompetitorA,CompetitorB" \
  --set-env-vars="KEYWORDS=welding wire,mig welder,tig welding"
```

---

## QUESTIONS TO ASK ME BEFORE STARTING
1. What is your actual brand name? (replaces "YourBrand" everywhere)
2. What are your 1-3 main competitors?
3. What are your top 5 welding industry keywords?
4. Do you have your Reddit client_id and client_secret ready?
5. Do you have your Anthropic API key ready?

Once I answer these, fill in the .env and run the Phase 4 test immediately.
