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

COPY server.js ./
COPY src ./src
COPY --from=build /app/dist ./dist

# Default SQLite location inside the image. Override CONTEXTBRIDGE_DB to point at
# a mounted volume so handovers survive restarts and redeploys.
RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 3000
CMD ["node", "server.js"]
