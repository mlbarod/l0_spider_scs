#!/bin/sh

set -eu

db_info_path="${DB_INFO_PATH:-/appdata/l0_spider/db_info.pkl}"
if [ ! -r "$db_info_path" ]; then
  echo "DB 접속정보 파일을 읽을 수 없습니다: DB_INFO_PATH를 확인하세요." >&2
  exit 1
fi

node scripts/validate_sensor_exclusions_runtime.mjs \
  "${SENSOR_EXCLUSION_CONFIG_PATH:-/opt/l0-spider/config/sensor-exclusions.json}"

exec "$@"
