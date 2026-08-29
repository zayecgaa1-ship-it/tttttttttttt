FROM node:20-slim

# Install Arabic fonts
RUN apt-get update && apt-get install -y --no-install-recommends \
    fontconfig \
    fonts-dejavu-core \
    fonts-noto-core \
    fonts-noto-color-emoji \
    && fc-cache -f -v \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate --schema packages/db/prisma/schema.prisma

CMD ["sh", "-c", "npx prisma db push --schema packages/db/prisma/schema.prisma && (npm run dev:bot & npm run dev:api)"]
