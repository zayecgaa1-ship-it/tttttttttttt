FROM node:20-slim

# Install Prisma runtime requirements and Arabic fonts
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    fontconfig \
    fonts-dejavu-core \
    fonts-noto-core \
    fonts-noto-color-emoji \
    && fc-cache -f -v \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
COPY packages/db/prisma ./packages/db/prisma
RUN npm ci
COPY . .

CMD ["npm", "start"]
