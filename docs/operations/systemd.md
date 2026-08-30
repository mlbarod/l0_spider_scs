# L0 Spider SCS systemd 운영 기준

## 1. 현재 판정

저장소에는 tracked `*.service` unit이 없고 실제 운영 unit 이름과 field도 확인되지 않았다. 아래 내용은 확인 절차이며 특정 unit 값을 사실로 가정하지 않는다.

## 2. 확인할 field

| Field | 애플리케이션 요구 |
|---|---|
| `User`, `Group` | release 파일과 필요한 `/appdata`를 최소 권한으로 읽을 수 있어야 함 |
| `WorkingDirectory` | 실제 release root |
| `ExecStart` | 해당 환경의 Node로 `server.mjs` 실행 |
| `EnvironmentFile` | gate·경로·port 설정; secret 출력 금지 |
| `Restart` | 운영 정책에 따른 값 |

```bash
systemctl show <unit-name> \
  -p FragmentPath -p User -p Group -p WorkingDirectory \
  -p ExecStart -p EnvironmentFiles -p Restart -p RestartUSec
systemctl cat <unit-name>
systemctl status <unit-name> --no-pager
```

명령은 실제 unit 이름과 권한을 확인한 운영자가 실행한다. 출력에 환경변수 값이 포함될 수 있으면 공유 전에 마스킹한다.

## 3. 환경 기준

- `HOST`, `PORT`, `LIVE_RELOAD`, `BUILD_ON_START`
- 데이터 gate: `SCS_DATA_CONNECTIONS_ENABLED` 및 기능별 `SCS_*_ENABLED`
- 데이터 root와 `MAPPING_CONFIG_PATH`
- 필요한 경우 `DB_INFO_PATH`, `SENSOR_EXCLUSION_CONFIG_PATH`

MY EQP, HMAC key와 mail sender는 현재 service readiness 요건이 아니다.

## 4. 반영

unit 파일 또는 environment file 변경은 diff와 rollback을 확인한 뒤 승인된 절차로 반영한다.

```bash
systemctl daemon-reload
systemctl restart <unit-name>
systemctl status <unit-name> --no-pager
```

`daemon-reload`는 unit 정의가 바뀐 경우에만 필요하다. 애플리케이션 설정 파일만 바뀐 경우의 재시작 필요성은 설정별 문서를 따른다.

## 5. 정상 판정

- 예상 unit과 PID가 active 상태다.
- restart loop와 port 충돌이 없다.
- 의도한 host·port에서 정적 화면과 API가 응답한다.
- Dashboard·자설비·동일성의 필요한 read gate와 데이터가 준비되어 있다.
- journal에 secret, credential 또는 과도한 내부 경로가 노출되지 않는다.

관련 절차는 [Runbook](runbook.md)과 [배포 기준](../system/deployment.md)을 따른다.
