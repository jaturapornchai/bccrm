# BCCRM API — multi-stage build (ทำงานจาก root ของ monorepo)
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/database/package.json packages/database/
COPY packages/queue-engine/package.json packages/queue-engine/
COPY packages/line-sdk/package.json packages/line-sdk/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile || pnpm install

FROM deps AS build
COPY packages ./packages
COPY apps/api ./apps/api
COPY tsconfig.base.json ./
RUN pnpm --filter @bccrm/database run generate \
  && pnpm --filter @bccrm/api run build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/packages ./packages
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
