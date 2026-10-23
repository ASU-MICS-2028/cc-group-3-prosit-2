# syntax=docker/dockerfile:1
# --- build stage: install dev deps and compile TypeScript ---
FROM node:24-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# --- runtime stage: production deps + compiled output only ---
FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8000

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# RDS CA bundle for af-south-1, so the connection to Postgres verifies the server's certificate.
# Pinned by checksum so a tampered download fails the build. If AWS rotates the bundle the build fails too:
# re-run `curl -fsSL <url> | shasum -a 256` and update the hash.
ADD --chmod=644 --checksum=sha256:336dbbf461c56858cca5d6bc1f0abb389d9999bf8f2ded0cbb040d8675bb5d47 \
    https://truststore.pki.rds.amazonaws.com/af-south-1/af-south-1-bundle.pem /app/rds-ca.pem
ENV DB_CA_FILE=/app/rds-ca.pem

USER node

EXPOSE 8000

CMD ["node", "dist/server.js"]
