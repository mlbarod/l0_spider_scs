# L0 Spider SCS

L0 공정의 이상감지 결과를 Line·설비·Sensor 조건별로 조회하는 웹서비스입니다.
메인 대시보드에서 전체 현황을 확인하고 자설비 및 동일성 화면에서 Parquet 기반 차트와
분석 이미지를 조회할 수 있습니다.

## 주요 기능

- Line별 이상 현황, KPI 및 기간 추이 대시보드
- 자설비 이상감지 결과 조회와 Scatter·동일성 차트
- 동일성 이상감지 결과 이미지 조회
- SKIP, HIT 및 클릭 이력 관리(운영 DB 연결 시)
- 서비스 내 사용자 메뉴얼

메인 화면에서 `개발예정`으로 표시되는 기능은 안내 화면만 제공합니다.

## 기술 구성

- React 19, React Router, TanStack Query
- Vite 6
- Node.js 통합 서버
- Parquet 기반 파일 데이터
- Python 3 및 PyMySQL 기반 DB helper

## 시작하기

프로젝트에 고정된 Node.js 버전은 없습니다. Node.js와 npm이 설치된 환경에서 의존성을
설치합니다.

```bash
npm install
```

프론트엔드 중심으로 개발할 때는 Vite 개발 서버를 사용합니다.

```bash
npm run dev
```

기본 주소는 `http://localhost:3000`입니다. 이 모드는 일부 API만 제공합니다.

전체 API를 포함한 통합 개발 서버는 다음과 같이 실행합니다.

```bash
npm start
```

기본 주소는 `http://localhost:5173`이며 소스 변경사항이 실시간으로 반영됩니다.

DB 기능을 사용하는 경우 Python 의존성도 설치해야 합니다.

```bash
python3 -m pip install -r scripts/requirements.txt
```

## 실행 모드

| 목적 | 명령 | 설명 |
| --- | --- | --- |
| 프론트엔드 개발 | `npm run dev` | Vite 개발 서버와 제한된 API를 실행합니다. |
| 통합 개발 | `npm start` | Node 서버, 전체 API와 Vite middleware를 실행합니다. |
| 정적 제공 | `LIVE_RELOAD=0 npm start` | 시작 시 빌드한 `dist/`를 제공합니다. |
| 기존 빌드 제공 | `LIVE_RELOAD=0 BUILD_ON_START=0 npm start` | 기존 `dist/`를 다시 빌드하지 않고 제공합니다. |

통합 서버의 주소는 `HOST`와 `PORT`로 변경할 수 있습니다.

## 데이터 및 환경 설정

서비스의 주요 화면은 `/appdata` 아래의 mapping, Parquet 및 이미지 파일을 읽습니다.
해당 운영 데이터가 없는 개발 환경에서는 화면이 비어 있거나 데이터 API가 오류를 반환할
수 있습니다.

- Dashboard, 자설비, 동일성 및 공통부 이상감지의 파일 조회 API는 기본 활성화됩니다.
- DB 기반 이력 기능은 `DB_INFO_PATH`의 credential 파일을 읽을 수 있을 때 활성화됩니다.
- 기본 DB credential 경로는 `/appdata/l0_spider_scs/db_info.pkl`입니다.
- 개별 데이터 연결은 `SCS_*_ENABLED` 환경변수로 차단할 수 있습니다.
- `SCS_DATA_CONNECTIONS_ENABLED=1`은 모든 데이터 API를 활성화하므로 연결 구성이 확인된
  환경에서만 사용합니다.

실제 비밀번호, 토큰, credential 파일 또는 `.env` 값은 저장소에 기록하지 않습니다.
환경변수 전체 목록과 적용 우선순위는
[환경 정의](docs/system/environment-definition.md)를 참고하세요.

## 검증 명령

```bash
npm run lint
npm run test:unit
npm run test:integration
npm run test:contract
npm run build
```

변경 범위와 가까운 검증부터 선택해 실행합니다.

## 프로젝트 구조

```text
src/                 React 화면과 브라우저 API
server/              Node API와 데이터 처리 모듈
scripts/             DB helper와 관리 스크립트
config/              애플리케이션 설정
docs/                기능·시스템·운영·사용자 문서
harness/contracts/   API 및 데이터 계약
```

## 문서 안내

- [시스템 개요](docs/system/overview.md)
- [환경 및 실행 조건](docs/system/environment-definition.md)
- [Dashboard 기능](docs/features/dashboard.md)
- [Self Equipment 기능](docs/features/self-equipment.md)
- [이상 데이터와 결과 조회](docs/features/abnormal-data.md)
- [사용자 메뉴얼](docs/user-manual/USER_MANUAL.md)
- [운영 Runbook](docs/operations/runbook.md)
- [문제 해결](docs/operations/troubleshooting.md)
- [배포 기준](docs/system/deployment.md)
