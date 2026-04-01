FROM node:20-alpine

WORKDIR /deps
COPY package*.json ./
RUN npm install

WORKDIR /app
COPY . .

EXPOSE 3000

CMD sh -c "rm -rf /app/node_modules && cp -r /deps/node_modules /app/node_modules && npm run dev"
