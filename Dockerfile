# Packaging (item 29): run Tavern Screen without installing Node on the host.
# Build:  docker build -t tavern-screen .
# Run:    docker run --rm -p 3000:3000 -p 3443:3443 -v tavern-data:/app/data -v tavern-uploads:/app/uploads tavern-screen
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p data uploads && chown -R node:node /app
USER node
EXPOSE 3000 3443
CMD ["node", "server.js"]
