FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile --filter joinme-bot
RUN cd joinme-bot && pnpm run build

CMD [ "node", "joinme-bot/dist/index.js", "-r"]