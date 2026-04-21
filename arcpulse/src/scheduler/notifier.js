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
