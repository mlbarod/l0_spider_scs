# 접속 IP와 knox_id 등록

## 동작

DB 연결이 활성화된 서비스에 처음 접속하면 `knox_id` 등록 화면을 표시한다. 서버가 인식한 IP와 사용자가 입력한 ID를 `user_ip_mapping`에 저장하며, 다음 접속에서는 IP로 ID를 조회한다. 등록 화면은 홈과 직접 진입 URL 모두에 적용하고 기존 URL은 유지한다.

- ID는 공백을 제거한 영문·숫자·`.`·`_`·`-` 1~128자이며 대소문자를 보존한다. 이메일 주소는 입력하지 않는다.
- IP 하나에는 ID 하나만 연결한다. 동일 ID에 여러 IP를 등록할 수 있다.
- 같은 IP·ID의 재등록은 성공하며 다른 ID로 덮어쓰기는 허용하지 않는다. 오입력이나 IP 재할당은 관리자가 DB 매핑을 정정해야 한다.
- 새 IP에서 접속하면 다시 등록한다. 브라우저 저장소나 쿠키에 사용자 식별값을 저장하지 않는다.
- HIT/PASS·카테고리 클릭 이력의 `knox_id`에는 서버가 매핑에서 조회한 ID를 저장한다. 기존 IP 기반 이력은 변경하지 않는다.
- DB 기능이 비활성화된 환경은 기존 파일 조회 화면을 유지한다. DB가 활성화되어 있으나 테이블이나 연결에 문제가 있으면 오류와 재시도 화면을 표시하며 IP로 대체 저장하지 않는다.

## 테이블과 적용

[테이블 생성 SQL](../../scripts/user_ip_mapping.sql)을 **배포 전에 직접 실행**한다. 앱은 DDL을 실행하지 않는다. 기존 이력 DB와 동일하게 `DB_INFO_PATH`(기본 `/appdata/l0_spider_scs/db_info.pkl`)의 `DB_NAME`에 있는 테이블을 사용한다. 실행 계정에는 해당 테이블의 SELECT·INSERT·UPDATE 권한이 필요하다. UPDATE는 중복 등록 시 기존 행을 유지하는 구문에 사용한다.

`ip_address`는 정규화된 IPv4/IPv6의 기본 키다. `knox_id`는 비고유 인덱스로 계정별 여러 IP를 허용하며 `created_at`은 최초 등록 시각이다. Python 의존성은 기존 `scripts/requirements.txt`의 PyMySQL을 사용한다.

## API

`GET /api/current-user`:

```json
{"ok":true,"ipAddress":"192.0.2.10","knoxId":null,"registrationRequired":true,"canDeleteHistory":false}
```

등록된 경우 `knoxId`에 계정 문자열, `registrationRequired`에 `false`를 반환한다. GET·POST 응답의 `canDeleteHistory`는 서버의 마스터 권한 여부를 나타내며 미등록 사용자는 `false`다.

`POST /api/current-user`는 `Content-Type: application/json`과 `{"knoxId":"example.user"}`를 받는다. IP는 요청 본문을 사용하지 않고 서버가 인식한 접속 주소만 사용한다. 성공 응답은 등록된 GET 응답과 같다.

- 400: IP·ID·JSON 오류
- 403: 다른 사이트에서 보낸 등록 요청
- 409 `IP_ALREADY_REGISTERED`: 해당 IP에 다른 계정이 이미 등록됨
- 413: 4 KiB를 초과하는 등록 본문
- 503 `CURRENT_USER_DB_FAILED`: DB 또는 테이블 접근 오류
- 이력 변경 API: 미등록 IP는 428 `USER_REGISTRATION_REQUIRED`, 사용자 조회 DB 오류는 503. 요청의 `knoxId`로 우회하지 않는다.

## 마스터 권한

서버 환경변수 `SPIDER_MASTER_KNOX_IDS=master.one,master.two`로 이력저장 게시판 삭제 권한자를 지정한다. 기본은 빈 목록이며 대소문자를 구분한다. 삭제 때마다 서버에서 IP 매핑을 다시 조회하므로 요청 본문의 ID나 화면의 권한값으로 권한을 얻을 수 없다.

설정 전에 관리자가 대상 ID의 기존 IP 매핑을 확인해야 한다. 이미 마스터로 설정한 ID를 새로운 IP에서 임의로 최초 등록하는 요청은 403 `MASTER_REGISTRATION_RESTRICTED`로 거부한다. 마스터의 새 IP 등록·정정은 관리자가 매핑을 관리하며 기존 IP·ID의 재등록은 허용한다.

## 식별의 한계

이 기능은 본인 인증이나 SSO가 아니라 사용자가 입력한 ID와 접속 IP의 연결이다. NAT·공유 PC·프록시 때문에 같은 IP로 인식되면 같은 계정으로 처리되며, IP가 다른 사용자에게 재할당되면 이전 매핑이 적용된다. 프록시는 외부 입력 `x-forwarded-for`/`x-real-ip`를 신뢰 가능한 실제 접속 IP로 덮어써야 한다. 기존 IP 추출 순서는 `x-forwarded-for` 첫 주소 → `x-real-ip` → socket 주소다.

실제 운영 DB와 프록시 확인은 별도로 필요하며, 로컬 검증은 합성 데이터와 DB 대역만 사용한다.
