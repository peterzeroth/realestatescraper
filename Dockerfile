# Use Apify's Node.js base image with Playwright (Node 20)
FROM apify/actor-node-playwright-chrome:20

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install --include=dev

# Copy the rest of the application
COPY . ./

# Run the actor
CMD ["npm", "start"]

