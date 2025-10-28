import { Actor } from 'apify';
import { PuppeteerCrawler, Dataset } from 'crawlee';

/**
 * Extracts property data from domain.com.au property page using Puppeteer
 */
async function extractPropertyData(page, url, log) {
    try {
        // Extract basic property data using page.evaluate
        const data = await page.evaluate((url) => {
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
        }, url);

        // Add listing ID from URL
        const idMatch = url.match(/-(\d+)$/);
        if (idMatch) {
            data.listingId = idMatch[1];
        }

        log.info(`Extracted basic data: ${data.fullAddress || 'Unknown address'}`);

        // Now click the Photos button to open the image viewer
        log.info('Clicking Launch Photos button...');
        
        try {
            const photosButton = await page.$('button[aria-label="Launch Photos"]');
            if (photosButton) {
                await photosButton.click();
                log.info('Clicked Launch Photos button');
                
                // Wait for the image viewer carousel to appear
                await page.waitForSelector('[data-testid="pswp-thumbnails-carousel"] .css-dk278u', { timeout: 10000 });
                await page.waitForTimeout(2000); // Give images time to load
                
                // Extract all image URLs from the thumbnail carousel
                data.images = await page.evaluate(() => {
                    const imageUrls = [];
                    const thumbnailImages = document.querySelectorAll('[data-testid="pswp-thumbnails-carousel"] .css-dk278u img[src*="domainstatic.com.au"]');
                    
                    thumbnailImages.forEach(img => {
                        let src = img.src;
                        if (src && !src.includes('data:image')) {
                            // Remove thumbnail size and filters to get high-res URL
                            // Example: /fit-in/144x106/filters:format(webp):quality(85):no_upscale()/ -> remove
                            src = src.replace(/\/fit-in\/\d+x\d+\/filters:[^/]+\//, '/');
                            imageUrls.push(src);
                        }
                    });
                    
                    return [...new Set(imageUrls)]; // Remove duplicates
                });
                
                data.imageCount = data.images.length;
                log.info(`Found ${data.imageCount} images in photo viewer`);
            } else {
                log.warning('Photos button not found');
            }
        } catch (error) {
            log.warning(`Could not open photo viewer: ${error.message}`);
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

    const crawler = new PuppeteerCrawler({
        proxyConfiguration: await Actor.createProxyConfiguration(proxyConfiguration),
        maxRequestsPerCrawl,
        maxRequestRetries: 3,
        requestHandlerTimeoutSecs: 120,
        maxConcurrency: 1,
        
        launchContext: {
            launchOptions: {
                headless: true,
                args: [
                    '--disable-blink-features=AutomationControlled',
                    '--disable-features=site-per-process',
                    '--disable-http2',  // Disable HTTP/2 to avoid protocol errors
                ],
            },
        },
        
        // Configure browser pool
        browserPoolOptions: {
            useFingerprints: false,
        },
        
        useSessionPool: true,
        persistCookiesPerSession: true,

        async requestHandler({ request, page, log, crawler }) {
            const { label } = request.userData;
            
            log.info(`Processing ${label}: ${request.url}`);

            if (label === 'SEARCH') {
                log.info('Loading search page...');
                
                // Wait for property links to load
                await page.waitForSelector('a.address', { timeout: 30000 });
                log.info('Search page loaded successfully');
                
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
                log.info('Loading property page...');
                
                // Wait for the main property info to load
                await page.waitForSelector('[data-testid="listing-details__summary-title"]', { timeout: 30000 });
                log.info('Property page loaded successfully');
                
                // Extract property data (including images from viewer)
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

