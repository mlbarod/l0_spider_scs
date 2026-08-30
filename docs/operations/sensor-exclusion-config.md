# L0 Spider SCS Sensor 제외 설정 운영 가이드

## 1. 현재 저장소 상태

저장소에는 예시 파일 `config/sensor-exclusions.example.json`만 있다. 기본 runtime 경로는 `config/sensor-exclusions.json`이지만 이 파일은 현재 tracked 파일이 아니다.

실제 설정 파일이 없거나 처음부터 읽을 수 없거나 유효하지 않으면 서버는 빈 제외 규칙으로 fallback한다. 이전에 정상 설정을 cache한 뒤 reload가 실패하면 마지막 정상 cache를 사용한다.

## 2. 설정 형식

```json
{
  "version": 1,
  "apps": {
    "selfEquipment": { "contains": [] },
    "matchingAnomaly": { "contains": [] },
    "commonAnomaly": { "contains": [] },
    "commonCommonalityAnomaly": { "contains": [] },
    "mailing": { "contains": [] }
  }
}
```

- 각 `contains`는 Sensor 이름에 포함되는 대소문자 무관 문자열 목록이다.
- App별 최대 100개, 항목별 최대 128자다.
- 알 수 없는 root field, App key 또는 App field는 허용하지 않는다.
- `mailing` key는 잔여 데이터 처리 호환을 위한 key이며 실제 메일 발송 기능을 뜻하지 않는다.

## 3. 운영 파일 준비

환경별 설정이 필요할 때만 예시를 운영 관리 경로에 복사해 편집한다. 저장소 기본 경로를 쓸 수도 있고 외부 경로를 `SENSOR_EXCLUSION_CONFIG_PATH`로 지정할 수도 있다.

운영 파일을 Git에 추가하기 전에 환경별 값인지 검토한다. `/appdata`에 테스트 산출물을 만들지 않는다.

## 4. 검증

기본 경로에 실제 파일이 있을 때:

```bash
npm run sensor-exclusions:validate
```

별도 후보 파일을 검증할 때:

```bash
npm run sensor-exclusions:validate -- /absolute/path/to/sensor-exclusions.next.json
```

`{"ok":true,"termCounts":...}`가 출력되는지 확인한 뒤 승인된 방법으로 파일을 반영한다. 검증 실패 시 현재 정상 파일을 덮어쓰지 않는다.

## 5. 반영과 확인

서버는 파일 metadata가 바뀌면 다시 읽으므로 일반적으로 애플리케이션 재시작이 필수는 아니다. 다만 배포 환경의 mount·cache 정책은 별도 확인한다.

반영 후 관련 화면의 API를 읽기 전용으로 조회해 제외 전후 개수와 의도한 Sensor만 사라졌는지 확인한다. 원천 Parquet은 변경하지 않는다.

## 6. 장애 처리

- 누락: 빈 규칙으로 동작하는 것이 의도인지 확인한다.
- JSON/Schema 오류: validate 후 마지막 정상 파일로 복구한다.
- 권한 오류: service user에 필요한 최소 읽기 권한만 부여한다.
- 예상치 못한 대량 제외: 후보 파일을 제거하지 말고 이전 정상 파일로 승인된 교체를 수행한다.

## 7. 근거

- `config/sensor-exclusions.example.json`
- `server/sensorExclusionConfig.mjs`
- `scripts/validate_sensor_exclusions.mjs`
- `harness/contracts/sensor-exclusions.schema.json`
