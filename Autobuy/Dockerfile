FROM node:17.2.0-alpine

LABEL maintainer="github.com/Sawangg"

# Install Python3 & build tools
RUN apk add --update --no-cache curl py-pip make g++

# Install chromium
RUN apk add --no-cache chromium --repository=http://dl-cdn.alpinelinux.org/alpine/v3.10/main

# Install the autobuy
WORKDIR /home/node/app
COPY package*.json ./
RUN npm ci
COPY . /home/node/app

# Expose the websocket
EXPOSE 3000

# Run the app
RUN npm run build
CMD [ "npm", "start" ]
