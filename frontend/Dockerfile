FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace configurations
COPY package.json package-lock.json tsconfig.json ./
COPY frontend ./frontend

# Install dependencies
RUN npm install --legacy-peer-deps

# Build the frontend package
RUN npm run build -w frontend

# Serve frontend using a simple static server
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/frontend/dist ./dist
RUN npm install -g serve
EXPOSE 5173
CMD ["serve", "-s", "dist", "-l", "5173"]
