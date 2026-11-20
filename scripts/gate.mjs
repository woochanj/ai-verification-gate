// 배포 게이트: 검증 기준(criteria/*.yaml)과 판정(out/verdicts.json)을 합쳐 Go/No-Go를 정한다.
//   No-Go: blocker 기준이 실패했거나, 판정되지 않았다(테스트 없음·건너뜀),
//          또는 코드 판정과 AI 판정(scripts/ai-judge.mjs)이 달라 사람 검토가 필요하다.
//   Go:    그 밖의 경우. major·minor 실패와 불일치는 위험으로 기록한다.
// 결과: out/summary.md(PR 요약), out/result.json(이력 페이지용). No-Go면 exit 1, EXPECT가 있으면 기대 판정과 다를 때 exit 1.
import fs from 'node:fs';
import { parse } from 'yaml';

const criteria = fs.readdirSync('criteria').filter(f => f.endsWith('.yaml'))
  .flatMap(f => parse(fs.readFileSync(`criteria/${f}`, 'utf8')).criteria);
const run = JSON.parse(fs.readFileSync('out/verdicts.json', 'utf8'));
const byId = new Map(run.results.map(r => [r.id, r]));

const rows = criteria.map(c => {
  const r = byId.get(c.id);
  const ai = r?.ai ?? null;
  // AI가 통과·실패로 판단했는데 코드 판정과 다르면 사람이 근거를 보고 정해야 한다. 판단 불가면 코드 판정을 따른다.
  const review = !!ai && ['pass', 'fail'].includes(ai.verdict) && ai.verdict !== r.verdict;
  return { ...c, video: r?.video ?? null, verdict: r?.verdict ?? 'unverified', reason: r?.reason ?? (r ? null : '이 기준을 판정하는 테스트가 없다'), evidence: r?.evidence ?? null, ai, review };
});
const bad = r => r.verdict !== 'pass' || r.review;
const blocking = rows.filter(r => r.severity === 'blocker' && bad(r));
const risks = rows.filter(r => r.severity !== 'blocker' && bad(r));
const decision = blocking.length ? 'No-Go' : 'Go';

const mark = { pass: '통과', fail: '실패', 'not-run': '미판정', unverified: '미검증', unknown: '판단 불가' };
const cause = { product: '제품 결함', test: '테스트 문제', environment: '환경 문제' };
const aiText = r => !r.ai ? '-'
  : `${r.review ? '검토 필요: ' : ''}${mark[r.ai.verdict] ?? r.ai.verdict}${r.ai.cause ? `(${cause[r.ai.cause] ?? r.ai.cause})` : ''} ${r.ai.reason ?? ''}`;
const cell = s => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 200);
const aiModel = run.ai?.model ?? run.ai?.note ?? '없음';

const body = [
  `## 배포 판정: ${decision}`,
  `커밋 ${run.commit} · ${run.runAt} · 기준 ${rows.length}개 중 통과 ${rows.filter(r => r.verdict === 'pass').length}개 · AI 판정: ${aiModel}`,
  blocking.length ? `\n**배포를 막은 기준:** ${blocking.map(r => r.id).join(', ')}` : '',
  risks.length ? `\n**위험으로 기록한 기준:** ${risks.map(r => r.id).join(', ')}` : '',
  '\n| 기준 | 심각도 | 코드 판정 | 근거 | AI 판정 |',
  '|---|---|---|---|---|',
  ...rows.map(r => `| ${r.id} ${r.title} | ${r.severity} | ${mark[r.verdict]} | ${cell(r.reason ?? JSON.stringify(r.evidence))} | ${cell(aiText(r))} |`),
].join('\n');

const scenario = process.env.SCENARIO ?? 'local';
const md = `### 시나리오: ${scenario}\n${body}`;
fs.mkdirSync('out', { recursive: true });
fs.writeFileSync('out/summary.md', md);
// 판정 이력 페이지(scripts/site.mjs)가 시나리오별 결과를 모아 그린다.
fs.writeFileSync('out/result.json', JSON.stringify({ scenario, runAt: run.runAt, commit: run.commit, decision, aiModel,
  rows: rows.map(({ id, title, severity, verdict, reason, evidence, ai, review, video }) => ({ id, title, severity, verdict, reason, evidence, ai, review, video })) }, null, 2));

console.log(md);
// EXPECT가 있으면 "기대한 판정이 나왔는가"로 성공을 정한다(결함 주입 빌드는 No-Go가 나와야 정상).
const ok = process.env.EXPECT ? decision === process.env.EXPECT : decision === 'Go';
process.exit(ok ? 0 : 1);
