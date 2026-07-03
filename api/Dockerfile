FROM node:20-alpine

WORKDIR /app

# Copy root workspace configurations
COPY package.json package-lock.json tsconfig.json vitest.workspace.ts ./
COPY prisma ./prisma
COPY api ./api

# Install dependencies (workspaces will be resolved)
RUN npm install --legacy-peer-deps

# Build the database client
RUN npm run build -w prisma

# Build the api package
RUN npm run build -w api

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start", "-w", "api"]
