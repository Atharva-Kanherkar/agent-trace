FROM node:20-bullseye-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY pnpm-workspace.yaml ./
COPY tsconfig.base.json tsconfig.json ./
COPY scripts ./scripts
COPY packages ./packages

RUN npm ci --include=dev
RUN npm run --workspace @agent-trace/dashboard build:web

EXPOSE 3100

CMD ["npm", "run", "--workspace", "@agent-trace/dashboard", "start:web", "--", "--hostname", "0.0.0.0", "--port", "3100"]
