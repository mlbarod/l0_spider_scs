ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS application-build

WORKDIR /opt/l0-spider

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html components.json jsconfig.json postcss.config.mjs vite.config.mjs ./
COPY public ./public
COPY src ./src
COPY docs/user-manual/USER_MANUAL.md ./docs/user-manual/USER_MANUAL.md
COPY docs/user-manual/images ./docs/user-manual/images
COPY server ./server
COPY scripts ./scripts
COPY config ./config
COPY server.mjs ./

RUN node scripts/validate_sensor_exclusions_runtime.mjs config/sensor-exclusions.json \
  && npm run build \
  && npm prune --omit=dev \
  && node scripts/validate_sensor_exclusions_runtime.mjs config/sensor-exclusions.json \
  && npm cache clean --force

FROM ${NODE_IMAGE} AS python-dependencies

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv \
  && rm -rf /var/lib/apt/lists/*

COPY scripts/requirements.txt /tmp/l0-spider-requirements.txt
RUN python3 -m venv /opt/l0-spider-venv \
  && /opt/l0-spider-venv/bin/pip install --disable-pip-version-check --no-cache-dir \
    -r /tmp/l0-spider-requirements.txt \
  && /opt/l0-spider-venv/bin/python -c "import pymysql"

FROM ${NODE_IMAGE} AS runtime

ENV NODE_ENV=production \
  HOST=0.0.0.0 \
  PORT=5173 \
  LIVE_RELOAD=0 \
  BUILD_ON_START=0 \
  TZ=Etc/UTC \
  PATH=/opt/l0-spider-venv/bin:$PATH

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends python3 tini tzdata \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/l0-spider

COPY --from=python-dependencies /opt/l0-spider-venv /opt/l0-spider-venv
COPY --from=application-build --chown=node:node /opt/l0-spider/package.json /opt/l0-spider/package-lock.json ./
COPY --from=application-build --chown=node:node /opt/l0-spider/node_modules ./node_modules
COPY --from=application-build --chown=node:node /opt/l0-spider/dist ./dist
COPY --from=application-build --chown=node:node /opt/l0-spider/server.mjs ./server.mjs
COPY --from=application-build --chown=node:node /opt/l0-spider/server ./server
COPY --from=application-build --chown=node:node /opt/l0-spider/scripts ./scripts
COPY --from=application-build --chown=node:node /opt/l0-spider/src ./src
COPY --from=application-build --chown=node:node /opt/l0-spider/config ./config

RUN chmod 0755 scripts/docker-entrypoint.sh

USER node

EXPOSE 5173

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:5173/').then((response) => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"]

ENTRYPOINT ["tini", "--", "/opt/l0-spider/scripts/docker-entrypoint.sh"]
CMD ["node", "server.mjs"]
