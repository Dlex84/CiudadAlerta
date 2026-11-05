# Imagen única: compila el frontend y lo sirve desde la API.
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production FRONTEND_DIST=/app/public UPLOADS_DIR=/data/uploads PORT=3000
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY backend/ ./
COPY --from=web /web/dist ./public
RUN mkdir -p /data/uploads && chown -R node:node /data /app
USER node
EXPOSE 3000
# Aplica migraciones, siembra roles (y el primer admin si hay SEED_*) y arranca.
CMD ["sh", "-c", "node src/db/cli.js setup && node src/server.js"]
