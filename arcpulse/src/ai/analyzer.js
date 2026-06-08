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
      await this._sleep(1500); // ~6-7 batches/min stays under 50 req/min limit
    }
    return results;
  }

  async _analyzeSingle(mention, retries = 2) {
    try {
      const response = await this.client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: this._buildPrompt(mention) }],
      });
      const raw = response.content[0]?.text || '';
      const result = this._parse(raw);
      if (result.category === 'unknown') {
        logger.warn(`AI parse failed for ${mention.sourceId}: ${raw.slice(0, 150)}`);
      }
      return { ...mention, ai: result };
    } catch (err) {
      if (err.status === 429 && retries > 0) {
        await this._sleep(3000);
        return this._analyzeSingle(mention, retries - 1);
      }
      logger.error(`AI error for ${mention.sourceId}: ${err.message}`);
      return { ...mention, ai: { category: 'irrelevant', sentiment: 'neutral', urgencyScore: 1, valueScore: 1, urgent: false, actionNeeded: false, summary: '', draftReply: null, insight: '' } };
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
Posted: ${mention.publishedAt || mention.createdAt || 'unknown'}

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
      // Extract first JSON object from response (handles markdown fences, trailing text, etc.)
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('no JSON found');
      const parsed = JSON.parse(match[0]);
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
