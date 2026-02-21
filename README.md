# Naranhi — 몰입형 웹/유튜브 이중 번역 확장 프로그램 (v1 후보)

Naranhi는 Chrome/Edge MV3 기반의 몰입형 번역 확장 프로그램입니다.

- 웹페이지 원문+번역 병행 보기
- 선택 영역 번역(컨텍스트 메뉴)
- YouTube 자막 이중 표시(ASR 안정화 포함)

번역 호출(DeepL/OpenAI/Google)은 클라이언트에서 직접 처리하지 않고, 프로젝트의 proxy/engine 레이어를 통해 라우팅합니다.

## v1 후보 범위

### 구현 완료
- 페이지 번역 토글(ON/OFF 전환 및 실패 시 롤백 안정화)
- Readability 기반 블록 추출 + 안전한 DOM 주입 정책
- visible-only 점진 번역 큐(IntersectionObserver + fallback)
- 재시도 가능한 오류에 대한 번역 재시도 배너
- 주요 사이트에서 선택 번역(컨텍스트 메뉴)
- 캐시 중복 제거(memory/local + in-flight dedupe)
- DeepL 제한 대응(429/5xx 재시도, Retry-After/backoff)
- YouTube watch 페이지에서만 자막 토글 활성화
- 자막 없음/권한 문제 메시지 처리
- ASR 재번역/깜빡임 억제 + seek/pause/resume 안정 렌더링
- popup/sidepanel/content 간 설정 동기화
- 클라이언트 비밀키 저장 차단(백엔드 전용 비밀키 정책)

### 현재 한계
- 사이트별 규칙(per-site rules), 언어별 프로필(per-language profiles)은 v1 범위 밖
- 문서 번역(PDF/SRT 업로드)은 이번 릴리즈 범위 밖
- 클라우드 프록시/BYOK 과금 플로우는 미포함

## 설치 및 실행

### 1) 의존성 설치
```bash
pnpm install
```

### 2) Proxy 실행
```bash
cd apps/proxy
DEEPL_AUTH_KEY="YOUR_KEY" pnpm dev
```

- DeepL Pro 사용 시: `DEEPL_API_BASE=https://api.deepl.com`

### 3) Extension 빌드
```bash
cd /Users/sungjh/Naranhi
pnpm --filter @naranhi/extension build
```

- Chrome 확장 프로그램 로드 경로: `apps/extension/.output/chrome-mv3`
- `apps/extension/.output/chrome-mv3-dev`는 개발(HMR) 산출물입니다. 이 경로를 로드하면 `ws://localhost:3000` 연결 오류가 날 수 있습니다.

### 4) 확장 설정
- Extension → Settings → DeepL Proxy URL 설정
- 로컬 기본값: `http://localhost:8787`

## 트러블슈팅

### 옵션에서 `Failed to fetch` + `8787` 연결 테스트 실패

대부분 프록시 서버가 실행 중이 아니어서 발생합니다.

```bash
cd /Users/sungjh/Naranhi/apps/proxy
pnpm dev
```

다른 터미널에서 상태 확인:

```bash
curl -i http://localhost:8787/health
```

정상 응답은 `HTTP/1.1 200 OK` + `ok` 입니다.

추가 체크:

1. 옵션의 `Proxy URL`이 정확히 `http://localhost:8787` 또는 `http://127.0.0.1:8787`인지 확인
2. 확장 프로그램을 재로드하고 `Test Connection` 재실행

### 유튜브 자막 번역이 안 될 때 (점검 순서)

아래 순서대로 확인하면 대부분 바로 원인 구분이 됩니다.

1. **watch 페이지인지 확인**  
   URL이 `https://www.youtube.com/watch?...` 형태가 아니면 동작하지 않습니다.
2. **팝업 메시지 확인**  
   - `Open a YouTube watch page...` → watch 페이지 아님  
   - `No captions detected on this video.` → 자막 자체 없음  
   - `Captions are unavailable...` → 영상 권한/지역 제한
3. **유튜브 자막 버튼(CC) 상태 확인**  
   플레이어에 CC 버튼이 없거나 비활성(회색/잠김)이면 확장에서 켤 수 없습니다.
4. **확장 상태 동기화 확인**  
   watch 페이지에서 팝업을 닫았다 다시 열어 `YouTube Subtitles` 토글 상태가 실제 CC 상태와 일치하는지 확인합니다.
5. **content script 재연결 확인**  
   탭 새로고침 후 다시 토글합니다.  
   연결 오류(Receiving end does not exist)면 새로고침으로 복구됩니다.

### `WebSocket connection to 'ws://localhost:3000/' failed (ERR_CONNECTION_REFUSED)`

확장 프로그램이 개발(HMR) 빌드(`chrome-mv3-dev`)로 로드된 상태에서 개발 서버가 꺼져 있으면 발생합니다.

```bash
cd /Users/sungjh/Naranhi
pnpm --filter @naranhi/extension clean
pnpm --filter @naranhi/extension build
```

그 다음 브라우저 확장 관리 페이지에서:

1. 기존 개발 빌드(`chrome-mv3-dev`)를 제거
2. `apps/extension/.output/chrome-mv3`를 다시 로드

개발 모드(HMR)가 필요하면 아래처럼 서버를 켠 상태를 유지해야 합니다.

```bash
cd /Users/sungjh/Naranhi
pnpm --filter @naranhi/extension dev
```

## 데모 시나리오
- Wikipedia: 페이지 토글 ON/OFF + visible-only 점진 번역
- 블로그/뉴스: 선택 번역 컨텍스트 메뉴 동작
- YouTube watch: 자막 토글, no-caption 안내, seek/pause/resume 안정성

## 품질 검증
```bash
pnpm lint
pnpm test
pnpm build
```

## 문서
- 테스트 가이드: `docs/TESTING.md`
- 로드맵: `docs/ROADMAP.md`
- 보안/개인정보: `docs/SECURITY_PRIVACY.md`
- 아키텍처: `docs/ARCHITECTURE.md`
- v1 루프 체크리스트: `docs/IMMERSIVE_V1_CHECKLIST.md`
