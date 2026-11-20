// 배포 게이트: 검증 기준(criteria/*.yaml)과 판정(out/verdicts.json)을 합쳐 Go/No-Go를 정한다.
//   No-Go: blocker 기준이 실패했거나, 판정되지 않았다(테스트 없음·건너뜀).
//   Go:    그 밖의 경우. major·minor 실패는 위험으로 기록한다.
// 결과: out/summary.md(PR 요약), out/site/history.json·index.html(판정 이력 페이지). No-Go면 exit 1.
import fs from 'node:fs';
import { parse } from 'yaml';

const criteria = fs.readdirSync('criteria').filter(f => f.endsWith('.yaml'))
  .flatMap(f => parse(fs.readFileSync(`criteria/${f}`, 'utf8')).criteria);
const run = JSON.parse(fs.readFileSync('out/verdicts.json', 'utf8'));
const byId = new Map(run.results.map(r => [r.id, r]));

const rows = criteria.map(c => {
  const r = byId.get(c.id);
  return { ...c, verdict: r?.verdict ?? 'unverified', reason: r?.reason ?? (r ? null : '이 기준을 판정하는 테스트가 없다'), evidence: r?.evidence ?? null };
});
const blocking = rows.filter(r => r.severity === 'blocker' && r.verdict !== 'pass');
const risks = rows.filter(r => r.severity !== 'blocker' && r.verdict !== 'pass');
const decision = blocking.length ? 'No-Go' : 'Go';

const mark = { pass: '통과', fail: '실패', 'not-run': '미판정', unverified: '미검증' };
const md = [
  `## 배포 판정: ${decision}`,
  `커밋 ${run.commit} · ${run.runAt} · 기준 ${rows.length}개 중 통과 ${rows.filter(r => r.verdict === 'pass').length}개`,
  blocking.length ? `\n**배포를 막은 기준:** ${blocking.map(r => r.id).join(', ')}` : '',
  risks.length ? `\n**위험으로 기록한 기준:** ${risks.map(r => r.id).join(', ')}` : '',
  '\n| 기준 | 심각도 | 판정 | 근거 |',
  '|---|---|---|---|',
  ...rows.map(r => `| ${r.id} ${r.title} | ${r.severity} | ${mark[r.verdict]} | ${(r.reason ?? JSON.stringify(r.evidence)).replace(/\|/g, '\\|').slice(0, 200)} |`),
].join('\n');

fs.mkdirSync('out/site', { recursive: true });
fs.writeFileSync('out/summary.md', md);

// 이력: 이전 배포의 history.json이 out/site에 있으면 이어 붙인다(CI가 Pages에서 받아 둔다).
const histPath = 'out/site/history.json';
const history = fs.existsSync(histPath) ? JSON.parse(fs.readFileSync(histPath, 'utf8')) : [];
history.unshift({ runAt: run.runAt, commit: run.commit, decision, rows: rows.map(({ id, title, severity, verdict, reason, evidence }) => ({ id, title, severity, verdict, reason, evidence })) });
fs.writeFileSync(histPath, JSON.stringify(history.slice(0, 50), null, 2));

const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
fs.writeFileSync('out/site/index.html', `<!doctype html><meta charset="utf-8"><title>AI Verification Gate</title>
<style>body{font:14px system-ui;margin:24px;max-width:1100px}table{border-collapse:collapse;width:100%;margin:8px 0 24px}td,th{border:1px solid #ccc;padding:4px 8px;text-align:left;vertical-align:top}
.Go{color:#1a7f37}.No-Go{color:#cf222e}.fail,.unverified,.not-run{background:#fff1f0}code{font-size:12px;word-break:break-all}</style>
<h1>판정 이력</h1><p>기준: <code>criteria/*.yaml</code> · 최근 ${history.length}회</p>
${history.map(h => `<h2 class="${h.decision}">${h.decision} · ${esc(h.commit)} · ${esc(h.runAt)}</h2>
<table><tr><th>기준</th><th>심각도</th><th>판정</th><th>근거</th></tr>${h.rows.map(r => `<tr class="${r.verdict}"><td>${esc(r.id)} ${esc(r.title)}</td><td>${r.severity}</td><td>${mark[r.verdict]}</td><td><code>${esc(r.reason ?? JSON.stringify(r.evidence))}</code></td></tr>`).join('')}</table>`).join('')}`);

console.log(md);
process.exit(decision === 'Go' ? 0 : 1);
