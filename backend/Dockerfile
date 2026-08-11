FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install
COPY prisma ./prisma
COPY --from=build /app/dist ./dist
RUN npx prisma generate
EXPOSE 3000
CMD ["node", "dist/index.js"]
