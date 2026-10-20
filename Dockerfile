FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /usr/src/app
COPY ["package.json", "package-lock.json*", "npm-shrinkwrap.json*", "./"]
RUN apk add python3 py3-pip build-base
RUN npm install --include=dev
RUN echo "Checking package manifest:" \
    && npm pkg get devDependencies.jest devDependencies.jest-junit \
    && echo "Checking installed packages:" \
    && npm ls jest jest-junit \
    && echo "Checking Jest executable:" \
    && ls -l node_modules/.bin/jest
COPY . .
EXPOSE 3000
RUN chown -R node /usr/src/app
USER node
RUN echo "Running the test suite..."
CMD ["sh", "-c", "npm run test:export && npm start"]
