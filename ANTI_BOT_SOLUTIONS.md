# Anti-Bot Detection Solutions for realestate.com.au

The site has extremely aggressive anti-bot protection. Here are all your options:

## 🚨 Current Issue
Getting **429 (Too Many Requests)** even with:
- ✅ Australian residential proxies
- ✅ 10-20 second delays
- ✅ Realistic headers
- ✅ Session management
- ✅ got-scraping library

---

## 🎯 Solution Options

### **Option 1: Try Browser-Based Scraping (NEW)**

Browsers sometimes bypass checks that HTTP clients can't.

**How to use:**
1. Update `package.json` to add back `playwright`:
```json
"dependencies": {
  "apify": "^3.0.0",
  "crawlee": "^3.0.0",
  "cheerio": "^1.0.0-rc.12",
  "playwright": "^1.40.0"
}
```

2. Update `Dockerfile`:
```dockerfile
FROM apify/actor-node-playwright-chrome:20
```

3. Change `package.json` start script:
```json
"scripts": {
  "start": "node src/browser-main.js"
}
```

4. Use **15-30 second delays** between requests

**Pros:** Real browser, harder to detect  
**Cons:** Slower, more expensive, still might get blocked

---

### **Option 2: Manual HTML Collection**

Manually visit pages and save HTML, then parse offline.

**Steps:**
1. Visit property pages in your browser
2. Save page source (Ctrl+S or Right-click > Save As)
3. Upload HTML files to Apify dataset or storage
4. Run scraper on saved HTML files

**Code to parse saved HTML:**
```javascript
import cheerio from 'cheerio';
import fs from 'fs';

const html = fs.readFileSync('property.html', 'utf8');
const $ = cheerio.load(html);
const data = extractPropertyData($, url, console);
```

**Pros:** No blocking, unlimited scraping  
**Cons:** Manual work, not automated

---

### **Option 3: Much Slower Scraping (1-5 minutes between requests)**

Behave like an extremely slow human.

**Changes needed:**
```javascript
// In preNavigationHooks
const delay = Math.random() * 180000 + 60000; // 1-4 minutes
await new Promise(resolve => setTimeout(resolve, delay));
```

**Limits:**
- 10 properties = ~30 minutes
- 100 properties = ~5 hours

**Pros:** Might avoid rate limits  
**Cons:** VERY slow, expensive compute time

---

### **Option 4: External Scraping Service**

Use specialized services that handle anti-bot for you.

**Services to consider:**
1. **ScraperAPI** (scraperapi.com)
2. **Bright Data** (brightdata.com)
3. **Oxylabs** (oxylabs.io)
4. **ScrapingBee** (scrapingbee.com)

**Example with ScraperAPI:**
```javascript
const url = `http://api.scraperapi.com?api_key=YOUR_KEY&url=${encodeURIComponent(propertyUrl)}`;
const response = await fetch(url);
const html = await response.text();
```

**Pros:** They handle anti-bot  
**Cons:** Additional cost ($50-500/month)

---

###  **Option 5: Check for Official API**

Many real estate sites offer APIs or data feeds.

**To check:**
1. Visit: https://www.realestate.com.au/robots.txt
2. Look for API documentation
3. Contact realestate.com.au for data licensing
4. Check if they have RSS feeds

**Pros:** Legal, reliable, no blocking  
**Cons:** May require payment, limited data

---

### **Option 6: Scrape Search Results Only**

Instead of individual properties, scrape listing summaries.

**Strategy:**
- Target search results pages (less protected)
- Extract basic info from listings
- Skip individual property pages

**URL example:**
```
https://www.realestate.com.au/buy/in-kirwan,+qld+4817/list-1
```

**Pros:** Less detection risk  
**Cons:** Less detailed data

---

### **Option 7: Distributed Scraping**

Spread requests across multiple machines/IPs.

**Approach:**
1. Split property list into batches
2. Run separate Apify actors for each batch
3. Different proxies/delays for each
4. Combine results

**Pros:** Harder to detect pattern  
**Cons:** Complex setup, higher cost

---

### **Option 8: Session Cookie from Real Browser**

Establish session in real browser, export cookies, use in scraper.

**Steps:**
1. Visit realestate.com.au in Chrome
2. Browse a few listings manually
3. Export cookies (use extension like "EditThisCookie")
4. Import cookies into your scraper

**Code:**
```javascript
// In Playwright
const cookies = JSON.parse(fs.readFileSync('cookies.json'));
await context.addCookies(cookies);
```

**Pros:** Uses "trusted" session  
**Cons:** Cookies expire, manual process

---

### **Option 9: Headless Browser Farm**

Use services like Browserless, Puppeteer Cluster.

**Services:**
- Browserless.io
- Headless Chrome clusters
- Selenium Grid

**Pros:** Real browsers, scalable  
**Cons:** Complex setup, expensive

---

### **Option 10: Accept Limitations**

Acknowledge the blocking and work within limits.

**Strategy:**
- Scrape 5-10 properties per day
- Long delays (30+ minutes between)
- Only scrape new listings
- Run actor overnight

**Pros:** Eventually works, low risk  
**Cons:** Very slow

---

## 🔧 Immediate Next Steps

### Try This Order:

1. **Option 1 (Browser)** - I've created `src/browser-main.js` - try switching to it
2. **Option 4 (ScraperAPI)** - 1000 free requests to test
3. **Option 5 (Check for API)** - Might be the best long-term solution
4. **Option 2 (Manual HTML)** - Guaranteed to work for small batches

---

## 📝 My Recommendation

Given the aggressive blocking:

**For small-scale (< 100 properties):**
→ Use **Option 2 (Manual HTML)** or **Option 4 (ScraperAPI)**

**For medium-scale (100-1000 properties):**
→ Use **Option 4 (ScraperAPI)** or **Option 5 (Official API)**

**For large-scale (1000+ properties):**
→ **Must** use **Option 5 (Official API/Data Feed)** or accept very slow scraping

---

## 💡 Important Notes

1. **Legal Compliance:** Check realestate.com.au Terms of Service
2. **Rate Limiting:** Their 429 errors suggest rate limiting, not full blocking
3. **Data Licensing:** Consider if they offer paid data access
4. **Residential Proxies:** You're already using them, which is good
5. **Time of Day:** Try scraping during off-peak hours (2-6 AM Australian time)

---

## 🎯 What Worked for Other Sites

Similar sites that worked with:
- **Domain.com.au:** Playwright + 30s delays
- **Zillow:** ScraperAPI
- **Realtor.com:** Official API
- **Rightmove.co.uk:** Manual cookie injection

---

Need help implementing any of these? Let me know which option you'd like to try!

