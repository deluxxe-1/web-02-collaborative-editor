# syntax=docker/dockerfile:1

# ---- Build stage -----------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json tsconfig.json ./
COPY apps/server/package.json apps/server/tsconfig.json ./apps/server/

RUN npm install

COPY apps/server/src ./apps/server/src
RUN npm run build -w @collab/server

# ---- Runtime stage ---------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/apps/server/dist ./apps/server/dist

# Least privilege: run as the unprivileged node user.
USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/server/dist/index.js"]
