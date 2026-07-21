# ── build stage ── (better-sqlite3 네이티브 빌드 대응: slim + 빌드툴)
FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ── runtime stage ──
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4321
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# artifact/사용자/설정/세션 저장 (SQLite). k8s 에서는 PVC 마운트.
VOLUME ["/app/data"]
EXPOSE 4321
CMD ["node", "dist/main.js"]
