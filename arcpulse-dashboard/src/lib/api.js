const BASE = process.env.REACT_APP_API_URL || 'http://localhost:8080';

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

export const api = {
  getStats:    (h = 24)   => req(`/stats?hoursBack=${h}`),
  getMentions: (f = {})   => req(`/mentions?${new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([,v]) => v != null && v !== '')))}`)  ,
  triggerScan: (t = 'full') => req(`/scan/${t}`, { method: 'POST', body: '{}' }),
};

export const DEMO_STATS = {
  total: 31, urgent: 4, defend: 9, engage: 14, competitor: 8,
  positive: 12, negative: 7,
  byPlatform: { reddit: 22, hackernews: 5, news: 2, blog: 2 },
};

export const DEMO_MENTIONS = [
  {
    id: 'd1', platform: 'reddit', subreddit: 'r/welding', category: 'defend',
    entityName: 'CMR Fabrications',
    title: 'Has anyone used CMR Fabrications welding hoods? Worth the price over a standard pancake?',
    body: 'Looking at switching from my Lincoln Viking to a CMR carbon fiber hood for pipeline work. The price difference is significant — is the quality actually there for long shifts?',
    author: 'weldpro_mike', url: 'https://reddit.com/r/welding/demo1',
    urgencyScore: 9, sentiment: 'neutral', urgent: true, actionNeeded: true,
    insight: 'Purchase intent question in r/welding — early response from brand can drive conversion.',
    draftReply: "Hey Mike! We actually offer a free sample consultation for welders evaluating a switch to CMR — the quality difference in our carbon fiber pancake hoods is easiest to judge firsthand. DM me your info and I'll get you sorted.",
    createdAt: new Date(Date.now() - 45 * 60000).toISOString(),
  },
  {
    id: 'd2', platform: 'reddit', subreddit: 'r/welding', category: 'engage',
    entityName: 'pancake welding hood',
    title: 'Best pancake hood for pipeline welding in 2025? Getting into cross-country work',
    body: 'Just got my 6G cert and starting to look at pancake hoods for pipeline. Currently using a cheap Harbor Freight setup. What are the experienced pipeliners running?',
    author: 'fabricator_dan', url: 'https://reddit.com/r/welding/demo2',
    urgencyScore: 6, sentiment: 'neutral', urgent: false, actionNeeded: true,
    insight: 'High-engagement thread from a new pipeliner — helpful answer builds brand credibility with an early-career welder.',
    draftReply: "Congrats on the 6G! For pipeline work you'll want a proper pancake — the low-profile design is essential for tight spots. CMR's carbon fiber pancake hoods are popular with pipeline crews for the weight and durability. Happy to answer any specific questions.",
    createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
  },
  {
    id: 'd3', platform: 'hackernews', category: 'engage',
    entityName: 'custom welding hood',
    title: 'Ask HN: Anyone running a small manufacturing/fabrication business? What\'s your niche?',
    body: 'HN discussion about small-batch manufacturing businesses, custom fabrication, and finding niche industrial markets.',
    author: 'hn_user', url: 'https://news.ycombinator.com/item?id=demo3',
    urgencyScore: 7, sentiment: 'neutral', urgent: false, actionNeeded: true,
    insight: 'Influential audience discussing exactly your market segment — a specific answer gets upvotes and awareness.',
    draftReply: "We make custom carbon fiber welding hoods for pipeline welders — extremely niche but the buyers are passionate and margins are solid. The key was going direct to the welding subreddits and trade forums rather than trying to compete on Amazon.",
    createdAt: new Date(Date.now() - 3 * 3600000).toISOString(),
  },
  {
    id: 'd4', platform: 'reddit', subreddit: 'r/welding', category: 'competitor',
    entityName: 'Pipeliners Cloud',
    title: 'Pipeliners Cloud hood cracked on me after 6 months — anyone else?',
    body: 'Dropped my Pipeliners Cloud pancake hood from about 4 feet and the shell cracked clean through. Pretty disappointed for the price. Looking at alternatives.',
    author: 'shop_owner_tx', url: 'https://reddit.com/r/welding/demo4',
    urgencyScore: 8, sentiment: 'negative', urgent: true, actionNeeded: true,
    insight: 'Competitor quality complaint with active switcher intent — prime acquisition opportunity for CMR carbon fiber durability story.',
    draftReply: "Sorry to hear that — a cracked hood at that price point is frustrating. CMR's carbon fiber shells are built specifically for the abuse pipeline work dishes out. Happy to send you a comparison if you're evaluating alternatives.",
    createdAt: new Date(Date.now() - 90 * 60000).toISOString(),
  },
];
