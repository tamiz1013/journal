FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Install dependencies first so this layer is cached between code changes
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js db.js ./
COPY public ./public
COPY scripts ./scripts

# Run as the unprivileged user that ships with the node image
USER node

EXPOSE 3000
CMD ["node", "server.js"]
