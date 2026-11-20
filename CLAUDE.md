# ai-verification-gate

검증 기준(`criteria/*.yaml`) → 테스트(`tests/`) → 판정(`out/verdicts.json`) → 게이트(`scripts/gate.mjs`).

- 기준을 테스트로 옮길 때는 `.claude/skills/criteria-to-tests/SKILL.md`를 따른다.
- 작업은 에이전트를 나눠서 한다: `test-writer`가 기준을 테스트로 옮기고 실행한다 → `test-reviewer`가 읽기만 하며 기준과 대조한다(Missing / Extra / Wrong value 등) → 사람이 지적을 보고 고칠지 정한 뒤 커밋한다.
- 기준을 바꾸지 않고 테스트만 고쳐서 통과시키지 않는다. 기준이 틀렸으면 기준을 고치고 그 이유를 커밋 메시지에 적는다.
- 게이트 규칙을 바꾸면 `scripts/gate-selfcheck.mjs`도 같이 고친다.
- 실행: `npm run verify` (테스트 + 게이트). 대상은 `BASE_URL`, `API_URL`로 바꿀 수 있다.
