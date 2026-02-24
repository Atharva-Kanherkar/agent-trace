FROM node:20-bullseye-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY pnpm-workspace.yaml ./
COPY tsconfig.base.json tsconfig.json ./
COPY scripts ./scripts
COPY packages ./packages
COPY migrations ./migrations

RUN npm ci --include=dev
RUN npm run --workspace @agent-trace/runtime build

EXPOSE 4717 8317 8318

CMD ["node", "packages/runtime/dist/src/cli.js"]
