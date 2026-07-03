# ---------- build stage ----------
# Compiles the frontend and the native better-sqlite3 addon for this arch
# (the deploy script builds this on the Pi, so it targets ARM natively).
FROM node:20-bookworm-slim AS build
WORKDIR /app

# build tools needed to compile better-sqlite3 if no prebuild is available
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build          # frontend -> dist/
RUN npm prune --omit=dev   # drop devDeps, keep express + better-sqlite3

# ---------- runtime stage ----------
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=80

# runtime artifacts only
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY server ./server
COPY lista.txt ./lista.txt
COPY package.json ./package.json

# DB lives here; mount a volume at /app/data to persist across stop/rm
RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s \
  CMD node -e "fetch('http://localhost:'+ (process.env.PORT||80) +'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
