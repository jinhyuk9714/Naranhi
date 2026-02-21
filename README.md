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

### 4) 확장 설정
- Extension → Settings → DeepL Proxy URL 설정
- 로컬 기본값: `http://localhost:8787`

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
