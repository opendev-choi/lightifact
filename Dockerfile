# ── build stage ──
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ── runtime stage ──
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4321
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# artifact/사용자/설정 저장 위치 (k8s에서는 PVC를 여기에 마운트)
VOLUME ["/app/data"]
EXPOSE 4321
CMD ["node", "dist/main.js"]
