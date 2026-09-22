FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1
ENV NODE_ENV=production
WORKDIR /app
COPY egress/cloudflare/runtime/package.json egress/cloudflare/runtime/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY egress/gateway.mjs egress/limits.mjs ./egress/
COPY egress/cloudflare/container.mjs ./egress/cloudflare/container.mjs
USER node
EXPOSE 8080
CMD ["node", "egress/cloudflare/container.mjs"]
