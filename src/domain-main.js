import { Actor } from 'apify';
import { PlaywrightCrawler, Dataset } from 'crawlee';

/**
 * Extracts property data from domain.com.au property page using Playwright
 */
async function extractPropertyData(page, url, log) {
    try {
        // Extract data using page.evaluate to run in browser context
        const data = await page.evaluate(() => {
            const result = {
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
            const priceEl = document.querySelector('[data-testid="listing-details__summary-title"] span');
            result.priceText = priceEl ? priceEl.textContent.trim() : null;
            
            if (result.priceText) {
                const priceMatch = result.priceText.match(/\$([0-9,]+)/);
                if (priceMatch) {
                    result.price = parseInt(priceMatch[1].replace(/,/g, ''), 10);
                }
            }

            // Extract full address from h1
            const addressH1El = document.querySelector('[data-testid="listing-details__button-copy-wrapper"] h1');
            const addressH1 = addressH1El ? addressH1El.textContent.trim() : null;
            
            if (addressH1) {
                result.fullAddress = addressH1;
                const parts = addressH1.split(',').map(p => p.trim());
                if (parts.length >= 2) {
                    result.address = parts[0];
                    const locationParts = parts[1].split(' ').filter(p => p);
                    if (locationParts.length >= 3) {
                        result.suburb = locationParts[0];
                        result.state = locationParts[1];
                        result.postcode = locationParts[2];
                    }
                }
            }

            // Extract features
            const featureEls = document.querySelectorAll('[data-testid="property-features-feature"]');
            featureEls.forEach(el => {
                const text = el.textContent.trim();
                const bedMatch = text.match(/(\d+)\s*Bed/i);
                const bathMatch = text.match(/(\d+)\s*Bath/i);
                const parkMatch = text.match(/(\d+)\s*Parking/i);
                const landMatch = text.match(/(\d+)m²/);
                
                if (bedMatch) result.bedrooms = parseInt(bedMatch[1], 10);
                if (bathMatch) result.bathrooms = parseInt(bathMatch[1], 10);
                if (parkMatch) result.parkingSpaces = parseInt(parkMatch[1], 10);
                if (landMatch) result.landSize = parseInt(landMatch[1], 10);
            });

            // Property type
            const typeEl = document.querySelector('[data-testid="listing-summary-property-type"] span');
            result.propertyType = typeEl ? typeEl.textContent.trim() : null;

            return result;
        });

        // Add URL and listing ID
        data.url = url;
        data.scrapedAt = new Date().toISOString();
        const idMatch = url.match(/-(\d+)$/);
        if (idMatch) {
            data.listingId = idMatch[1];
        }

        // Now extract images by clicking the Photos button
        log.info('Attempting to open photo viewer...');
        
        try {
            // Click the Launch Photos button
            const photosButton = await page.$('button[aria-label="Launch Photos"]');
            if (photosButton) {
                await photosButton.click();
                log.info('Clicked Launch Photos button');
                
                // Wait for image viewer to appear
                await page.waitForSelector('.css-dk278u', { timeout: 5000 });
                await page.waitForTimeout(1000); // Give images time to load
                
                // Extract all images from the viewer
                data.images = await page.evaluate(() => {
                    const imageUrls = [];
                    const imgElements = document.querySelectorAll('.css-dk278u img[src*="domainstatic.com.au"]');
                    
                    imgElements.forEach(img => {
                        let src = img.src;
                        if (src && !src.includes('data:image')) {
                            // Remove thumbnail size and filters to get high-res
                            // Example: /fit-in/144x106/filters:format(webp):quality(85):no_upscale()/ -> remove it
                            src = src.replace(/\/fit-in\/\d+x\d+\/filters:[^/]+\//, '/');
                            
                            // Extract the original filename which contains dimensions
                            // The URL ends with something like: 2020372212_7_1_251025_104419-w3000-h2000
                            imageUrls.push(src);
                        }
                    });
                    
                    return imageUrls;
                });
                
                data.imageCount = data.images.length;
                log.info(`Found ${data.imageCount} images in photo viewer`);
            } else {
                log.warning('Photos button not found');
                data.images = [];
                data.imageCount = 0;
            }
        } catch (error) {
            log.warning(`Could not open photo viewer: ${error.message}`);
            data.images = [];
            data.imageCount = 0;
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

    const crawler = new PlaywrightCrawler({
        proxyConfiguration: await Actor.createProxyConfiguration(proxyConfiguration),
        maxRequestsPerCrawl,
        maxRequestRetries: 3,
        requestHandlerTimeoutSecs: 90,
        maxConcurrency: 1,
        
        useSessionPool: true,
        persistCookiesPerSession: true,
        
        // Lighter delays for domain.com.au (less aggressive blocking)
        preNavigationHooks: [
            async ({ request, log }) => {
                const delay = Math.random() * 3000 + 2000; // 2-5 seconds
                log.info(`Waiting ${Math.round(delay/1000)}s before request...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            },
        ],

        async requestHandler({ request, page, log, crawler }) {
            const { label } = request.userData;
            
            log.info(`Processing ${label}: ${request.url}`);

            if (label === 'SEARCH') {
                // Wait for page to load
                await page.waitForLoadState('domcontentloaded');
                
                // Extract property links from search results
                const propertyLinks = await page.evaluate(() => {
                    const links = [];
                    document.querySelectorAll('a.address').forEach(a => {
                        const href = a.href;
                        if (href && href.includes('domain.com.au') && href.match(/-\d+$/)) {
                            links.push(href);
                        }
                    });
                    return links;
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
                // Wait for page to load
                await page.waitForLoadState('domcontentloaded');
                await page.waitForTimeout(2000); // Let page fully render
                
                // Extract property data
                const data = await extractPropertyData(page, request.url, log);
                
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

