FROM node:16-alpine as build-stage
ARG DOPPLER_TOKEN
WORKDIR /app
COPY install_build_env.sh ./
RUN chmod +x install_build_env.sh && /bin/sh install_build_env.sh
RUN echo $DOPPLER_TOKEN | doppler configure set token
COPY pnpm-lock.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --frozen-lockfile --offline
RUN pnpm run build

FROM node:16-alpine as production-stage
WORKDIR /app
COPY --from=build-stage /app/dist ./dist
COPY --from=build-stage /app/node_modules ./node_modules
COPY --from=build-stage /app/package.json ./package.json
COPY --from=build-stage /app/.env ./.env
CMD ["node", "dist/index.js"]