FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
# --legacy-peer-deps used to be required because recharts was pinned at 2.1.9, which does not declare
# React 18 peer support. recharts is ^2.12.7 now and a plain install resolves cleanly, so the flag is
# gone — it was suppressing every peer warning, including ones worth reading.
#
# `npm ci` would be stricter and more reproducible, and is the better choice once you have confirmed
# it passes locally (`cd frontend && npm ci`). It fails the build outright if package.json and
# package-lock.json disagree, which is a feature for releases and a nuisance mid-development.
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
