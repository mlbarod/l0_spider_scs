# L0 Spider SCS 운영 Runbook

## 1. 운영 원칙

실제 service manager, unit 이름, application root, 운영 host·port와 owner는 저장소만으로 확정하지 않는다. 대상 환경에서 먼저 확인하고 승인된 절차만 사용한다.

운영 점검 중 `/appdata` 변경, 운영 DB 테스트 쓰기, 실제 메일 발송, secret 출력과 임의 service 재시작을 하지 않는다.

## 2. 기준 정보

| 항목 | 저장소 기준 |
|---|---|
| 진입점 | `node server.mjs` (`npm start`, `npm run preview`) |
| 기본 listener | `HOST=0.0.0.0`, `PORT=5173` |
| 기본 제공 | `LIVE_RELOAD=1`이면 Vite middleware, `0`이면 `dist/` |
| API 범위 | Vite와 통합 서버 모두 같은 20개 경로 등록 |
| 운영 기능 | Dashboard, 자설비, 동일성, 사용자 메뉴얼 |

## 3. 작업 전 확인

1. 실제 host, release path, service/unit, port와 instance 수를 확인한다.
2. 배포 commit과 최근 변경 범위를 확인한다.
3. incident인지 계획 작업인지와 rollback 지점을 확인한다.
4. 데이터 gate와 필요한 파일·DB readiness를 확인한다.
5. 민감한 환경변수 값은 출력하지 않고 설정 여부만 확인한다.

## 4. 상태 확인

대상 환경에서 확인한 실제 unit 이름만 사용한다.

```bash
systemctl status <unit-name> --no-pager
systemctl show <unit-name> -p MainPID -p ActiveState -p SubState -p NRestarts
journalctl -u <unit-name> --since "<approved-time>" --no-pager
```

listener와 HTTP 확인은 실제 설정 값을 사용한다. API 확인은 `GET` 또는 `HEAD` 같은 읽기 요청으로 제한하고 운영 데이터나 DB를 변경하지 않는다.

## 5. Readiness

- Dashboard: stats/detail root를 service user가 읽을 수 있는지 확인한다.
- 자설비: `path_xian`과 mapping config를 확인한다.
- 동일성: commonality index와 image root를 확인한다.
- 이력 DB: gate와 `DB_INFO_PATH`의 가독성을 확인하되 파일 내용을 출력하지 않는다.
- Sensor 제외: 환경에서 기능을 사용한다면 설정 파일을 validate한다. 파일이 없으면 빈 제외 규칙으로 동작한다.
- MY EQP·HMAC·Mail sender는 현재 readiness 항목이 아니다.

## 6. Service 제어

시작·중지·재시작은 영향과 rollback을 확인한 뒤 승인된 unit에만 수행한다. 수동 `npm start`는 managed service와 port 충돌을 일으킬 수 있으므로 운영 대체 절차로 임의 실행하지 않는다.

재시작 후에는 process, listener, 정적 화면, Dashboard·자설비·동일성의 읽기 요청 순서로 확인한다.

## 7. 장애 분류

| 증상 | 우선 확인 |
|---|---|
| 전체 접속 불가 | process, listener, proxy, port, 최근 배포 |
| 503 `DATA_CONNECTIONS_DISABLED` | 기능별 gate와 전체 gate |
| Dashboard 빈값·오류 | latest stats/detail 파일, mapping, 권한 |
| 자설비·동일성 오류 | index 경로, 선택된 data/image 파일, path 권한 |
| 이력 기능만 오류 | DB gate, `DB_INFO_PATH`, DB 연결 |
| Sensor가 예상과 다름 | 실제 설정 경로, validate 결과, fallback 여부 |

상세 조치는 [Troubleshooting](troubleshooting.md)을 따른다.

## 8. 종료 기록

확인 시각, 대상 환경, 배포 commit, 증상, 읽기 전용 확인 결과, 수행한 service 제어, 정상화 여부와 남은 위험을 기록한다. secret과 실제 credential은 기록하지 않는다.
