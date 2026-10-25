FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages packages
COPY apps apps
RUN npm ci
RUN npm run build -w @atrium/api

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8081
COPY package.json package-lock.json ./
COPY packages/config/package.json packages/config/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/infra/package.json apps/infra/package.json
RUN npm ci --omit=dev --workspace=@atrium/api --include-workspace-root
COPY --from=build /app/apps/api/dist/index.cjs apps/api/dist/index.cjs
USER node
EXPOSE 8081
CMD ["node", "apps/api/dist/index.cjs"]
