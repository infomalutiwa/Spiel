# Game server for Cloud Run (the client is served by Firebase Hosting)
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
# tsx (devDependency) runs the TypeScript server directly; the client workspace is only needed to satisfy the lockfile
RUN npm ci --workspace server --workspace shared --include-workspace-root --include=dev
COPY shared shared
COPY server server
COPY tsconfig.base.json ./
ENV PORT=8080
EXPOSE 8080
CMD ["npx", "tsx", "server/src/net/server.ts"]
