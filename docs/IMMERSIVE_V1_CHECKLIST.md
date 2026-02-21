# IMMERSIVE V1 Checklist (OpenClaw 2-Bot Loop)

목표:
- Immersive Translate처럼 웹페이지를 원문+번역으로 자연스럽게 읽을 수 있는 품질을 달성한다.
- 각 항목은 코드 + 테스트/검증 근거가 있을 때만 체크한다.

## A. Core UX
- [x] 페이지 토글 ON/OFF가 즉시 반영되고 되돌림이 안정적이다. (근거: `PageTranslator.toggle()`를 async boolean 반환으로 변경하고 content message handler가 실제 토글 완료 후 상태 응답하도록 수정, disable 이후 늦게 도착한 번역 응답 무시 가드(`enabled/activeRunId`) 추가, `translator.test.ts`에 stale response 무시/enable 중단 롤백 테스트 추가)
- [x] 원문/번역의 가독성이 깨지지 않는다(레이아웃/줄바꿈/간격). (근거: table/list/dl 등 구조 민감 DOM에서 번역 노드를 안전하게 내부 append하도록 `getInjectionMode`/`injectTranslation` 정책 추가, 줄바꿈/긴 단어 대응 CSS(`white-space: pre-wrap`, `overflow-wrap: anywhere`, `word-break: keep-all`) 보강, `dom-injector.test.ts`로 삽입 정책 회귀 테스트 추가)
- [x] 선택 번역(Context Menu)이 주요 사이트에서 동작한다. (근거: context menu 처리 로직을 `selection-translate.ts`로 분리해 성공 시 tooltip/실패 시 banner 경로를 명시적으로 보강, `selection-translate.test.ts`에 성공/오류/무효 입력 회귀 테스트 추가, `docs/TESTING.md`에 Wikipedia/블로그/뉴스 수동 검증 시나리오 갱신)
- [x] 번역 실패 시 사용자에게 복구 가능한 안내를 표시한다. (근거: content translator에서 배치 번역 실패 시 `showBanner(message, retryable, onRetry)` 호출 및 재시도 큐 재등록 구현, `apps/extension/src/entrypoints/content/translator.test.ts` 추가)

## B. Translation Pipeline
- [x] visible-only 번역이 스크롤 시 점진적으로 동작한다. (근거: `setupVisibleQueue`에 `IntersectionObserver` 미지원 환경 fallback(큐 일괄 등록 후 배치 flush) 추가, `translator.test.ts`에 교차 감지 시점별 점진 번역(1차 b1, 2차 b2) 검증 및 IO 미지원 fallback 배치 동작 검증 테스트 추가)
- [x] 문장 분할/병합 품질이 긴 문단에서도 안정적이다. (근거: `splitTextByLimit` 문장 경계 인식 강화(공백 없는 문장 경계·혼합 구두점 대응) 및 과대 문장 fallback을 고정 길이 자르기에서 공백/구두점 우선 절단으로 개선, `packages/core/__tests__/pipeline.test.ts`에 혼합 구두점 긴 문단/무구두점 긴 문장/segment order 회귀 테스트 추가)
- [x] 동일 텍스트 중복 번역이 캐시로 최소화된다. (근거: background 번역 파이프라인에서 cache miss 시 `InflightTranslations`로 키 단위 in-flight dedupe를 추가해 동시 요청이 동일 번역 Promise를 공유하도록 보강, 기존 메모리/로컬 캐시 hit 경로와 결합, `inflight.test.ts`로 중복 대기 공유/상류 실패 전파 경로 검증)
- [x] DeepL 요청 제한(크기/빈도/오류코드)에 맞춰 방어 로직이 있다. (근거: proxy에서 요청 본문 크기 제한(`MAX_BODY_BYTES`) 검증 유지 + DeepL 429/5xx에 대해 `Retry-After` 우선/지수 백오프 기반 재시도(`DEEPL_RETRY_ATTEMPTS`) 추가, 400/401/403/429/456/5xx 오류코드 매핑으로 retryable 여부 분리, `apps/proxy/__tests__/translate.test.ts`에 retry status·Retry-After/backoff helper 회귀 테스트 추가)

## C. YouTube Subtitle
- [ ] watch 페이지에서만 자막 토글이 활성화된다.
- [ ] 자동 자막(ASR)에서 과도한 재번역/깜빡임이 억제된다.
- [ ] seek/pause/resume에서도 상태가 깨지지 않는다.
- [ ] 캡션 미존재/권한 문제 시 명확한 메시지를 노출한다.

## D. Settings & State
- [x] 설정 저장/복원(`chrome.storage`)이 일관된다. (근거: extension 공통 `settings-storage` 모듈(`inflateSettings`/`flattenSettingsPatch`)을 도입해 popup/options/sidepanel hook과 background가 동일 키 매핑/복원 로직을 공유하도록 통합, proxy URL sanitize 포함, `settings-storage.test.ts`로 flat↔nested 매핑 및 기본값/정규화 회귀 테스트 추가)
- [x] 팝업/사이드패널/콘텐츠 상태가 서로 동기화된다. (근거: content에서 페이지 토글 시 `PAGE_STATE_CHANGED` runtime 이벤트를 브로드캐스트하고 popup/floating content가 수신해 즉시 UI 상태 반영, `useSettings`에 `chrome.storage.onChanged` 구독을 추가해 popup/sidepanel/options 설정 변경이 실시간 동기화되도록 보강, `settings-storage.test.ts`에 storage change patch 추출 회귀 테스트 추가)
- [x] 프록시 URL/옵션 변경 시 안전한 검증이 있다. (근거: `settings-storage`에서 프록시/OpenAI URL http(s) 검증·보정, enum 옵션(engine/displayMode/position/theme/formality) allowlist 검증, `batchFlushMs` 범위 clamp(20~1000), `visibleRootMargin` 토큰 포맷(px/%) 검증 추가; `settings-storage.test.ts`에 잘못된 값 거부/기본값 fallback 회귀 테스트 추가)
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
