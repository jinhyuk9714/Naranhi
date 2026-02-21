# IMMERSIVE PERFECT Checklist (Dev + QA Loop)

목표: "유튜브/웹 번역이 실제로 동작하는 상태"를 코드, 테스트, 실행 로그 근거로 증명한다.

## A. 루프 규칙

- [ ] bot1(개발)은 매 턴 실제 파일 수정 + 테스트 + 커밋을 수행한다.
- [ ] bot2(QA)는 매 턴 실패 재현 또는 회귀 테스트를 먼저 수행하고, 부족한 점을 반박한다.
- [ ] 모든 완료 체크([x]) 항목은 반드시 근거(파일 경로, 테스트 명령, 결과)를 같은 커밋 또는 같은 턴 메시지에 남긴다.

## B. YouTube 핵심 기능

- [ ] 팝업 `YouTube Subtitles` 토글이 watch 페이지에서 실제로 ON/OFF 응답을 주고 UI 상태가 동기화된다.
- [x] watch 페이지가 아니면 `NOT_WATCH_PAGE` 오류 코드와 사용자 안내 문구가 일치한다.
- [x] 자막 버튼이 없을 때 `NO_CAPTIONS` 오류 코드가 일치하고 안내 문구가 표시된다.
- [x] 자막 권한 제한/비활성 상태에서 `CAPTION_PERMISSION_DENIED` 오류 코드가 일치한다.
- [x] 유튜브 자막 번역 파이프라인(수집 -> 배치 번역 -> 렌더)이 실제로 동작한다.
- [x] seek/pause/resume 중 자막 번역이 깨지지 않고 중복 렌더/깜빡임이 허용 범위 내다.

## C. Proxy/Engine 안정성

- [x] `apps/proxy`가 `PORT=8787`에서 정상 실행되고 `/health`가 200을 반환한다.
- [x] `/translate` 실패 시 구조화 오류 코드/메시지 매핑이 유지된다.
- [x] 옵션의 `Test Connection` 실패 메시지가 실제 원인(미실행/주소오류/HTTP오류)을 구분해 보여준다.

## D. 회귀 테스트

- [x] `pnpm --filter @naranhi/extension test` 통과.
- [x] `pnpm --filter @naranhi/extension build` 통과.
- [x] `pnpm --filter @naranhi/proxy test` 통과.
- [x] 새로 추가한 유튜브 관련 로직에 단위 테스트가 함께 추가되어 있다.

## E. 문서/운영

- [ ] README 트러블슈팅에 "유튜브 자막 번역 불가" 케이스의 점검 순서가 최신화되어 있다.
- [ ] TESTING 문서에 유튜브 E2E 수동 점검 시나리오와 기대 결과가 명시되어 있다.
- [ ] 변경사항이 RELEASE_NOTES에 기록되어 있다.

## 종료 조건

- [ ] 위 항목이 전부 [x]이고 quality gate가 통과하면 마지막 메시지에 `FLAGDOCK_DONE`을 출력한다.
