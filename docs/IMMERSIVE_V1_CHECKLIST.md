# IMMERSIVE V1 Checklist (OpenClaw 2-Bot Loop)

목표:
- Immersive Translate처럼 웹페이지를 원문+번역으로 자연스럽게 읽을 수 있는 품질을 달성한다.
- 각 항목은 코드 + 테스트/검증 근거가 있을 때만 체크한다.

## A. Core UX
- [ ] 페이지 토글 ON/OFF가 즉시 반영되고 되돌림이 안정적이다.
- [ ] 원문/번역의 가독성이 깨지지 않는다(레이아웃/줄바꿈/간격).
- [ ] 선택 번역(Context Menu)이 주요 사이트에서 동작한다.
- [x] 번역 실패 시 사용자에게 복구 가능한 안내를 표시한다. (근거: content translator에서 배치 번역 실패 시 `showBanner(message, retryable, onRetry)` 호출 및 재시도 큐 재등록 구현, `apps/extension/src/entrypoints/content/translator.test.ts` 추가)

## B. Translation Pipeline
- [ ] visible-only 번역이 스크롤 시 점진적으로 동작한다.
- [ ] 문장 분할/병합 품질이 긴 문단에서도 안정적이다.
- [ ] 동일 텍스트 중복 번역이 캐시로 최소화된다.
- [ ] DeepL 요청 제한(크기/빈도/오류코드)에 맞춰 방어 로직이 있다.

## C. YouTube Subtitle
- [ ] watch 페이지에서만 자막 토글이 활성화된다.
- [ ] 자동 자막(ASR)에서 과도한 재번역/깜빡임이 억제된다.
- [ ] seek/pause/resume에서도 상태가 깨지지 않는다.
- [ ] 캡션 미존재/권한 문제 시 명확한 메시지를 노출한다.

## D. Settings & State
- [ ] 설정 저장/복원(`chrome.storage`)이 일관된다.
- [ ] 팝업/사이드패널/콘텐츠 상태가 서로 동기화된다.
- [ ] 프록시 URL/옵션 변경 시 안전한 검증이 있다.
- [ ] 민감값(API key 등)이 클라이언트에 노출되지 않는다.

## E. Quality Gates
- [ ] `pnpm lint` 통과
- [ ] `pnpm test` 통과
- [ ] `pnpm build` 통과
- [ ] 주요 수동 시나리오(문서) 점검 완료

## F. Docs & Release
- [ ] README에 설치/실행/데모/한계가 최신 상태로 반영된다.
- [ ] `docs/TESTING.md` 수동 테스트 결과가 최신화된다.
- [ ] `docs/ROADMAP.md` v1 항목이 실제 구현 상태와 일치한다.
- [ ] 릴리즈 노트(v1 후보) 문서가 추가된다.

## Finish
- [ ] 두 봇이 최종 리뷰 후 `FLAGDOCK_DONE`을 선언한다.
