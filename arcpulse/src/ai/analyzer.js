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
      const parsed = JSON.parse(text.replace(/\`\`\`json|\`\`\`/g, '').trim());
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
