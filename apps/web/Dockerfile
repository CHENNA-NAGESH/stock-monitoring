FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages packages
COPY apps apps
RUN npm ci
RUN npm run build -w @atrium/web

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
