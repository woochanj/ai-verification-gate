# ai-verification-gate

요구사항·화면·API를 **AI가 판정할 수 있는 검증 기준**으로 바꾸고, AI 에이전트가 그 기준을 테스트로 옮겨 실행하고, **판정 근거를 기록**한 뒤, 그 근거로 **배포 여부(Go/No-Go)를 정하는** 흐름을 작게 재현한 저장소입니다.

대상은 공개 테스트 연습 사이트 [Toolshop](https://practicesoftwaretesting.com)과 그 [REST API](https://api.practicesoftwaretesting.com/api/documentation)입니다.

```
criteria/*.yaml        검증 기준: 무엇이 통과이고 무엇이 실패인지, 심각도
   │  .claude/skills/criteria-to-tests   에이전트가 기준을 테스트로 옮길 때 따르는 규칙
   ▼
tests/*.spec.ts        기준 1개 = 테스트 1개, 제목에 기준 id
   │  scripts/verdict-reporter.mjs       테스트 결과를 기준 단위 판정 + 근거로 기록
   ▼
out/verdicts.json      판정과 근거(실제로 본 값, 실패 메시지, 스크린샷)
   │  scripts/gate.mjs                   blocker 실패·미판정이면 No-Go
   ▼
PR 요약 + 판정 이력 페이지(GitHub Pages)
```

## 검증 기준

기준 하나에 통과 조건과 실패 조건을 같이 적습니다. 테스트는 이 문장을 옮긴 것이고, 기준에 없는 것은 검증하지 않습니다.

```yaml
- id: C-UI-02
  source: 화면+API
  title: 목록 화면 가격이 API 가격과 같다
  pass: 첫 페이지 상품 카드마다 화면 가격이 같은 id의 API price와 같다
  fail: 가격이 다른 상품이 하나라도 있다
  severity: blocker
```

현재 기준 9개: API 3개, 화면 6개(그중 4개는 화면 값과 API 값을 대조). 전체는 [criteria/toolshop.yaml](criteria/toolshop.yaml).

## 판정 근거

테스트는 판정에 쓴 값을 남깁니다. 근거만 보고 사람이 판정을 다시 내릴 수 있게 하는 것이 목적입니다.

```json
{ "id": "C-UI-05", "verdict": "pass",
  "evidence": { "product": "Long Nose Pliers", "label": "Out of stock", "buttonDisabled": true } }
```

## 게이트 규칙

| 상황 | 판정 |
|---|---|
| blocker 기준 실패 | No-Go |
| blocker 기준 미판정(skip) 또는 판정하는 테스트가 없음 | No-Go |
| major·minor 기준 실패 | Go, 위험으로 기록 |

재시도는 0회입니다. 재시도로 통과한 테스트는 판정을 믿을 수 없게 만들기 때문입니다. 규칙은 [scripts/gate-selfcheck.mjs](scripts/gate-selfcheck.mjs)로 점검합니다.

## 에이전트

테스트를 쓰는 에이전트와 검토하는 에이전트를 나눴습니다. 쓴 쪽이 자기 결과를 검토하면 같은 착각을 반복하기 때문입니다.

| 에이전트 | 하는 일 | 권한 |
|---|---|---|
| [test-writer](.claude/agents/test-writer.md) | 기준 하나를 테스트로 옮기고 실행해 결과를 보고 | 테스트 파일 작성·실행. 기준 파일 수정, 커밋 금지 |
| [test-reviewer](.claude/agents/test-reviewer.md) | 테스트를 기준과 대조해 Missing / Extra / Wrong value / Hardcoded data / No evidence / Hidden failure를 보고 | 읽기 전용 |

리뷰 지적을 보고 고칠지는 사람이 정하고, 사람이 커밋합니다.

[.claude/skills/criteria-to-tests/SKILL.md](.claude/skills/criteria-to-tests/SKILL.md)에 기준을 테스트로 옮길 때 지키는 규칙을 적었습니다.

- 기준의 통과 조건은 빠뜨리지 않고, 기준에 없는 검증은 더하지 않는다
- 실제 화면을 Playwright MCP로 열어 확인한 뒤 쓴다
- 막히면 실패로 남긴다. assertion을 주석 처리하거나 재시도로 통과시키지 않는다
- 상품 id·가격을 테스트에 박지 않고 API에서 조건으로 고른다

이 규칙과 에이전트 구성은 실무에서 쓰던 방식을 일반화한 것입니다. 실무에서는 TC 구현을 데이터 탐색, 이슈 트래커 조회, 테스트 작성, TC 대조 리뷰, 결과 기록, 결과 시트 반영의 6개 에이전트로 나눠 썼고, 여러 사람이 AI로 테스트를 만들 때 결과가 제각각이 되거나 기대결과에 없는 검증이 섞여 엉뚱한 실패가 나던 문제를 겪으며 규칙을 정했습니다.

## 실행

```bash
npm ci
npx playwright install chromium
npm run verify                 # 테스트 + 게이트
node scripts/gate-selfcheck.mjs
```

대상은 `BASE_URL`, `API_URL` 환경 변수로 바꿀 수 있습니다. 로컬 기본값은 공개 사이트이고, CI는 공개 사이트가 CI 서버 접속에 봇 확인 화면을 띄우기 때문에 [toolshop/docker-compose.yml](toolshop/docker-compose.yml)로 Toolshop을 직접 띄워 검증합니다. CI는 PR, main 푸시, 매주 월요일에 돌고, main 결과는 GitHub Pages 판정 이력에 쌓입니다.

AI와 사람이 각각 무엇을 했는지는 [docs/ai-workflow.md](docs/ai-workflow.md)에 적었습니다.
