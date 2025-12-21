FROM oven/bun:1.2-slim
WORKDIR /app
COPY bun.lock package.json ./
RUN bun install --production
COPY . .
ENV PORT=8080
EXPOSE 8080
CMD ["bun", "run", "server.ts"]
