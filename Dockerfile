FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends imagemagick ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node index.html ./
COPY --chown=node:node server ./server
COPY --chown=node:node src ./src
COPY --chown=node:node assets ./assets
COPY --chown=node:node catalog ./catalog
COPY --chown=node:node examples ./examples
COPY --chown=node:node vendor ./vendor

USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server/index.js"]
