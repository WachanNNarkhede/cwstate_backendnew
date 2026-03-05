const axios = require('axios');
const HttpsProxyAgent = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

class ProxyRotator {
  constructor() {
    // ProxRipper GitHub raw URLs - updated every 15 minutes
    this.proxySources = {
      http: 'https://raw.githubusercontent.com/Mohammedcha/ProxRipper/main/full_proxies/http.txt',
      https: 'https://raw.githubusercontent.com/Mohammedcha/ProxRipper/main/full_proxies/https.txt',
      socks4: 'https://raw.githubusercontent.com/Mohammedcha/ProxRipper/main/full_proxies/socks4.txt',
      socks5: 'https://raw.githubusercontent.com/Mohammedcha/ProxRipper/main/full_proxies/socks5.txt'
    };
    
    this.proxyPool = {
      http: [],
      https: [],
      socks4: [],
      socks5: []
    };
    
    this.lastFetch = null;
    this.fetchInterval = 30 * 60 * 1000; // 30 minutes
    
    // Modern user agents for rotation
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0 Safari/537.36'
    ];
  }

  // Fetch fresh proxies from ProxRipper
  async fetchFreshProxies() {
    try {
      console.log('🔄 Fetching fresh proxies from ProxRipper...');
      
      for (const [type, url] of Object.entries(this.proxySources)) {
        try {
          const response = await axios.get(url, { 
            timeout: 10000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          
          const proxies = response.data
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && line.includes(':'));
          
          // Validate basic format
          this.proxyPool[type] = proxies.filter(proxy => {
            const [host, port] = proxy.split(':');
            return host && port && !isNaN(parseInt(port)) && parseInt(port) > 0 && parseInt(port) < 65536;
          });
          
          console.log(`📦 Loaded ${this.proxyPool[type].length} ${type.toUpperCase()} proxies`);
        } catch (error) {
          console.error(`❌ Failed to fetch ${type} proxies:`, error.message);
          this.proxyPool[type] = [];
        }
      }
      
      this.lastFetch = new Date();
      
      const total = Object.values(this.proxyPool).reduce((sum, arr) => sum + arr.length, 0);
      console.log(`✅ Total proxies available: ${total}`);
      
    } catch (error) {
      console.error('❌ Proxy fetch failed:', error.message);
    }
  }

  // Create appropriate agent based on proxy type
  createAgent(proxyString, type) {
    const [host, port] = proxyString.split(':');
    
    switch(type) {
      case 'http':
        return new HttpsProxyAgent(`http://${host}:${port}`);
      case 'https':
        return new HttpsProxyAgent(`https://${host}:${port}`);
      case 'socks4':
        return new SocksProxyAgent(`socks4://${host}:${port}`);
      case 'socks5':
        return new SocksProxyAgent(`socks5://${host}:${port}`);
      default:
        return new HttpsProxyAgent(`http://${host}:${port}`);
    }
  }

  // Test if proxy works
  async testProxy(agent) {
    try {
      const response = await axios.get('http://httpbin.org/ip', {
        httpAgent: agent,
        httpsAgent: agent,
        timeout: 5000
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  // Get a random working proxy
  async getRandomProxy() {
    // Refresh if needed
    if (!this.lastFetch || (Date.now() - this.lastFetch) > this.fetchInterval) {
      await this.fetchFreshProxies();
    }

    // Priority order: https, http, socks5, socks4
    const priorityTypes = ['https', 'http', 'socks5', 'socks4'];
    
    for (const type of priorityTypes) {
      const proxies = this.proxyPool[type];
      if (proxies && proxies.length > 0) {
        // Try up to 10 random proxies from this type
        for (let attempt = 0; attempt < 10; attempt++) {
          const randomIndex = Math.floor(Math.random() * proxies.length);
          const proxyString = proxies[randomIndex];
          
          try {
            const agent = this.createAgent(proxyString, type);
            const works = await this.testProxy(agent);
            
            if (works) {
              return {
                proxy: proxyString,
                type: type,
                agent: agent
              };
            } else {
              // Remove dead proxy
              proxies.splice(randomIndex, 1);
            }
          } catch {
            // Remove dead proxy
            proxies.splice(randomIndex, 1);
          }
        }
      }
    }
    
    throw new Error('No working proxies found after trying all types');
  }

  // Get random user agent
  getRandomUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  // Get random delay between requests (2-8 seconds)
  getRandomDelay() {
    return Math.floor(Math.random() * 6000) + 2000; // 2000-8000ms
  }
}

module.exports = new ProxyRotator();