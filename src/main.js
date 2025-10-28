import { Actor } from 'apify';
import { PlaywrightCrawler, Dataset } from 'apify';

// Main actor entry point
await Actor.init();

try {
    // Get input from Apify platform
    const input = await Actor.getInput();
    
    const {
        startUrls = [],
        maxRequestsPerCrawl = 100,
        proxyConfiguration = { useApifyProxy: true }
    } = input || {};

    console.log('Actor input:', input);

    // Initialize the crawler
    const crawler = new PlaywrightCrawler({
        // Proxy configuration
        proxyConfiguration: await Actor.createProxyConfiguration(proxyConfiguration),
        
        // Maximum number of requests
        maxRequestsPerCrawl,

        // Request handler - this is where we'll extract data
        async requestHandler({ request, page, enqueueLinks, log }) {
            log.info(`Processing: ${request.url}`);

            // Wait for the page to load
            await page.waitForLoadState('networkidle');

            // TODO: Add your scraping logic here
            // This is a placeholder structure for real estate data
            const data = {
                url: request.url,
                scrapedAt: new Date().toISOString(),
                // Add more fields based on the target website
            };

            // Save the data to dataset
            await Dataset.pushData(data);

            // TODO: Add logic to enqueue additional pages
            // await enqueueLinks({
            //     selector: 'a.listing-link',
            //     label: 'LISTING',
            // });
        },

        // Error handler
        async failedRequestHandler({ request, log }) {
            log.error(`Request ${request.url} failed multiple times`);
        },
    });

    // Run the crawler with start URLs
    await crawler.run(startUrls);

    console.log('Crawler finished.');

} catch (error) {
    console.error('Actor failed with error:', error);
    throw error;
} finally {
    await Actor.exit();
}

