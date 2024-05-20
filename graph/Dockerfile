FROM mcr.microsoft.com/playwright

RUN mkdir /app
WORKDIR /app

COPY package.json package-lock.json ./
COPY playwright.config.ts ./
COPY tsconfig.json ./

RUN npm ci

COPY src ./src
COPY graph.config.ts ./

CMD ["npm", "start"]