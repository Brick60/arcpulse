require('dotenv').config();
const { getConfig } = require('./config');
const RedditScraper = require('./scrapers/reddit');

async function test() {
  const config = await getConfig();
  const scraper = new RedditScraper(config);
  console.log('Testing Reddit connection...');
  const results = await scraper.runFullScan(
    config.brands.length ? config.brands : ['welding hood'],
    config.competitors,
    ['pancake welding hood', 'pipeliner welding hood']
  );
  console.log(`\nFound ${results.length} results:`);
  results.slice(0, 5).forEach(r => {
    console.log(`\n[${r.platform}] ${r.subreddit || ''}`);
    console.log(`  ${r.title.substring(0, 80)}`);
    console.log(`  ${r.url}`);
  });
}

test().catch(console.error);
