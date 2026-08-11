FROM node:24-bookworm-slim AS builder

RUN npm install --global pnpm@11.16.0

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

ENV NODE_OPTIONS=--max-old-space-size=1536
RUN pnpm build

FROM node:24-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    NODE_OPTIONS=--max-old-space-size=512

COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/scripts/cleanup-expired-walks.mjs ./scripts/cleanup-expired-walks.mjs

USER node

EXPOSE 3000

CMD ["node", "node_modules/vinext/dist/cli.js", "start", "--port", "3000"]
