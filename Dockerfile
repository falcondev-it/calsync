FROM node:16-alpine as build-stage

WORKDIR /app

COPY install_build_env.sh ./

RUN chmod +x install_build_env.sh && /bin/sh install_build_env.sh

COPY pnpm-lock.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --frozen-lockfile --offline
RUN pnpm run build

# -----------------------------
FROM node:16-alpine as production-stage

WORKDIR /app

RUN wget -q -t3 'https://packages.doppler.com/public/cli/rsa.8004D9FF50437357.key' -O /etc/apk/keys/cli@doppler-8004D9FF50437357.rsa.pub && \
  echo 'https://packages.doppler.com/public/cli/alpine/any-version/main' | tee -a /etc/apk/repositories && \
  apk add doppler

COPY --from=build-stage /app/dist ./dist
COPY --from=build-stage /app/node_modules ./node_modules
COPY --from=build-stage /app/package.json ./package.json

CMD ["doppler", "run", "--", "node", "dist/index.js"]