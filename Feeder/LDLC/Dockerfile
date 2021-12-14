FROM node:17.2.0-alpine

LABEL maintainer="github.com/Sawangg"

# Install Python3 & build tools & tor
RUN apk add --update --no-cache curl py-pip make g++

# Install the feeder
WORKDIR /home/node/app
COPY package*.json ./
RUN npm ci
COPY . /home/node/app

# Build & run the feeder
RUN npm run build
CMD [ "npm", "start" ]
