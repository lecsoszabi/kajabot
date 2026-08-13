FROM node:20-slim

# Remote módban (FAMOUS_DATA_URL beállítva) a bot nem futtat Puppeteert/Chromiumot ezen a
# gépen, ezért a build alatt sem töltjük le a ~300 MB-os Chromium binárist.
ENV PUPPETEER_SKIP_DOWNLOAD=true

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

CMD ["node", "src/index.js"]
