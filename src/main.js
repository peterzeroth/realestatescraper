import { Actor } from 'apify';
import { CheerioCrawler, Dataset } from 'crawlee';

/**
 * Converts an address string to a realestate.com.au search URL format
 * @param {string} address - Property address (e.g., "59 whitsunday dr kirwan qld 4817")
 * @returns {string} - Formatted search URL
 */
function formatAddressForUrl(address) {
    // Clean and format the address for URL
    return address
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
}

/**
 * Extracts property data from a realestate.com.au property page using Cheerio
 */
function extractPropertyData($, url, log) {
    try {
        // Extract property details
        const data = {
            url: url,
            scrapedAt: new Date().toISOString(),
            address: null,
            price: null,
            priceText: null,
            propertyType: null,
            bedrooms: null,
            bathrooms: null,
            parkingSpaces: null,
            landSize: null,
            buildingSize: null,
            description: null,
            features: [],
            agent: null,
            agencyName: null,
            listingId: null,
            images: [],
        };

        // Extract address - try multiple selectors
        data.address = $('[data-testid="address"]').first().text().trim() ||
                      $('h1.property-info-address').first().text().trim() ||
                      $('.property-info__street-address').first().text().trim() ||
                      $('h1').first().text().trim() ||
                      null;

        // Extract price
        data.priceText = $('[data-testid="price"]').first().text().trim() ||
                        $('.property-info__price').first().text().trim() ||
                        $('.property-price').first().text().trim() ||
                        null;
        
        // Try to extract numeric price
        if (data.priceText) {
            const priceMatch = data.priceText.match(/\$([0-9,]+)/);
            if (priceMatch) {
                data.price = parseInt(priceMatch[1].replace(/,/g, ''), 10);
            }
        }

        // Extract property features (bedrooms, bathrooms, parking)
        const featureElements = $('[data-testid="property-features"] span, .property-info__features span, .property-features span, .property-features__feature');
        featureElements.each((i, el) => {
            const feature = $(el).text().trim();
            const bedMatch = feature.match(/(\d+)\s*(bed|bedroom)/i);
            const bathMatch = feature.match(/(\d+)\s*(bath|bathroom)/i);
            const parkMatch = feature.match(/(\d+)\s*(car|parking|garage)/i);
            
            if (bedMatch) data.bedrooms = parseInt(bedMatch[1], 10);
            if (bathMatch) data.bathrooms = parseInt(bathMatch[1], 10);
            if (parkMatch) data.parkingSpaces = parseInt(parkMatch[1], 10);
        });

        // Extract property type
        data.propertyType = $('[data-testid="property-type"]').first().text().trim() ||
                           $('.property-info__property-type').first().text().trim() ||
                           null;

        // Extract land and building size from page text
        const bodyText = $('body').text();
        const landMatch = bodyText.match(/land.*?(\d+)\s*m[²2]/i);
        const buildMatch = bodyText.match(/building.*?(\d+)\s*m[²2]/i);
        
        if (landMatch) data.landSize = parseInt(landMatch[1], 10);
        if (buildMatch) data.buildingSize = parseInt(buildMatch[1], 10);

        // Extract description
        data.description = $('[data-testid="description"]').first().text().trim() ||
                          $('.property-description').first().text().trim() ||
                          $('[itemprop="description"]').first().text().trim() ||
                          null;

        // Extract features list
        $('.property-features-list li, .features-list li, [data-testid="features"] li').each((i, el) => {
            const feature = $(el).text().trim();
            if (feature) {
                data.features.push(feature);
            }
        });

        // Extract agent information
        data.agent = $('.agent-name, [data-testid="agent-name"]').first().text().trim() || null;
        data.agencyName = $('.agency-name, [data-testid="agency-name"]').first().text().trim() || null;

        // Extract listing ID from URL
        const idMatch = url.match(/property\/([^\/\?]+)/);
        if (idMatch) {
            data.listingId = idMatch[1];
        }

        // Extract image URLs
        $('img[data-testid="property-image"], .property-images img, .gallery img').each((i, el) => {
            const src = $(el).attr('src');
            if (src && src.includes('http')) {
                data.images.push(src);
            }
        });

        return data;
    } catch (error) {
        log.error(`Error extracting data: ${error.message}`);
        return {
            url: url,
            scrapedAt: new Date().toISOString(),
            error: error.message
        };
    }
}

// Main actor entry point
await Actor.init();

try {
    // Get input from Apify platform
    const input = await Actor.getInput();
    
    const {
        addresses = [],
        startUrls = [],
        maxRequestsPerCrawl = 100,
        proxyConfiguration = { useApifyProxy: true }
    } = input || {};

    console.log('Actor input:', input);

    // Build request list from addresses and URLs
    const requests = [];
    
    // Add addresses as search URLs
    if (addresses && addresses.length > 0) {
        for (const address of addresses) {
            const formattedAddress = formatAddressForUrl(address);
            // Create search URL (we'll use the property URL format)
            // Note: In production, you might want to search first, then get property URLs
            const searchUrl = `https://www.realestate.com.au/property/${formattedAddress}`;
            requests.push({
                url: searchUrl,
                userData: { label: 'PROPERTY', originalAddress: address }
            });
            console.log(`Added address: ${address} -> ${searchUrl}`);
        }
    }
    
    // Add direct URLs
    if (startUrls && startUrls.length > 0) {
        for (const urlObj of startUrls) {
            requests.push({
                url: urlObj.url,
                userData: { label: 'PROPERTY' }
            });
            console.log(`Added URL: ${urlObj.url}`);
        }
    }

    if (requests.length === 0) {
        console.log('No addresses or URLs provided. Please provide at least one address or URL.');
        await Actor.exit();
    }

    // Initialize the crawler with CheerioCrawler (uses got-scraping for anti-bot detection)
    const crawler = new CheerioCrawler({
        // Proxy configuration
        proxyConfiguration: await Actor.createProxyConfiguration(proxyConfiguration),
        
        // Maximum number of requests
        maxRequestsPerCrawl,

        // Retry configuration
        maxRequestRetries: 5,
        requestHandlerTimeoutSecs: 60,
        
        // Use got-scraping with realistic headers (built into CheerioCrawler)
        useSessionPool: true,
        persistCookiesPerSession: true,
        
        // Additional request options for better stealth
        additionalMimeTypes: ['application/json', 'text/plain'],

        // Request handler - this is where we extract data
        async requestHandler({ request, $, body, log }) {
            const { label } = request.userData;
            
            log.info(`Processing ${label}: ${request.url}`);

            if (label === 'PROPERTY') {
                // Extract property data using Cheerio
                const data = extractPropertyData($, request.url, log);
                
                // Log extracted data
                log.info(`Extracted property: ${data.address || 'Unknown address'}`);
                
                // Save the data to dataset
                await Dataset.pushData(data);
            }
        },

        // Error handler
        async failedRequestHandler({ request, log }) {
            log.error(`Request ${request.url} failed multiple times`);
            
            // Save failed request information
            await Dataset.pushData({
                url: request.url,
                scrapedAt: new Date().toISOString(),
                error: 'Failed to scrape after multiple retries',
                originalAddress: request.userData.originalAddress
            });
        },
    });

    // Run the crawler with prepared requests
    await crawler.run(requests);

    console.log('Crawler finished.');

} catch (error) {
    console.error('Actor failed with error:', error);
    throw error;
} finally {
    await Actor.exit();
}

