import { Actor } from 'apify';
import { PlaywrightCrawler, Dataset } from 'crawlee';

/**
 * Extracts property data from page using browser context
 */
async function extractPropertyData(page, url, log) {
    try {
        // Wait for content to load
        await page.waitForTimeout(5000);

        const data = await page.evaluate(() => {
            const result = {
                url: window.location.href,
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
            };

            // Extract property status
            const statusEl = document.querySelector('.styles__Content-sc-1cced9e-1');
            if (statusEl) result.propertyStatus = statusEl.textContent.trim();

            // Extract address
            const addressEl = document.querySelector('h1.address-attributes__AddressTitle-sc-labpnz-2') || 
                             document.querySelector('h1');
            if (addressEl) result.address = addressEl.textContent.trim();

            // Extract suburb/state/postcode
            const locationEl = document.querySelector('.address-attributes__AddressAttributesContainer-sc-labpnz-0 p');
            if (locationEl) {
                const locationText = locationEl.textContent.trim();
                const locationParts = locationText.split(',').map(p => p.trim());
                if (locationParts.length >= 2) {
                    result.suburb = locationParts[0];
                    const statePostcode = locationParts[1].split(' ').filter(p => p);
                    if (statePostcode.length >= 2) {
                        result.state = statePostcode[0];
                        result.postcode = statePostcode[1];
                    }
                }
            }

            result.fullAddress = [result.address, result.suburb, result.state, result.postcode]
                .filter(Boolean).join(', ');

            // Extract price
            const priceEl = document.querySelector('[data-testid="displayPrice"]');
            if (priceEl) {
                result.priceText = priceEl.textContent.trim();
                const priceMatch = result.priceText.match(/\$([0-9,]+)/);
                if (priceMatch) {
                    result.price = parseInt(priceMatch[1].replace(/,/g, ''), 10);
                }
            }

            // Extract features
            const bedEl = document.querySelector('[data-testid="bed-sprite"]');
            if (bedEl) {
                const container = bedEl.closest('.address-attributes__PropertyDetail-sc-labpnz-3');
                const textEl = container?.querySelector('p');
                if (textEl) {
                    const beds = parseInt(textEl.textContent.trim(), 10);
                    if (!isNaN(beds)) result.bedrooms = beds;
                }
            }

            const bathEl = document.querySelector('[data-testid="bath-sprite"]');
            if (bathEl) {
                const container = bathEl.closest('.address-attributes__PropertyDetail-sc-labpnz-3');
                const textEl = container?.querySelector('p');
                if (textEl) {
                    const baths = parseInt(textEl.textContent.trim(), 10);
                    if (!isNaN(baths)) result.bathrooms = baths;
                }
            }

            const carEl = document.querySelector('[data-testid="car-sprite"]');
            if (carEl) {
                const container = carEl.closest('.address-attributes__PropertyDetail-sc-labpnz-3');
                const textEl = container?.querySelector('p');
                if (textEl) {
                    const parking = parseInt(textEl.textContent.trim(), 10);
                    if (!isNaN(parking)) result.parkingSpaces = parking;
                }
            }

            // Extract property type
            const typeEls = document.querySelectorAll('.address-attributes__PropertyDetail-sc-labpnz-3');
            typeEls.forEach(el => {
                const text = el.textContent.trim();
                if (text.includes('|')) {
                    const parts = text.split('|').map(p => p.trim());
                    if (parts.length > 1 && parts[1]) {
                        result.propertyType = parts[1];
                    }
                }
            });

            return result;
        });

        log.info(`Extracted: ${data.fullAddress || data.address}`);
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
        startUrls = [],
        maxRequestsPerCrawl = 100,
        proxyConfiguration = { useApifyProxy: true }
    } = input || {};

    console.log('Actor input (Browser mode):', input);

    if (!startUrls || startUrls.length === 0) {
        console.log('No URLs provided. Please provide startUrls.');
        await Actor.exit();
    }

    const crawler = new PlaywrightCrawler({
        proxyConfiguration: await Actor.createProxyConfiguration(proxyConfiguration),
        maxRequestsPerCrawl,
        maxRequestRetries: 2,
        requestHandlerTimeoutSecs: 180,
        maxConcurrency: 1,
        
        // Browser options
        launchContext: {
            launchOptions: {
                headless: true,
                args: [
                    '--disable-blink-features=AutomationControlled',
                    '--disable-features=IsolateOrigins,site-per-process',
                ],
            },
        },

        // Pre-navigation hooks
        preNavigationHooks: [
            async ({ page, request, log }) => {
                // Set realistic viewport
                await page.setViewportSize({ width: 1920, height: 1080 });
                
                // Set extra headers
                await page.setExtraHTTPHeaders({
                    'Accept-Language': 'en-AU,en;q=0.9',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                });

                // Mask automation
                await page.addInitScript(() => {
                    Object.defineProperty(navigator, 'webdriver', { get: () => false });
                    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
                    Object.defineProperty(navigator, 'languages', { get: () => ['en-AU', 'en'] });
                });

                // Long delay
                const delay = Math.random() * 15000 + 15000; // 15-30 seconds
                log.info(`Waiting ${Math.round(delay/1000)}s before loading page...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            },
        ],

        async requestHandler({ request, page, log }) {
            log.info(`Processing: ${request.url}`);

            // Check for blocking
            const title = await page.title();
            const bodyText = await page.evaluate(() => document.body.textContent.toLowerCase());
            
            if (title.toLowerCase().includes('403') || 
                title.toLowerCase().includes('access denied') ||
                bodyText.includes('unusual traffic')) {
                log.warning('Blocking detected!');
                throw new Error('Blocked by anti-bot protection');
            }

            const data = await extractPropertyData(page, request.url, log);
            await Dataset.pushData(data);
        },

        async failedRequestHandler({ request, log }) {
            log.error(`Request ${request.url} failed`);
            await Dataset.pushData({
                url: request.url,
                scrapedAt: new Date().toISOString(),
                error: 'Failed after retries'
            });
        },
    });

    await crawler.run(startUrls);
    console.log('Crawler finished.');

} catch (error) {
    console.error('Actor failed:', error);
    throw error;
} finally {
    await Actor.exit();
}

