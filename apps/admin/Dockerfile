# BCCRM Web Admin (Next.js) — multi-stage build
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/ui/package.json packages/ui/
COPY apps/admin/package.json apps/admin/
RUN pnpm install --frozen-lockfile || pnpm install

FROM deps AS build
COPY packages/ui ./packages/ui
COPY apps/admin ./apps/admin
COPY tsconfig.base.json ./
RUN pnpm --filter @bccrm/admin run build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app/apps/admin/.next ./apps/admin/.next
COPY --from=build /app/apps/admin/public ./apps/admin/public
COPY --from=build /app/apps/admin/package.json ./apps/admin/package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/admin/node_modules ./apps/admin/node_modules
EXPOSE 3000
CMD ["pnpm", "--filter", "@bccrm/admin", "run", "start"]
