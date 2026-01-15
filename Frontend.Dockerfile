FROM nginx:alpine

# Static frontend served by Nginx
WORKDIR /usr/share/nginx/html

# Copy the frontend files
COPY index.html ./
COPY script.js ./
COPY style.css ./
COPY periodic_defense_functions.js ./
COPY GAME_RULES.md ./
COPY README.md ./

# Reverse proxy /api/* to the backend service named "api" in docker-compose
COPY nginx.conf /etc/nginx/conf.d/default.conf
