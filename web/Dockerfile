FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
EXPOSE 3000
USER node
CMD ["node", "src/server.js"]
