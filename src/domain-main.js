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
            // Parse address: "59 Whitsunday Drive, Kirwan QLD 4817"
            const parts = addressH1.split(',').map(p => p.trim());
            if (parts.length >= 2) {
                data.address = parts[0]; // "59 Whitsunday Drive"
                // Parse "Kirwan QLD 4817"
                const locationParts = parts[1].split(' ').filter(p => p);
                if (locationParts.length >= 3) {
                    data.suburb = locationParts[0]; // "Kirwan"
                    data.state = locationParts[1]; // "QLD"
                    data.postcode = locationParts[2]; // "4817"
                }
            }
        }

        // Extract features using data-testid
        const features = $('[data-testid="property-features-wrapper"]');
        
        // Bedrooms - look for text before "Beds"
        const bedsText = features.find('span:contains("Beds")').closest('[data-testid="property-features-feature"]').find('[data-testid="property-features-text-container"]').first().text().trim();
        if (bedsText) {
            const bedsMatch = bedsText.match(/(\d+)/);
            if (bedsMatch) data.bedrooms = parseInt(bedsMatch[1], 10);
        }

        // Bathrooms - look for text before "Baths"
        const bathsText = features.find('span:contains("Baths")').closest('[data-testid="property-features-feature"]').find('[data-testid="property-features-text-container"]').first().text().trim();
        if (bathsText) {
            const bathsMatch = bathsText.match(/(\d+)/);
            if (bathsMatch) data.bathrooms = parseInt(bathsMatch[1], 10);
        }

        // Parking - look for text before "Parking"
        const parkingText = features.find('span:contains("Parking")').closest('[data-testid="property-features-feature"]').find('[data-testid="property-features-text-container"]').first().text().trim();
        if (parkingText) {
            const parkingMatch = parkingText.match(/(\d+)/);
            if (parkingMatch) data.parkingSpaces = parseInt(parkingMatch[1], 10);
        }

        // Land size - look for text with m²
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

        // Extract images - try multiple methods
        const imageUrls = new Set(); // Use Set to avoid duplicates

        // Method 1: Look for gallery/carousel images
        $('img[src*="domain.com.au"], img[data-src*="domain.com.au"]').each((i, el) => {
            const src = $(el).attr('src') || $(el).attr('data-src');
            if (src && (src.includes('jpg') || src.includes('jpeg') || src.includes('png') || src.includes('webp'))) {
                // Get high-res version if possible
                const highResSrc = src.replace(/\/\d+x\d+/, '/2000x1500').replace(/-small|-medium/, '-large');
                imageUrls.add(highResSrc);
            }
        });

        // Method 2: Look in srcset attributes for high-res images
        $('img[srcset]').each((i, el) => {
            const srcset = $(el).attr('srcset');
            if (srcset && srcset.includes('domain.com.au')) {
                // Parse srcset and get the highest resolution
                const sources = srcset.split(',').map(s => s.trim().split(' '));
                sources.forEach(([url, size]) => {
                    if (url && (url.includes('jpg') || url.includes('jpeg') || url.includes('png') || url.includes('webp'))) {
                        imageUrls.add(url);
                    }
                });
            }
        });

        // Method 3: Look for picture elements
        $('picture source').each((i, el) => {
            const srcset = $(el).attr('srcset');
            if (srcset && srcset.includes('domain.com.au')) {
                const url = srcset.split(',')[0].split(' ')[0];
                if (url) imageUrls.add(url);
            }
        });

        // Method 4: Look in script tags for image data (common in SPAs)
        $('script').each((i, el) => {
            const scriptContent = $(el).html();
            if (scriptContent) {
                // Look for image URLs in JSON data
                const imageMatches = scriptContent.match(/https?:\/\/[^"'\s]+\.(?:jpg|jpeg|png|webp)[^"'\s]*/gi);
                if (imageMatches) {
                    imageMatches.forEach(url => {
                        if (url.includes('domain.com.au') && !url.includes('logo') && !url.includes('icon')) {
                            imageUrls.add(url);
                        }
                    });
                }
            }
        });

        // Method 5: Look for data attributes that might contain image info
        $('[data-images], [data-gallery], [data-photos]').each((i, el) => {
            const dataStr = $(el).attr('data-images') || $(el).attr('data-gallery') || $(el).attr('data-photos');
            if (dataStr) {
                try {
                    const imageData = JSON.parse(dataStr);
                    if (Array.isArray(imageData)) {
                        imageData.forEach(img => {
                            if (typeof img === 'string') imageUrls.add(img);
                            else if (img.url) imageUrls.add(img.url);
                            else if (img.src) imageUrls.add(img.src);
                        });
                    }
                } catch (e) {
                    // Not JSON, might be comma-separated URLs
                    const urls = dataStr.split(',').map(u => u.trim());
                    urls.forEach(url => {
                        if (url.startsWith('http')) imageUrls.add(url);
                    });
                }
            }
        });

        // Convert Set to Array and filter out thumbnails/small images
        data.images = Array.from(imageUrls).filter(url => {
            // Filter out very small images (likely icons/logos)
            return !url.includes('icon') && 
                   !url.includes('logo') && 
                   !url.includes('avatar') &&
                   !url.includes('40x40') &&
                   !url.includes('50x50');
        });

        data.imageCount = data.images.length;

        if (data.imageCount > 0) {
            log.info(`Found ${data.imageCount} images`);
        } else {
            log.warning('No images found - page structure may have changed');
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

    const crawler = new CheerioCrawler({
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

        async requestHandler({ request, $, log, crawler }) {
            const { label } = request.userData;
            
            log.info(`Processing ${label}: ${request.url}`);

            if (label === 'SEARCH') {
                // Extract property links from search results
                const propertyLinks = [];
                
                // Find all property listing links
                $('a.address[href*="/sale/"]').each((i, el) => {
                    const href = $(el).attr('href');
                    if (href && href.startsWith('https://www.domain.com.au/')) {
                        propertyLinks.push(href);
                    }
                });

                // Also try alternative selector
                $('a[href*="domain.com.au"][href*="-qld-"]').each((i, el) => {
                    const href = $(el).attr('href');
                    if (href && href.includes('domain.com.au') && !propertyLinks.includes(href)) {
                        if (!href.includes('/sale/') && href.match(/-\d+$/)) {
                            const fullUrl = href.startsWith('http') ? href : `https://www.domain.com.au${href}`;
                            propertyLinks.push(fullUrl);
                        }
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

