FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server.ts ./
COPY server/ ./server/

# Run as non-root user for security
USER node
EXPOSE 3001
CMD ["node", "--import=tsx", "server.ts"]
