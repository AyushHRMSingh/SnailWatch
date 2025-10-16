# Multi-stage build for Vite React app
# Stage 1: Build the application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Stage 2: Production server with Node.js (for API proxying)
FROM node:20-alpine AS production

WORKDIR /app

# Install serve to run the production build
RUN npm install -g serve

# Copy built assets from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Expose port 3000 for the application
# This port will be accessible to NGINX in another container
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the server
# Using serve with CORS enabled and SPA mode
CMD ["serve", "-s", "dist", "-l", "3000", "--no-clipboard"]
