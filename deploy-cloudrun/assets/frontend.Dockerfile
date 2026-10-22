# Build stage
FROM node:22-alpine AS builder

# --- PROJECT CONFIG: SSG prerendering -----------------------------------------
# Chromium is needed only for Puppeteer SSG prerendering (react-seo-ssg skill).
# If the project has no SSG: delete these 3 lines and use `npm run build` below.
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
# ------------------------------------------------------------------------------

WORKDIR /app
COPY package*.json ./
# npm ci reproduces the committed lockfile exactly. Do NOT use
# `npm install --legacy-peer-deps`: it skips peer dependencies (e.g.
# @testing-library/dom, a peer of @testing-library/react v16), which breaks
# the in-container `tsc` gate that typechecks test files even though the
# same build passes locally. If a project has no package-lock.json, commit
# one first (plain `npm install` locally) rather than weakening this line.
RUN npm ci
COPY . .

# With SSG: TypeScript compile + Vite build + Puppeteer prerender + sitemap
RUN npm run build:ssg
# Without SSG, use instead:  RUN npm run build

# Production stage
FROM nginx:stable-alpine

RUN apk add --no-cache dos2unix

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.sh
# The entrypoint is authored on Windows — strip CRLF or sh will fail on '\r'
RUN dos2unix /docker-entrypoint.sh 2>/dev/null || sed -i 's/\r$//' /docker-entrypoint.sh && \
    chmod +x /docker-entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/docker-entrypoint.sh"]
