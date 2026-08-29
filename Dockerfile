FROM node:20-slim

ENV PRISMA_HIDE_UPDATE_MESSAGE=1
ENV PORT=8080

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
RUN npm run build

EXPOSE 8080

CMD ["npm", "start"]
