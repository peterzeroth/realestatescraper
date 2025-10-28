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
            suburb: null,
            state: null,
            postcode: null,
            fullAddress: null,
            propertyStatus: null,
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

        // Extract property status (e.g., "For sale")
        data.propertyStatus = $('.property-status__PropertyMarketStatus-sc-1wfl5ce-0 .styles__Content-sc-1cced9e-1').first().text().trim() ||
                             null;

        // Extract street address from h1
        const streetAddress = $('h1.address-attributes__AddressTitle-sc-labpnz-2').first().text().trim() ||
                             $('h1').first().text().trim();
        data.address = streetAddress;

        // Extract suburb/state/postcode (they're in a separate p tag)
        const locationText = $('.address-attributes__AddressAttributesContainer-sc-labpnz-0 p').first().text().trim();
        if (locationText) {
            // Parse "Kirwan, QLD 4817" format
            const locationParts = locationText.split(',').map(p => p.trim());
            if (locationParts.length >= 2) {
                data.suburb = locationParts[0];
                // Parse "QLD 4817" part
                const statePostcode = locationParts[1].split(' ').filter(p => p);
                if (statePostcode.length >= 2) {
                    data.state = statePostcode[0];
                    data.postcode = statePostcode[1];
                }
            }
        }

        // Build full address
        data.fullAddress = [data.address, data.suburb, data.state, data.postcode].filter(Boolean).join(', ');

        // Extract price using data-testid
        data.priceText = $('[data-testid="displayPrice"]').first().text().trim() ||
                        $('.promote-price__DisplayPrice-sc-1c9e926-3').first().text().trim() ||
                        null;
        
        // Try to extract numeric price
        if (data.priceText) {
            const priceMatch = data.priceText.match(/\$([0-9,]+)/);
            if (priceMatch) {
                data.price = parseInt(priceMatch[1].replace(/,/g, ''), 10);
            }
        }

        // Extract property features using the sprite icons
        // Bedrooms - look for bed-sprite
        const bedroomsEl = $('[data-testid="bed-sprite"]').closest('.address-attributes__PropertyDetail-sc-labpnz-3').find('p').first();
        if (bedroomsEl.length) {
            const beds = parseInt(bedroomsEl.text().trim(), 10);
            if (!isNaN(beds)) data.bedrooms = beds;
        }

        // Bathrooms - look for bath-sprite
        const bathroomsEl = $('[data-testid="bath-sprite"]').closest('.address-attributes__PropertyDetail-sc-labpnz-3').find('p').first();
        if (bathroomsEl.length) {
            const baths = parseInt(bathroomsEl.text().trim(), 10);
            if (!isNaN(baths)) data.bathrooms = baths;
        }

        // Parking - look for car-sprite
        const parkingEl = $('[data-testid="car-sprite"]').closest('.address-attributes__PropertyDetail-sc-labpnz-3').find('p').first();
        if (parkingEl.length) {
            const parking = parseInt(parkingEl.text().trim(), 10);
            if (!isNaN(parking)) data.parkingSpaces = parking;
        }

        // Property type - it's the text after the delimiter "|"
        const propertyTypeContainer = $('.address-attributes__AttributesContainer-sc-labpnz-1');
        propertyTypeContainer.find('.address-attributes__PropertyDetail-sc-labpnz-3').each((i, el) => {
            const text = $(el).text().trim();
            // Look for the element that has "|" and get the next text
            if (text.includes('|')) {
                const parts = text.split('|').map(p => p.trim());
                if (parts.length > 1 && parts[1]) {
                    data.propertyType = parts[1];
                }
            }
        });
        
        // If not found, try alternative selector
        if (!data.propertyType) {
            const typeText = $('.address-attributes__PropertyDetail-sc-labpnz-3:has(.address-attributes__Delim-sc-labpnz-5)').find('p').last().text().trim();
            if (typeText && typeText !== '|') {
                data.propertyType = typeText;
            }
        }

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
    
    // First, add homepage request to warm up the session
    requests.push({
        url: 'https://www.realestate.com.au/',
        userData: { label: 'HOMEPAGE' }
    });
    console.log('Added homepage for session warming');
    
    // Add addresses as search URLs
    if (addresses && addresses.length > 0) {
        for (const address of addresses) {
            const formattedAddress = formatAddressForUrl(address);
            // Create search URL (we'll use the property URL format)
            // Note: In production, you might want to search first, then get property URLs
            const searchUrl = `https://www.realestate.com.au/property/${formattedAddress}`;
            requests.push({
                url: searchUrl,
                userData: { label: 'PROPERTY', originalAddress: address },
                headers: {
                    'Referer': 'https://www.realestate.com.au/',
                }
            });
            console.log(`Added address: ${address} -> ${searchUrl}`);
        }
    }
    
    // Add direct URLs
    if (startUrls && startUrls.length > 0) {
        for (const urlObj of startUrls) {
            requests.push({
                url: urlObj.url,
                userData: { label: 'PROPERTY' },
                headers: {
                    'Referer': 'https://www.realestate.com.au/',
                }
            });
            console.log(`Added URL: ${urlObj.url}`);
        }
    }

    if (requests.length === 1) {
        // Only homepage, no properties to scrape
        console.log('No addresses or URLs provided. Please provide at least one address or URL.');
        await Actor.exit();
    }

    // Adjust maxRequestsPerCrawl to account for homepage warming request
    const adjustedMaxRequests = maxRequestsPerCrawl + 1;

    // Initialize the crawler with CheerioCrawler (uses got-scraping for anti-bot detection)
    const crawler = new CheerioCrawler({
        // Proxy configuration
        proxyConfiguration: await Actor.createProxyConfiguration(proxyConfiguration),
        
        // Maximum number of requests (adjusted for homepage warming)
        maxRequestsPerCrawl: adjustedMaxRequests,

        // Retry configuration with delays
        maxRequestRetries: 3,
        requestHandlerTimeoutSecs: 90,
        maxConcurrency: 1, // Process one request at a time
        minConcurrency: 1,
        
        // Use got-scraping with realistic headers (built into CheerioCrawler)
        useSessionPool: true,
        persistCookiesPerSession: true,
        sessionPoolOptions: {
            maxPoolSize: 1, // Use single session for consistency
            sessionOptions: {
                maxUsageCount: 50,
            },
        },
        
        // Additional request options for better stealth
        additionalMimeTypes: ['application/json', 'text/plain'],
        
        // Custom request options
        preNavigationHooks: [
            async ({ request, session, crawler }, gotoOptions) => {
                // Add delays between requests
                await new Promise(resolve => setTimeout(resolve, Math.random() * 5000 + 3000)); // 3-8 seconds
            },
        ],

        // Request handler - this is where we extract data
        async requestHandler({ request, $, body, log, session, crawler }) {
            const { label } = request.userData;
            
            log.info(`Processing ${label}: ${request.url}`);

            // Check if we got blocked
            const pageText = $('body').text();
            if (pageText.includes('Access Denied') || pageText.includes('blocked') || $('title').text().includes('403')) {
                log.warning('Possible blocking detected, marking session as bad');
                session.retire();
                throw new Error('Blocked by anti-bot protection');
            }

            if (label === 'HOMEPAGE') {
                // Just warming up the session, log and continue
                log.info('Successfully visited homepage, session warmed up');
                // Mark session as working
                session.markGood();
            } else if (label === 'PROPERTY') {
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

