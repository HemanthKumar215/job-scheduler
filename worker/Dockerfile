FROM node:20-slim

# Install openssl so Prisma can detect the correct engine target version
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root workspace configurations
COPY package.json package-lock.json tsconfig.json vitest.workspace.ts ./
COPY prisma ./prisma
COPY worker ./worker

# Install dependencies
RUN npm install --legacy-peer-deps

# Build the database client
RUN npm run build -w prisma

# Build the worker package
RUN npm run build -w worker

ENV NODE_ENV=production

CMD ["npm", "start", "-w", "worker"]
