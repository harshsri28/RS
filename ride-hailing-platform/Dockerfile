# Dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --production

# Copy source
COPY src/ ./src/
COPY migrations/ ./migrations/

# Environment variables defaults
ENV SERVER_PORT=8080
ENV SERVER_HOST=0.0.0.0

EXPOSE 8080

CMD ["node", "src/cmd/api.js"]
