# syntax=docker/dockerfile:1

# ContextBridge runs as one long-lived Node process: Express serves the API and
# the built React client from the same origin, and node:sqlite keeps its data in
# a single file. That file must live on a persistent volume (see render.yaml).

FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js docker-entrypoint.sh ./
COPY src ./src
COPY --from=build /app/dist ./dist

# A snapshot of a real workspace (twentyhq/twenty) so a host without a disk
# still shows a usable project on every boot. See docker-entrypoint.sh.
COPY seed ./seed

# Default SQLite location inside the image. Override CONTEXTBRIDGE_DB to point at
# a mounted volume so handovers survive restarts and redeploys.
RUN mkdir -p /app/data && chmod +x /app/docker-entrypoint.sh
VOLUME ["/app/data"]

EXPOSE 3000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
