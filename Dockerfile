FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json server.ts ./
RUN npm run build

FROM node:26-alpine
RUN echo 'precedence ::ffff:0:0/96 100' >> /etc/gai.conf
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY public ./public
EXPOSE 3000
CMD ["node", "--dns-result-order=ipv4first", "dist/server.js"]
