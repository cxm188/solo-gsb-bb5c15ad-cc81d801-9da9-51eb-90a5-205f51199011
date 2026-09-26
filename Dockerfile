# ---- 1) 构建 React + TypeScript 前端（依赖安装在镜像构建时自动完成） ----
FROM node:20-alpine AS client-build
WORKDIR /build/client
COPY client/package.json client/package-lock.json* ./
# 有 lock 文件用 npm ci，否则退回 npm install
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY client/ ./
RUN npm run build

# ---- 2) 安装 Node.js 服务端依赖 ----
FROM node:20-alpine AS server-deps
WORKDIR /build/server
COPY server/package.json server/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# ---- 3) 运行镜像：启动即包含全部依赖与前端产物 ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# 以非 root 用户运行
RUN addgroup -S app && adduser -S app -G app

COPY --from=server-deps /build/server/node_modules ./server/node_modules
COPY server/package.json ./server/package.json
COPY server/src ./server/src
COPY --from=client-build /build/client/dist ./client/dist

USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/src/index.js"]
