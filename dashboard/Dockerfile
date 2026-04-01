FROM node:20-alpine

WORKDIR /deps
COPY package*.json ./
RUN npm install

WORKDIR /app
COPY . .

EXPOSE 3000

CMD sh -c "if [ ! -f /app/node_modules/.package-lock.json ]; then cp -r /deps/node_modules /app/; fi && npm run dev"
