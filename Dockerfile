FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y openssl ca-certificates --no-install-recommends && rm -rf /var/lib/apt/lists/*
WORKDIR /app
FROM base AS build
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
FROM base AS runner
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/scripts/bootstrap-admin.mjs ./scripts/bootstrap-admin.mjs
USER node
EXPOSE 3000
CMD ["node","server.js"]