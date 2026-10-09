FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY src ./src
COPY contracts ./contracts
COPY scripts/build.js ./scripts/build.js
COPY x402-guard.cjs README.md LICENSE glama.json server.json GLAMA.md ./
RUN npm run build
USER node
ENTRYPOINT ["node", "src/index.js"]
