import { Actor } from 'apify';
import { PlaywrightCrawler, Dataset } from 'apify';

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
 * Extracts property data from a realestate.com.au property page
 */
async function extractPropertyData(page, url, log) {
    try {
        // Wait for main content to load
        await page.waitForSelector('body', { timeout: 10000 });
        
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

        // Extract address
        try {
            data.address = await page.$eval('[data-testid="address"], h1.property-info-address, .property-info__street-address', 
                el => el.textContent.trim()).catch(() => null);
        } catch (e) {
            log.warning('Could not extract address');
        }

        // Extract price
        try {
            data.priceText = await page.$eval('[data-testid="price"], .property-info__price, .property-price', 
                el => el.textContent.trim()).catch(() => null);
            
            // Try to extract numeric price
            if (data.priceText) {
                const priceMatch = data.priceText.match(/\$([0-9,]+)/);
                if (priceMatch) {
                    data.price = parseInt(priceMatch[1].replace(/,/g, ''), 10);
                }
            }
        } catch (e) {
            log.warning('Could not extract price');
        }

        // Extract property features (bedrooms, bathrooms, parking)
        try {
            const features = await page.$$eval('[data-testid="property-features"] span, .property-info__features span, .property-features span', 
                elements => elements.map(el => el.textContent.trim()));
            
            features.forEach(feature => {
                const bedMatch = feature.match(/(\d+)\s*(bed|bedroom)/i);
                const bathMatch = feature.match(/(\d+)\s*(bath|bathroom)/i);
                const parkMatch = feature.match(/(\d+)\s*(car|parking|garage)/i);
                
                if (bedMatch) data.bedrooms = parseInt(bedMatch[1], 10);
                if (bathMatch) data.bathrooms = parseInt(bathMatch[1], 10);
                if (parkMatch) data.parkingSpaces = parseInt(parkMatch[1], 10);
            });
        } catch (e) {
            log.warning('Could not extract property features');
        }

        // Extract property type
        try {
            data.propertyType = await page.$eval('[data-testid="property-type"], .property-info__property-type', 
                el => el.textContent.trim()).catch(() => null);
        } catch (e) {
            // Property type not found
        }

        // Extract land and building size
        try {
            const sizeText = await page.evaluate(() => {
                const bodyText = document.body.innerText;
                return bodyText;
            });
            
            const landMatch = sizeText.match(/land.*?(\d+)\s*m[²2]/i);
            const buildMatch = sizeText.match(/building.*?(\d+)\s*m[²2]/i);
            
            if (landMatch) data.landSize = parseInt(landMatch[1], 10);
            if (buildMatch) data.buildingSize = parseInt(buildMatch[1], 10);
        } catch (e) {
            log.warning('Could not extract sizes');
        }

        // Extract description
        try {
            data.description = await page.$eval('[data-testid="description"], .property-description, [itemprop="description"]', 
                el => el.textContent.trim()).catch(() => null);
        } catch (e) {
            // Description not found
        }

        // Extract features list
        try {
            data.features = await page.$$eval('.property-features-list li, .features-list li, [data-testid="features"] li', 
                elements => elements.map(el => el.textContent.trim())).catch(() => []);
        } catch (e) {
            // Features not found
        }

        // Extract agent information
        try {
            data.agent = await page.$eval('.agent-name, [data-testid="agent-name"]', 
                el => el.textContent.trim()).catch(() => null);
            data.agencyName = await page.$eval('.agency-name, [data-testid="agency-name"]', 
                el => el.textContent.trim()).catch(() => null);
        } catch (e) {
            // Agent info not found
        }

        // Extract listing ID from URL or page
        const idMatch = url.match(/property\/([^\/]+)/);
        if (idMatch) {
            data.listingId = idMatch[1];
        }

        // Extract image URLs
        try {
            data.images = await page.$$eval('img[data-testid="property-image"], .property-images img, .gallery img', 
                elements => elements.map(img => img.src).filter(src => src && src.includes('http'))).catch(() => []);
        } catch (e) {
            log.warning('Could not extract images');
        }

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

    // Initialize the crawler
    const crawler = new PlaywrightCrawler({
        // Proxy configuration
        proxyConfiguration: await Actor.createProxyConfiguration(proxyConfiguration),
        
        // Maximum number of requests
        maxRequestsPerCrawl,

        // Request handler - this is where we extract data
        async requestHandler({ request, page, log }) {
            const { label } = request.userData;
            
            log.info(`Processing ${label}: ${request.url}`);

            // Wait for the page to load
            await page.waitForLoadState('domcontentloaded');
            
            // Give page extra time to render
            await page.waitForTimeout(2000);

            if (label === 'PROPERTY') {
                // Extract property data
                const data = await extractPropertyData(page, request.url, log);
                
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

