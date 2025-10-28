# ForSale Real Estate Scraper

An Apify actor for scraping for-sale real estate listings from **domain.com.au**.

## Features

- 🏠 Scrapes real estate listings from domain.com.au
- 🔍 Two-stage scraping: searches by address, then extracts property details
- 📍 Accepts addresses as input (e.g., "59 whitsunday dr kirwan")
- 🔗 Also accepts direct property URLs
- 💰 Extracts price, bedrooms, bathrooms, parking, land size, property type, and more
- 🌐 Australian proxy support for reliable scraping
- 📊 Exports data in multiple formats (JSON, CSV, Excel)

## Input

The actor accepts the following input parameters:

- **addresses** - Array of property addresses to search for (e.g., "59 whitsunday dr kirwan")
- **startUrls** (optional) - Array of direct domain.com.au property URLs to scrape
- **maxRequestsPerCrawl** (optional) - Maximum number of pages to crawl (default: 100)
- **proxyConfiguration** (optional) - Proxy settings (Australian proxies recommended)

### Example Input

#### Using Addresses (Recommended):
```json
{
  "addresses": [
    "59 whitsunday dr kirwan",
    "123 main st sydney"
  ],
  "maxRequestsPerCrawl": 100,
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"],
    "apifyProxyCountry": "AU"
  }
}
```

#### Using Direct URLs:
```json
{
  "startUrls": [
    {
      "url": "https://www.domain.com.au/59-whitsunday-drive-kirwan-qld-4817-2020372212"
    }
  ],
  "maxRequestsPerCrawl": 100,
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"],
    "apifyProxyCountry": "AU"
  }
}
```

## Output

The actor stores results in a dataset. Each listing contains:

- `url` - Property URL
- `address` - Full property address
- `price` - Numeric price value
- `priceText` - Original price text
- `propertyType` - Type of property (house, apartment, etc.)
- `bedrooms` - Number of bedrooms
- `bathrooms` - Number of bathrooms
- `parkingSpaces` - Number of parking spaces
- `landSize` - Land size in square meters
- `buildingSize` - Building size in square meters
- `description` - Property description
- `features` - Array of property features
- `agent` - Agent name
- `agencyName` - Agency name
- `listingId` - Unique listing identifier
- `images` - Array of image URLs
- `scrapedAt` - Timestamp of when data was scraped

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

