// src/lib/api.js
// Connects the dashboard to your Cloud Run backend
// Set REACT_APP_API_URL in .env to your Cloud Run service URL

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json();
}

export const api = {
  // Get dashboard stats
  getStats: (hoursBack = 24) =>
    request(`/stats?hoursBack=${hoursBack}`),

  // Get mentions with filters
  getMentions: (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.set(k, v);
    });
    return request(`/mentions?${params}`);
  },

  // Trigger a manual scan
  triggerScan: (type = 'full') =>
    request(`/scan/${type}`, { method: 'POST', body: '{}' }),
};

// ── Demo data for development / when no API is configured ──
export const DEMO_STATS = {
  total: 47,
  urgent: 6,
  defend: 14,
  engage: 21,
  competitor: 12,
  positive: 18,
  negative: 9,
  byPlatform: {
    reddit: 22, twitter: 11, facebook: 5,
    instagram: 4, tiktok: 3, hackernews: 1, news: 1,
  },
};

export const DEMO_MENTIONS = [
  {
    id: 'demo_1',
    platform: 'reddit',
    subreddit: 'r/entrepreneur',
    category: 'defend',
    entityName: 'YourBrand',
    title: 'Has anyone actually used YourBrand? Their pricing seems really high compared to alternatives',
    body: 'Been looking at project management tools and YourBrand keeps coming up but at $49/seat it feels steep. Is the AI actually useful or just marketing fluff?',
    author: 'startup_guy_99',
    url: 'https://reddit.com/r/entrepreneur/comments/demo1',
    urgencyScore: 9,
    sentiment: 'negative',
    urgent: true,
    actionNeeded: true,
    insight: 'Pricing objection in a high-traffic sub — early response with context can flip sentiment.',
    draftReply: "Hey! YourBrand founder here. The $49/seat includes the full AI suite — most teams see 4-6hrs saved per person per week. Happy to set up a personal demo so you can see if it fits your workflow. DM me anytime.",
    createdAt: new Date(Date.now() - 23 * 60000).toISOString(),
  },
  {
    id: 'demo_2',
    platform: 'twitter',
    authorHandle: '@techreviewerJen',
    category: 'defend',
    entityName: 'YourBrand',
    title: 'YourBrand\'s new update completely broke my workflow. Support hasn\'t responded in 48hrs.',
    body: 'Frustrated user with 12k followers calling out a support delay after recent product update.',
    author: 'techreviewerJen',
    url: 'https://twitter.com/demo2',
    urgencyScore: 10,
    sentiment: 'negative',
    urgent: true,
    actionNeeded: true,
    authorFollowers: 12400,
    insight: '12k follower account — high visibility. Respond publicly within the hour.',
    draftReply: "Hi Jen, really sorry to hear this. I'm escalating your ticket now and will personally make sure someone reaches out within the next 2 hours. Can you DM me your account email so I can track it directly?",
    createdAt: new Date(Date.now() - 2 * 60 * 60000).toISOString(),
  },
  {
    id: 'demo_3',
    platform: 'reddit',
    subreddit: 'r/SaaS',
    category: 'engage',
    entityName: 'project management',
    title: 'What tools are you using for async team communication in 2025? Tired of Slack noise',
    body: 'Our 12-person remote team is drowning in notifications. Looking for something that reduces async communication overhead without losing context.',
    author: 'remote_founder_mk',
    url: 'https://reddit.com/r/SaaS/comments/demo3',
    urgencyScore: 7,
    sentiment: 'neutral',
    urgent: false,
    actionNeeded: true,
    insight: 'Perfect opportunity to mention your async features — thread has 47 upvotes and 23 comments.',
    draftReply: "We ran into the exact same problem before building YourBrand. The key insight was separating synchronous urgency from async context. Happy to share what's worked for our own team if useful — feel free to check out how we handle it at yourbrand.com/async",
    createdAt: new Date(Date.now() - 4 * 60 * 60000).toISOString(),
  },
  {
    id: 'demo_4',
    platform: 'reddit',
    subreddit: 'r/smallbusiness',
    category: 'engage',
    entityName: 'workflow automation',
    title: 'Spending 3 hours a day on admin tasks — what\'s actually helped you automate repetitive work?',
    body: 'Small business owner asking for genuine automation recommendations after getting burned by overhyped tools.',
    author: 'coffeeshop_owner_pdx',
    url: 'https://reddit.com/r/smallbusiness/comments/demo4',
    urgencyScore: 6,
    sentiment: 'neutral',
    urgent: false,
    actionNeeded: true,
    insight: 'Early thread (posted 1h ago, 8 comments). High-intent question with specific pain point your product solves.',
    draftReply: "3 hours of admin daily is brutal — been there. The biggest unlock for us was automating the handoffs between tools rather than each tool separately. What does your current stack look like?",
    createdAt: new Date(Date.now() - 60 * 60000).toISOString(),
  },
  {
    id: 'demo_5',
    platform: 'hackernews',
    category: 'engage',
    entityName: 'AI productivity',
    title: 'Ask HN: How are you actually using AI tools in your daily workflow?',
    body: 'HN thread with 200+ comments asking for genuine AI workflow examples. High-quality audience.',
    author: 'hn_user_throwaway',
    url: 'https://news.ycombinator.com/item?id=demo5',
    urgencyScore: 8,
    sentiment: 'neutral',
    urgent: true,
    actionNeeded: true,
    insight: 'HN audience is skeptical but influential. A specific, honest answer gets traction here.',
    draftReply: "We use AI heavily for the first-draft problem — meeting summaries, status updates, ticket descriptions. The key was making it ambient (triggers automatically) rather than a tool you have to remember to open. Happy to share specifics.",
    createdAt: new Date(Date.now() - 30 * 60000).toISOString(),
  },
  {
    id: 'demo_6',
    platform: 'reddit',
    subreddit: 'r/entrepreneur',
    category: 'competitor',
    entityName: 'CompetitorA',
    title: 'CompetitorA just raised $40M Series B — what does this mean for the space?',
    body: 'Discussion about CompetitorA\'s funding round. Comments are mixed — some users praising their roadmap, others questioning their enterprise-only pivot.',
    author: 'vc_watcher_sf',
    url: 'https://reddit.com/r/entrepreneur/comments/demo6',
    urgencyScore: 5,
    sentiment: 'positive',
    urgent: false,
    actionNeeded: false,
    insight: 'CompetitorA is going enterprise. SMB market is wide open — consider positioning against this.',
    draftReply: null,
    createdAt: new Date(Date.now() - 6 * 60 * 60000).toISOString(),
  },
  {
    id: 'demo_7',
    platform: 'twitter',
    authorHandle: '@CompetitorA',
    category: 'competitor',
    entityName: 'CompetitorA',
    title: 'CompetitorA official account actively commenting in #projectmanagement threads',
    body: 'CompetitorA\'s social team has been very active today — replied to 12 tweets about productivity tools, always mentioning their new AI features.',
    author: 'CompetitorA',
    url: 'https://twitter.com/CompetitorA',
    urgencyScore: 7,
    sentiment: 'neutral',
    urgent: false,
    actionNeeded: true,
    insight: 'Competitor is running an engagement blitz today. Monitor these threads and consider counter-positioning.',
    draftReply: null,
    createdAt: new Date(Date.now() - 3 * 60 * 60000).toISOString(),
  },
  {
    id: 'demo_8',
    platform: 'reddit',
    subreddit: 'r/SaaS',
    category: 'competitor',
    entityName: 'CompetitorB',
    title: 'Switched from CompetitorB to [alternatives] — here\'s what I learned after 6 months',
    body: 'User sharing detailed comparison after leaving CompetitorB. Main complaints: pricing increases, poor customer support, and missing integrations.',
    author: 'saas_switcher_2024',
    url: 'https://reddit.com/r/SaaS/comments/demo8',
    urgencyScore: 8,
    sentiment: 'negative',
    urgent: true,
    actionNeeded: true,
    insight: 'Dissatisfied CompetitorB customer actively looking for alternatives. Prime acquisition opportunity.',
    draftReply: "Hey, saw your post about leaving CompetitorB — the integration gaps you mentioned are exactly what we designed around. Would love to show you how we handle [specific pain point]. No sales pitch, just a 20-min look.",
    createdAt: new Date(Date.now() - 45 * 60000).toISOString(),
  },
];
