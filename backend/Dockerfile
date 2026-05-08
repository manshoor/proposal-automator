# ============================================
# Stage 1: Install ALL dependencies (for dev)
# ============================================
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm install

# ============================================
# Stage 2: Install PRODUCTION dependencies only
# ============================================
FROM node:20-alpine AS production-deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# ============================================
# Stage 3: Development target
# ============================================
FROM node:20-alpine AS dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p uploads
ENV NODE_ENV=development
EXPOSE 3000
COPY docker-entrypoint.dev.sh /docker-entrypoint.dev.sh
RUN chmod +x /docker-entrypoint.dev.sh
ENTRYPOINT ["/docker-entrypoint.dev.sh"]
# tsx watch handles both .js and .ts; replaces nodemon for dev. Restarts on file
# changes (including .ts files), zero build step.
CMD ["npx", "tsx", "watch", "server.js"]

# ============================================
# Stage 4: Production target
# ============================================
FROM node:20-alpine AS production
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S express -u 1001

# Copy production deps and source
COPY --from=production-deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p uploads && chown -R express:nodejs uploads

ENV NODE_ENV=production
USER express
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Production also runs via tsx so .ts source files load without a build step.
# tsx uses esbuild internally — startup is fast and runtime overhead is minimal.
CMD ["npx", "tsx", "server.js"]
