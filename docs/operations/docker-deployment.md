# L0 Spider Docker 배포 가이드

## 1. 목적과 확인 상태

이 가이드는 다른 사내 서버에 Node.js, npm package, Python과 PyMySQL을 개별 설치하지
않고 L0 Spider를 컨테이너로 실행하는 절차를 정의한다.

| 항목 | 상태 | 근거 또는 제한 |
|---|---|---|
| image build 구조 | `Confirmed` | `Dockerfile`의 Node build, Python venv, runtime stage |
| Compose 설정 구조 | `Confirmed` | `compose.yaml`, `.env.docker.example` |
| 운영 `/appdata`, DB, proxy 연결 | `Unknown` | 실제 대상 서버와 운영 자원은 조사하지 않음 |
| 실제 사내 registry 접근 | `Unknown` | registry 주소·인증·허용 정책은 저장소 밖 |
| 실제 메일 발송 | `Unknown` | 이 저장소에 sender·scheduler가 확인되지 않음 |

아래 명령은 운영자가 대상 서버에서 실행할 절차다. 실제 비밀번호, token, DB 정보,
내부 host를 명령·문서·Git에 기록하지 않는다.

## 2. 배포 구조

```text
사내 사용자 또는 reverse proxy
  -> <host bind IP>:<host port>
  -> container 5173 / node server.mjs (static dist)
       -> /appdata/abnormal_trend/pic/... (Parquet host bind mount, read-only)
       -> /run/secrets/l0-spider-db-info (DB credential secret, read-only)
       -> sensor-exclusions.json (host bind mount, read-only)
       -> python3 -B scripts/*.py -> DB
```

Image build가 수행하는 작업:

1. `package-lock.json` 기준 `npm ci`
2. `npm run build`로 `dist/` 생성
3. runtime Node dependency만 유지
4. Python virtual environment에 `scripts/requirements.txt` 설치
5. production dependency만 남긴 뒤 sensor 설정 validator를 다시 실행
6. non-root `node` 사용자로 sensor 설정을 fail-closed 검증한 뒤 `node server.mjs` 실행

Runtime에서는 `LIVE_RELOAD=0`, `BUILD_ON_START=0`을 고정하므로 container 시작 때 package
설치나 frontend build를 다시 수행하지 않는다.

## 3. 대상 서버 전제조건

- Docker Engine과 `docker compose` plugin
- image build 시 base image, npm registry와 Python package index에 접근 가능한 network
- 또는 다른 builder에서 만든 동일 CPU architecture의 image
- Parquet 서버의 NFS/CIFS 공유를 host에서 먼저 mount한 실제 L0 Spider `/appdata` root
- `/appdata`와 분리된 신뢰 가능한 host 위치의 `db_info.pkl`
- 사용할 host port, firewall, reverse proxy와 TLS에 대한 운영 승인

Container는 base image의 non-root `node` 사용자로 실행된다. 실제 UID/GID는 사용하는
base image에서 확인해야 하며, 대상 host의 `/appdata`와 Compose secret으로 전달된
credential file이 이 사용자에게 읽히는지는 실제 환경에서 확인해야 한다.
권한 문제를 해결하려고 `/appdata` 전체에 과도한 권한을 부여하지 않는다.

## 4. 설정 파일 준비

Repository root에서 example을 복사한다.

```bash
cp .env.docker.example .env.docker
```

`.env.docker`에서 다음 항목만 대상 환경에 맞춘다.

| 변수 | 의미 | 기본 예시 |
|---|---|---|
| `L0_SPIDER_IMAGE` | build 또는 pull할 image 이름과 tag | `l0-spider:local` |
| `L0_SPIDER_NODE_IMAGE` | build에 사용할 Node base image | `node:22-bookworm-slim` |
| `L0_SPIDER_BIND_IP` | host listener 주소 | `127.0.0.1` |
| `L0_SPIDER_HOST_PORT` | 사용자가 접속할 host port | `5173` |
| `L0_SPIDER_TIMEZONE` | Node·Python runtime timezone | `Asia/Seoul` |
| `L0_SPIDER_APPDATA_PATH` | Parquet 서버의 NFS/CIFS를 host에 mount한 root | `/appdata` |
| `L0_SPIDER_DB_INFO_HOST_PATH` | host의 별도 DB credential pickle 파일 | `/etc/l0-spider/db_info.pkl` |
| `L0_SPIDER_SENSOR_CONFIG_DIR` | host의 sensor 설정 directory | `./config` |

Parquet 서버의 주소·port·계정·비밀번호는 L0 Spider 환경변수가 아니라 Docker host의
NFS/CIFS mount 설정에서 관리한다. `L0_SPIDER_APPDATA_PATH`에는 mount가 완료된 host
directory만 지정하며, container 내부에서는 기존 L0 Spider와 동일한
`/appdata/abnormal_trend/pic/...` 경로를 그대로 사용한다.

`L0_SPIDER_DB_INFO_HOST_PATH`에는 `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
key가 들어 있는 기존 형식의 `db_info.pkl` 파일 경로만 지정한다. Compose는 이 파일을
별도 secret으로 읽어 container의 `/run/secrets/l0-spider-db-info`에 전달하고,
`DB_INFO_PATH`는 이 고정 경로를 가리킨다. credential 값 자체를 `.env.docker`, Dockerfile,
Compose, image, 문서 또는 Git에 복사하지 않는다.

`L0_SPIDER_TIMEZONE`은 필수다. 예제의 `Asia/Seoul`을 그대로 사용하기 전에 기존 L0 Spider
host, 업무 DB와 데이터 생산자의 timezone을 운영 담당자에게 확인한다. 값이 다르면 기존
서버와 동일한 IANA timezone으로 바꾸며, 일치 여부가 `Unknown`이면 이력 시각·기간 만료
동등성을 확인하기 전까지 운영 전환하지 않는다.

기본 `127.0.0.1` bind는 같은 서버의 reverse proxy나 점검 명령만 접근할 수 있다. 사내
클라이언트가 host port로 직접 접속해야 하고 방화벽·접근 통제가 확인된 경우에만
`L0_SPIDER_BIND_IP=0.0.0.0` 또는 승인된 host IP를 사용한다.

## 5. Build와 최초 실행

Compose 설정을 확인하고 image를 build한 뒤 시작한다. Container entrypoint는 DB secret의
읽기 권한과 mount된 host sensor JSON을 매번 검증하며, 하나라도 실패하면
`node server.mjs`를 실행하지 않는다. 따라서 별도 검증 명령을 건너뛰어도 필수 파일이
읽히지 않는 상태로 application이 기동되지 않는다. 대상 host에 Node나 npm은 필요하지 않다.

```bash
docker compose --env-file .env.docker config
docker compose --env-file .env.docker build
docker compose --env-file .env.docker up -d --no-build
```

기동 전에 validator 결과만 명시적으로 확인하려면 다음 명령을 사용할 수 있다. 실제
기동 시에도 entrypoint가 같은 검증을 반복하므로 이 명령과 `up`은 fail-closed로 연결된다.

```bash
docker compose --env-file .env.docker run --rm --no-deps \
  --entrypoint node l0-spider \
  scripts/validate_sensor_exclusions_runtime.mjs \
  /opt/l0-spider/config/sensor-exclusions.json
```

Compose의 bind mount는 `create_host_path: false`다. 존재하지 않는 host source 경로를 빈
directory로 자동 생성하지 않고 시작을 실패시킨다. 다만 NFS/CIFS 연결이 끊겨도 local
mount-point directory가 남는 경우는 이 설정만으로 감지할 수 없으므로 원격 filesystem의
mount 상태와 데이터 freshness는 별도 readiness 점검이 필요하다.
`L0_SPIDER_DB_INFO_HOST_PATH`도 실제 파일이 없으면 Compose 기동이 실패한다. `/appdata`
mount와 DB secret은 서로 다른 host 경로이며 어느 한쪽이 다른 쪽 아래에 있을 필요가 없다.
Sensor 설정은 파일 하나가 아니라 host `config/` directory를 read-only mount한다. 따라서
기존 운영 가이드처럼 검증된 임시 파일을 같은 directory에서 `mv`로 원자 교체할 수 있고,
runtime cache는 inode·mtime·size 변경을 확인해 다음 API 요청에서 새 파일을 읽는다.

사내 mirror를 사용하는 환경에서는 `L0_SPIDER_NODE_IMAGE`에 승인된 base image 경로를
지정하고 npm·pip registry 설정은 조직의 build 정책을 따른다. 이 저장소에는 실제
registry 주소나 credential을 넣지 않는다.

## 6. Package network가 없는 서버로 image 전달

대상 서버가 npm·Python package index에 접근할 수 없다면 network가 허용된 내부 builder에서
image를 한 번 만들고, 승인된 사내 registry 또는 image archive로 전달한다. 대상 CPU
architecture가 builder와 같은지 확인한다.

Builder 예시:

```bash
docker compose --env-file .env.docker build
L0_SPIDER_RESOLVED_IMAGE="$(docker compose --env-file .env.docker config --images)"
docker image save --output l0-spider-image.tar "$L0_SPIDER_RESOLVED_IMAGE"
```

대상 서버 예시:

```bash
docker image load --input l0-spider-image.tar
docker compose --env-file .env.docker up -d --no-build
```

이 경우에도 image의 entrypoint가 mount된 sensor JSON을 검증하고, 실패 시 application
기동을 차단한다.

Archive checksum, 반출입, 보관과 삭제는 사내 artifact 정책을 따른다. 이 저장소 작업에서는
image push·save·전달을 수행하지 않았다.

## 7. 기동 확인

```bash
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs --tail=100 l0-spider
docker compose --env-file .env.docker port l0-spider 5173
```

마지막 명령이 표시한 실제 published 주소로 `/`를 조회한다. `0.0.0.0:<port>`로 표시되면
같은 host에서는 `127.0.0.1:<port>`를 사용한다.

```bash
curl -fsS "http://<confirmed-bind-address>:<confirmed-host-port>/" >/dev/null
```

`healthy`는 container 내부에서 `/`가 HTTP 성공 응답을 반환한다는 liveness 근거다. DB,
`/appdata` freshness, 모든 API와 메일 발송 준비 상태를 뜻하지 않는다.

배포 후 별도로 확인할 항목:

1. 주요 UI route와 static asset
2. read-only Dashboard와 파일 조회 API가 기존 `/appdata/abnormal_trend/pic/...`를 읽는지
3. `/api/current-user`가 실제 client IP를 올바르게 식별하는지
4. reverse proxy가 `X-Forwarded-For` 또는 `X-Real-IP`를 신뢰 가능한 값으로 덮어쓰는지
5. DB 등록·이력 기능은 운영 승인된 검증 절차가 있는 경우에만 확인

## 8. 갱신, 중지와 rollback

새 source로 image를 다시 만들 때는 같은 tag의 container를 recreate한다.

```bash
docker compose --env-file .env.docker build --pull
docker compose --env-file .env.docker up -d --force-recreate --no-build
```

중지와 재시작:

```bash
docker compose --env-file .env.docker stop
docker compose --env-file .env.docker start
```

이전 image tag가 보관된 경우 `.env.docker`의 `L0_SPIDER_IMAGE`를 이전 tag로 바꾸고
`up -d --no-build --force-recreate`할 수 있다. DB row, `/appdata`, 외부 mail 영향은 image
rollback으로 되돌아가지 않는다. 실제 rollback tag와 승인 절차는 현재 `Unknown`이다.

`docker compose down -v`, image 삭제, `/appdata` 삭제·이동은 이 가이드의 일반 배포
절차에 포함하지 않는다.

## 9. 현재 안전 설정

- container root filesystem read-only
- `/appdata`와 sensor 설정 read-only bind mount
- DB credential을 `/appdata`와 분리한 read-only Compose secret
- non-root `node` 실행
- Linux capability 전체 drop 및 `no-new-privileges`
- `/tmp`만 64 MiB tmpfs
- log file당 10 MiB, 최대 3개 rotation
- liveness health check와 `unless-stopped` restart

실제 reverse proxy, TLS, 방화벽, DB 최소 권한, `/appdata` ACL, monitoring과 readiness는
저장소 밖 운영 설정이며 배포 전 확인이 필요하다.
