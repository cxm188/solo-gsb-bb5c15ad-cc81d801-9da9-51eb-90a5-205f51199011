# ---------- 阶段 1：构建前端 ----------
FROM node:20-alpine AS web-build
WORKDIR /app/web
COPY web/package*.json ./
RUN npm install --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ---------- 阶段 2：构建后端 ----------
FROM node:20-alpine AS server-build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install --no-audit --no-fund
COPY server/ ./
RUN npm run build

# ---------- 阶段 3：运行时（仅生产依赖 + 构建产物） ----------
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev --no-audit --no-fund

COPY --from=server-build /app/server/dist ./server/dist
COPY --from=web-build /app/web/dist ./web/dist

ENV PORT=3000
EXPOSE 3000
CMD ["node", "server/dist/index.js"]
