# One image: the Talwacht game server plus the built client (same origin, so no server URL needs configuring).
# Burgwacht (the older game) still runs locally with `npm run start:bw`.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared shared
COPY server/package.json server/
COPY client client
COPY talwacht talwacht
RUN npm ci --include-workspace-root \
 && npm run build -w @talwacht/client

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
COPY talwacht/shared talwacht/shared
COPY talwacht/server talwacht/server
COPY talwacht/client/package.json talwacht/client/
# tsx (devDependency) runs the TypeScript server directly
RUN npm ci --workspace @talwacht/server --workspace @talwacht/shared --include-workspace-root --include=dev
COPY --from=build /app/talwacht/client/dist talwacht/client/dist
ENV PORT=8080
EXPOSE 8080
CMD ["npx", "tsx", "talwacht/server/src/net/server.ts"]
