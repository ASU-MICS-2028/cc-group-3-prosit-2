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
ADD --chmod=644 https://truststore.pki.rds.amazonaws.com/af-south-1/af-south-1-bundle.pem /app/rds-ca.pem
ENV DB_CA_FILE=/app/rds-ca.pem

USER node

EXPOSE 8000

CMD ["node", "dist/server.js"]
