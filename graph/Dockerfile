FROM mcr.microsoft.com/playwright

RUN mkdir /app
WORKDIR /app

COPY package.json package-lock.json ./
COPY playwright.config.ts ./

RUN npm ci

COPY src ./src
COPY tests ./tests

CMD ["npx", "playwright", "test"]