# Use Node.js Alpine for a small image size
FROM node:18-alpine

RUN apk add --no-cache postgresql-client

# Create and set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json first
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy the rest of your backend code
COPY . .

# Expose the port your app runs on (Cloud Run uses 8080 by default, but we'll read from env)
ENV PORT=8080
EXPOSE 8080

# Start your server
CMD [ "node", "src/server.js" ]