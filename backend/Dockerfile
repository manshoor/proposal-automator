FROM node:20-alpine

# Install deps in /deps (survives host volume mount on /app)
WORKDIR /deps
COPY package*.json ./
RUN npm install

WORKDIR /app
COPY . .

EXPOSE 3000

# Symlink node_modules from /deps into /app at startup
# This way node_modules lives inside Docker only (in /deps)
# The symlink appears in /app but points to /deps/node_modules
ENTRYPOINT ["sh", "-c", "rm -rf /app/node_modules; ln -sf /deps/node_modules /app/node_modules; exec npx --prefix /deps nodemon --watch /app /app/server.js"]
