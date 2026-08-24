#!/bin/sh

set -eu

node scripts/validate_sensor_exclusions_runtime.mjs \
  "${SENSOR_EXCLUSION_CONFIG_PATH:-/opt/l0-spider/config/sensor-exclusions.json}"

exec "$@"
