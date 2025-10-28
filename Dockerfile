# Use Apify's Node.js image with Puppeteer and Chrome
FROM apify/actor-node-puppeteer-chrome:20

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install --include=dev --audit=false

# Copy the rest of the application
COPY . ./

# Run the actor
CMD ["npm", "start"]

