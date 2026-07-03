FROM node:20-alpine

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
