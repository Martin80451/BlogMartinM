FROM node:20-alpine
ENV NODE_ENV=development
WORKDIR /usr/src/app
COPY ["package.json", "package-lock.json*", "npm-shrinkwrap.json*", "./"]
RUN apk add python3 py3-pip build-base
RUN npm install
RUN npm config get omit \
    && npm config get production \
    && npm config get package-lock
COPY . .
EXPOSE 3000
RUN chown -R node /usr/src/app
USER node
RUN echo "Running the test suite..."
CMD ["sh", "-c", "npm run test:export && npm start"]
