# Use Apify's base Node.js image (lighter, no browser needed)
FROM apify/actor-node:20

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install --include=dev --audit=false

# Copy the rest of the application
COPY . ./

# Run the actor
CMD ["npm", "start"]

