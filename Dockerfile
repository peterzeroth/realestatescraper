# Use Apify's Node.js image with Playwright and Chrome
FROM apify/actor-node-playwright-chrome:20

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install --include=dev --audit=false

# Copy the rest of the application
COPY . ./

# Run the actor
CMD ["npm", "start"]

