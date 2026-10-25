# One image: the game server plus the built client (same origin, so no server URL needs configuring)
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared shared
COPY server/package.json server/
COPY client client
RUN npm ci --workspace client --workspace shared --include-workspace-root \
 && npm run build -w client

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
# tsx (devDependency) runs the TypeScript server directly
RUN npm ci --workspace server --workspace shared --include-workspace-root --include=dev
COPY shared shared
COPY server server
COPY tsconfig.base.json ./
COPY --from=build /app/client/dist client/dist
ENV PORT=8080
EXPOSE 8080
CMD ["npx", "tsx", "server/src/net/server.ts"]
