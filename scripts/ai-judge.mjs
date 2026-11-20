// AI 판정: 테스트 코드와 별개로, AI가 기준 문장과 판정 근거만 읽고 통과·실패를 다시 판정한다.
// 실패면 원인을 product(제품 결함) / test(테스트 코드 문제) / environment(환경 문제)로 분류한다.
// 결과는 out/verdicts.json의 각 결과에 ai 필드로 붙는다. 게이트는 코드 판정과 AI 판정이 다르면 사람 검토로 돌린다.
// 키(NVIDIA_API_KEY)가 없으면 AI 판정을 건너뛰고 그 사실만 기록한다.
import fs from 'node:fs';
import { parse } from 'yaml';

const KEY = process.env.NVIDIA_API_KEY;
const MODEL = process.env.AI_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b';
const URL = process.env.AI_URL ?? 'https://integrate.api.nvidia.com/v1/chat/completions';

const criteria = new Map(fs.readdirSync('criteria').filter(f => f.endsWith('.yaml'))
  .flatMap(f => parse(fs.readFileSync(`criteria/${f}`, 'utf8')).criteria).map(c => [c.id, c]));
const run = JSON.parse(fs.readFileSync('out/verdicts.json', 'utf8'));

const PROMPT = `너는 QA 판정자다. 검증 기준과, 테스트가 실제로 관찰한 근거·오류만 보고 판단한다. 근거에 없는 내용을 추측하지 않는다.
JSON 하나만 출력한다: {"verdict":"pass"|"fail"|"unknown","cause":"product"|"test"|"environment"|null,"reason":"한국어 한두 문장, 근거나 오류의 값을 인용"}
- verdict: 근거가 기준의 pass 조건을 모두 만족하면 pass, fail 조건에 해당하면 fail, 판단할 근거가 부족하면 unknown
- cause: verdict와 별개로, 오류가 있거나 근거가 fail 조건에 해당하면 반드시 고른다. 문제가 없으면 null
  product = 대상 제품이 기준을 어김(잘못된 값, 상태 코드, 권한, API 응답 필드 누락 같은 계약 위반 포함)
  test = 테스트 코드 자체의 결함(근거 값이 비어 있음, 비교 방식 오류, 대상 결함 신호 없이 요소를 못 찾거나 시간 초과)
  environment = 접속 거부, 봇 확인 화면, 서버 미기동처럼 대상에 닿지 못함`;

// 응답이 JSON으로 깔끔하게 오지 않을 때를 대비해 필드를 하나씩 뽑는다.
function parseJudgement(text) {
  try { return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); } catch {}
  const field = k => text.match(new RegExp(`"${k}"\s*:\s*"([^"]*)"`))?.[1] ?? null;
  const verdict = field('verdict');
  return verdict ? { verdict, cause: field('cause'), reason: field('reason') ?? text.slice(0, 160) }
    : { verdict: 'unknown', cause: null, reason: `AI 응답을 읽지 못함: ${text.slice(0, 120)}` };
}

async function judge(c, r) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, temperature: 0, max_tokens: 2000,
      messages: [
        { role: 'system', content: PROMPT },
        { role: 'user', content: JSON.stringify({ criterion: { id: c.id, title: c.title, pass: c.pass, fail: c.fail }, observed: { evidence: r.evidence, error: r.reason } }) },
      ],
    }),
  });
  if (!res.ok) return { verdict: 'unknown', cause: null, reason: `AI 호출 실패 ${res.status}` };
  // 추론형 모델은 <think>…</think>를 먼저 내보낸다. 판정 JSON은 그 뒤에 있다.
  const text = ((await res.json()).choices[0].message.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '');
  return parseJudgement(text);
}

if (!KEY) {
  run.ai = { model: null, note: 'NVIDIA_API_KEY 없음: AI 판정 생략' };
} else {
  run.ai = { model: MODEL };
  for (const r of run.results) {
    const c = criteria.get(r.id);
    if (c && r.verdict !== 'not-run') r.ai = await judge(c, r);
  }
}
fs.writeFileSync('out/verdicts.json', JSON.stringify(run, null, 2));
console.log(run.ai.note ?? run.results.map(r => `${r.id} code=${r.verdict} ai=${r.ai?.verdict ?? '-'}`).join('\n'));
