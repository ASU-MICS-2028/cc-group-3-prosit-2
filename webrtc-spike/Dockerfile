# syntax=docker/dockerfile:1
# The call page (built by Vite into dist/) and the signaling server, in one container on one port.
# `npm start` runs the server through tsx, so dev dependencies stay in the image: fine for a Lab 7 spike.
FROM node:25-alpine

WORKDIR /app

COPY package*.json .npmrc ./
RUN npm ci && npm cache clean --force

COPY tsconfig*.json vite.config.ts index.html ./
COPY src ./src
RUN npm run build

ENV PORT=3000
USER node
EXPOSE 3000

CMD ["npm", "start"]
