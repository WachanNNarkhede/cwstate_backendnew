const axios = require('axios');
const cheerio = require('cheerio');
const proxyRotator = require('./proxyRotator');

class ClanStatsScraper {
  constructor(clanTag) {
    this.baseUrl = `https://cwstats.com/clan/${clanTag}/plus/daily-tracking`;
    this.clanTag = clanTag;
    this.maxRetries = 5;
  }

  cleanText(text) {
    if (!text) return '';
    return text.replace(/\.__m__[^ ]*\{[^}]*\}/g, '')
               .replace(/@media[^{]*\{[^}]*\}/g, '')
               .replace(/\s+/g, ' ')
               .trim();
  }

  getCleanText($element) {
    if (!$element || !$element.length) return '';
    
    let html = $element.html() || '';
    html = html.replace(/<style[^>]*>.*?<\/style>/gs, '');
    html = html.replace(/\s+class="[^"]*__m__[^"]*"/g, '');
    
    const clean$ = cheerio.load(html, { xmlMode: false });
    return clean$.text().trim();
  }

  async fetchWithProxy(url) {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        // Get random proxy and user agent
        const proxy = await proxyRotator.getRandomProxy();
        const userAgent = proxyRotator.getRandomUserAgent();
        const delay = proxyRotator.getRandomDelay();
        
        console.log(`📡 Attempt ${attempt}/${this.maxRetries} using ${proxy.type} proxy ${proxy.proxy}`);
        console.log(`⏱️  Waiting ${Math.round(delay/1000)}s before request...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));

        const response = await axios.get(url, {
          httpAgent: proxy.agent,
          httpsAgent: proxy.agent,
          headers: {
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1'
          },
          timeout: 30000,
          maxRedirects: 5,
          decompress: true
        });

        if (response.status === 200) {
          console.log(`✅ Success with proxy ${proxy.proxy}`);
          return response;
        }
        
      } catch (error) {
        console.log(`❌ Attempt ${attempt} failed:`, error.message);
        
        if (attempt === this.maxRetries) {
          throw new Error(`All proxy attempts failed: ${error.message}`);
        }
        
        // Exponential backoff between retries
        const backoff = Math.min(2000 * Math.pow(1.5, attempt), 15000);
        console.log(`⏳ Backing off for ${Math.round(backoff/1000)}s...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }
  }

  async fetchClanStats() {
    try {
      console.log(`🔍 Fetching data for clan: ${this.clanTag}`);
      
      const response = await this.fetchWithProxy(this.baseUrl);
      const html = response.data;
      const $ = cheerio.load(html);

      // Extract ALL week labels
      const allWeekLabels = [];
      
      $('table thead tr th').each((index, element) => {
        const textContent = this.getCleanText($(element));
        const weekMatch = textContent.match(/(\d{3}-\d{1,2})/);
        if (weekMatch) {
          allWeekLabels.push(weekMatch[1]);
        }
      });

      console.log(`📅 Found weeks: ${allWeekLabels.join(', ')}`);

      // Organize weeks by season
      const seasons = {};
      allWeekLabels.forEach(week => {
        const [season] = week.split('-');
        if (!seasons[season]) {
          seasons[season] = [];
        }
        seasons[season].push(week);
      });

      // Sort weeks within each season
      Object.keys(seasons).forEach(season => {
        seasons[season].sort((a, b) => {
          const weekA = parseInt(a.split('-')[1]);
          const weekB = parseInt(b.split('-')[1]);
          return weekA - weekB;
        });
      });

      // Extract player data
      const players = [];
      
      $('table tbody tr').each((rowIndex, row) => {
        const cells = $(row).find('td');
        if (cells.length < 4) return;

        const player = {
          rank: parseInt(this.getCleanText($(cells[0]))) || rowIndex + 1,
          name: '',
          playerId: '',
          avg8Weeks: null,
          avg4Weeks: null,
          weeklyScores: {}
        };

        // Extract player name and ID
        const nameCell = $(cells[1]);
        const nameLink = nameCell.find('a');
        if (nameLink.length) {
          player.name = this.getCleanText(nameLink);
          const href = nameLink.attr('href');
          player.playerId = href ? href.replace('/player/', '') : '';
        } else {
          player.name = this.getCleanText(nameCell);
        }

        // Extract averages
        const avg8Text = this.getCleanText($(cells[2]));
        player.avg8Weeks = avg8Text ? parseFloat(avg8Text) : null;

        const avg4Text = this.getCleanText($(cells[3]));
        player.avg4Weeks = avg4Text ? parseFloat(avg4Text) : null;

        // Extract weekly scores
        for (let i = 0; i < allWeekLabels.length; i++) {
          const cellIndex = 4 + i;
          if (cellIndex < cells.length) {
            const weekCell = $(cells[cellIndex]);
            const cellText = this.getCleanText(weekCell);
            
            if (cellText && cellText !== '') {
              const scoreMatch = cellText.match(/(\d+)/);
              const duelsMatch = cellText.match(/\((\d+)\)/);
              
              if (scoreMatch) {
                player.weeklyScores[allWeekLabels[i]] = {
                  score: parseInt(scoreMatch[1]),
                  duels: duelsMatch ? parseInt(duelsMatch[1]) : 0
                };
              }
            }
          }
        }

        players.push(player);
      });

      console.log(`👥 Found ${players.length} players`);

      return {
        clanTag: this.clanTag,
        allWeekLabels,
        seasons,
        players,
        lastUpdated: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Scraping error:', error.message);
      throw new Error(`Failed to fetch clan stats: ${error.message}`);
    }
  }
}

module.exports = ClanStatsScraper;