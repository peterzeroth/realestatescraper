# Real Estate Listing Scraper

An Apify actor for scraping real estate listings from **realestate.com.au**.

## Features

- 🏠 Scrapes real estate listings by property address
- 📍 Accepts addresses as input (e.g., "59 whitsunday dr kirwan qld 4817")
- 🔗 Also accepts direct property URLs
- 💰 Extracts price, bedrooms, bathrooms, parking, land size, and more
- 🌐 Proxy support for reliable scraping
- 📊 Exports data in multiple formats (JSON, CSV, Excel)

## Input

The actor accepts the following input parameters:

- **addresses** (optional) - Array of property addresses to scrape
- **startUrls** (optional) - Array of direct property URLs to scrape
- **maxRequestsPerCrawl** (optional) - Maximum number of pages to crawl (default: 100)
- **proxyConfiguration** (optional) - Proxy settings for the crawler

### Example Input

#### Using Addresses:
```json
{
  "addresses": [
    "59 whitsunday dr kirwan qld 4817",
    "123 main st sydney nsw 2000"
  ],
  "maxRequestsPerCrawl": 100,
  "proxyConfiguration": {
    "useApifyProxy": true
  }
}
```

#### Using Direct URLs:
```json
{
  "startUrls": [
    {
      "url": "https://www.realestate.com.au/property/59-whitsunday-dr-kirwan-qld-4817/?source=property-search-hp"
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

