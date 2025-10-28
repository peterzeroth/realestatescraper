import { Actor } from 'apify';
import { CheerioCrawler, Dataset } from 'crawlee';

/**
 * Extracts property data from domain.com.au property page
 */
function extractPropertyData($, url, log) {
    try {
        const data = {
            url: url,
            scrapedAt: new Date().toISOString(),
            address: null,
            suburb: null,
            state: null,
            postcode: null,
            fullAddress: null,
            price: null,
            priceText: null,
            propertyType: null,
            bedrooms: null,
            bathrooms: null,
            parkingSpaces: null,
            landSize: null,
            buildingSize: null,
            listingId: null,
            images: [],
            imageCount: 0,
        };

        // Extract price
        data.priceText = $('[data-testid="listing-details__summary-title"] span').first().text().trim() ||
                        $('.css-twgrok span').first().text().trim() ||
                        null;
        
        if (data.priceText) {
            const priceMatch = data.priceText.match(/\$([0-9,]+)/);
            if (priceMatch) {
                data.price = parseInt(priceMatch[1].replace(/,/g, ''), 10);
            }
        }

        // Extract full address from h1
        const addressH1 = $('[data-testid="listing-details__button-copy-wrapper"] h1').first().text().trim() ||
                         $('.css-hkh81z').first().text().trim();
        
        if (addressH1) {
            data.fullAddress = addressH1;
            const parts = addressH1.split(',').map(p => p.trim());
            if (parts.length >= 2) {
                data.address = parts[0];
                const locationParts = parts[1].split(' ').filter(p => p);
                if (locationParts.length >= 3) {
                    data.suburb = locationParts[0];
                    data.state = locationParts[1];
                    data.postcode = locationParts[2];
                }
            }
        }

        // Extract features
        const features = $('[data-testid="property-features-wrapper"]');
        
        // Bedrooms
        const bedsText = features.find('span:contains("Beds")').closest('[data-testid="property-features-feature"]').find('[data-testid="property-features-text-container"]').first().text().trim();
        if (bedsText) {
            const bedsMatch = bedsText.match(/(\d+)/);
            if (bedsMatch) data.bedrooms = parseInt(bedsMatch[1], 10);
        }

        // Bathrooms
        const bathsText = features.find('span:contains("Baths")').closest('[data-testid="property-features-feature"]').find('[data-testid="property-features-text-container"]').first().text().trim();
        if (bathsText) {
            const bathsMatch = bathsText.match(/(\d+)/);
            if (bathsMatch) data.bathrooms = parseInt(bathsMatch[1], 10);
        }

        // Parking
        const parkingText = features.find('span:contains("Parking")').closest('[data-testid="property-features-feature"]').find('[data-testid="property-features-text-container"]').first().text().trim();
        if (parkingText) {
            const parkingMatch = parkingText.match(/(\d+)/);
            if (parkingMatch) data.parkingSpaces = parseInt(parkingMatch[1], 10);
        }

        // Land size
        features.find('[data-testid="property-features-text-container"]').each((i, el) => {
            const text = $(el).text().trim();
            if (text.includes('m²')) {
                const sizeMatch = text.match(/(\d+)m²/);
                if (sizeMatch) {
                    data.landSize = parseInt(sizeMatch[1], 10);
                }
            }
        });

        // Property type
        data.propertyType = $('[data-testid="listing-summary-property-type"] span').first().text().trim() ||
                           $('.css-1efi8gv').first().text().trim() ||
                           null;

        // Extract listing ID from URL
        const idMatch = url.match(/-(\d+)$/);
        if (idMatch) {
            data.listingId = idMatch[1];
        }

        // Extract images from the HTML (they're already loaded in photo thumbnails)
        const imageUrls = new Set();
        
        // Look for images with domainstatic.com.au (property photos)
        $('img[src*="domainstatic.com.au"]').each((i, el) => {
            let src = $(el).attr('src');
            if (src && !src.includes('data:image') && !src.includes('logo') && !src.includes('icon')) {
                // Remove thumbnail parameters: /fit-in/144x106/filters:format(webp):quality(85):no_upscale()/
                // Keep only the actual image filename with dimensions
                src = src.replace(/\/fit-in\/\d+x\d+\/filters:[^/]+\//, '/');
                
                // Only add if it looks like a property image (has listing ID pattern)
                if (src.match(/\d{10}_\d+_\d+_\d+_\d+-w\d+/)) {
                    imageUrls.add(src);
                }
            }
        });

        data.images = Array.from(imageUrls);
        data.imageCount = data.images.length;
        
        log.info(`Found ${data.imageCount} property images`);

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

await Actor.init();

try {
    const input = await Actor.getInput();
    const {
        addresses = [],
        startUrls = [],
        maxRequestsPerCrawl = 100,
        proxyConfiguration = { useApifyProxy: true }
    } = input || {};

    console.log('Actor input (domain.com.au scraper):', input);

    const requests = [];

    // Add addresses as domain.com.au search URLs
    if (addresses && addresses.length > 0) {
        for (const address of addresses) {
            // Format: "59 whitsunday dr kirwan" -> URL encoded
            const searchQuery = encodeURIComponent(address);
            const searchUrl = `https://www.domain.com.au/sale/?excludeunderoffer=1&street=${searchQuery}`;
            requests.push({
                url: searchUrl,
                userData: { label: 'SEARCH', originalAddress: address }
            });
            console.log(`Added search URL: ${searchUrl}`);
        }
        
        // Warn if maxRequestsPerCrawl is too low
        const minRequired = addresses.length * 2; // Each address = search page + property page(s)
        if (maxRequestsPerCrawl < minRequired) {
            console.log(`WARNING: maxRequestsPerCrawl (${maxRequestsPerCrawl}) may be too low for ${addresses.length} addresses.`);
            console.log(`Recommended: At least ${minRequired} (each address needs: 1 search + 1+ properties)`);
        }
    }

    // Add direct property URLs
    if (startUrls && startUrls.length > 0) {
        for (const urlObj of startUrls) {
            requests.push({
                url: urlObj.url,
                userData: { label: 'PROPERTY' }
            });
            console.log(`Added property URL: ${urlObj.url}`);
        }
    }

    if (requests.length === 0) {
        console.log('No addresses or URLs provided.');
        await Actor.exit();
    }

    const crawler = new CheerioCrawler({
        proxyConfiguration: await Actor.createProxyConfiguration(proxyConfiguration),
        maxRequestsPerCrawl,
        maxRequestRetries: 3,
        requestHandlerTimeoutSecs: 90,
        maxConcurrency: 1,
        
        useSessionPool: true,
        persistCookiesPerSession: true,

        async requestHandler({ request, $, log, crawler }) {
            const { label } = request.userData;
            
            log.info(`Processing ${label}: ${request.url}`);

            if (label === 'SEARCH') {
                // Extract property links from search results
                const propertyLinks = [];
                
                $('a.address').each((i, el) => {
                    const href = $(el).attr('href');
                    if (href && href.includes('domain.com.au') && href.match(/-\d+$/)) {
                        const fullUrl = href.startsWith('http') ? href : `https://www.domain.com.au${href}`;
                        propertyLinks.push(fullUrl);
                    }
                });

                log.info(`Found ${propertyLinks.length} property links on search page`);

                // Enqueue each property page
                for (const link of propertyLinks) {
                    await crawler.addRequests([{
                        url: link,
                        userData: { label: 'PROPERTY', fromSearch: true }
                    }]);
                    log.info(`Enqueued: ${link}`);
                }

                if (propertyLinks.length === 0) {
                    log.warning('No property links found on search page. Page structure may have changed.');
                }

            } else if (label === 'PROPERTY') {
                // Extract property data
                const data = extractPropertyData($, request.url, log);
                
                log.info(`Extracted: ${data.fullAddress || 'Unknown address'}`);
                log.info(`Price: ${data.priceText}, Beds: ${data.bedrooms}, Baths: ${data.bathrooms}, Parking: ${data.parkingSpaces}`);
                log.info(`Images: ${data.imageCount} found`);
                
                await Dataset.pushData(data);
            }
        },

        async failedRequestHandler({ request, log }) {
            log.error(`Request ${request.url} failed`);
            await Dataset.pushData({
                url: request.url,
                scrapedAt: new Date().toISOString(),
                error: 'Failed after retries',
                originalAddress: request.userData.originalAddress
            });
        },
    });

    await crawler.run(requests);
    console.log('Crawler finished.');

} catch (error) {
    console.error('Actor failed:', error);
    throw error;
} finally {
    await Actor.exit();
}

