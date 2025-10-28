# Real Estate Listing Scraper

An Apify actor for scraping real estate listings from various websites.

## Features

- 🏠 Scrapes real estate listings including price, address, bedrooms, bathrooms, etc.
- 🔄 Handles pagination automatically
- 🌐 Proxy support for reliable scraping
- 📊 Exports data in multiple formats (JSON, CSV, Excel)

## Input

The actor accepts the following input parameters:

- **startUrls** (required) - Array of URLs to start scraping from
- **maxRequestsPerCrawl** (optional) - Maximum number of pages to crawl (default: 100)
- **proxyConfiguration** (optional) - Proxy settings for the crawler

### Example Input

```json
{
  "startUrls": [
    {
      "url": "https://example.com/listings"
    }
  ],
  "maxRequestsPerCrawl": 100,
  "proxyConfiguration": {
    "useApifyProxy": true
  }
}
```

## Output

The actor stores results in a dataset. Each listing contains:

- `title` - Property title
- `price` - Listed price
- `address` - Property address
- `bedrooms` - Number of bedrooms
- `bathrooms` - Number of bathrooms
- `squareFeet` - Property size in square feet
- `url` - Link to the listing

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Run locally:
```bash
npm start
```

3. The actor will use the input from `.actor/INPUT.json` file when running locally.

## Deployment

1. Push your code to GitHub
2. Connect the repository to your Apify actor
3. Build and run on the Apify platform

## License

ISC

