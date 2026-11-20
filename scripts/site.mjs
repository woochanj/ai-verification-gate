// 판정 이력 페이지: 시나리오별 결과(results/<시나리오>/result.json)를 모아 out/site에 그린다.
//   node scripts/site.mjs results
// 이전 이력은 out/site/history.json(CI가 Pages에서 받아 둔다)에 이어 붙인다. 영상은 이번 실행분만 싣는다.
import fs from 'node:fs';
import path from 'node:path';

const SCENARIOS = {
  normal: { name: '정상 빌드', expect: 'Go', about: 'Toolshop sprint5. 기준을 모두 지키면 배포를 허용하는지 본다.' },
  bugs: { name: '결함 주입 빌드', expect: 'No-Go', about: 'Toolshop sprint5-with-bugs(공식 교육용, 결함 40개 이상). 코드가 실패를 잡고 AI가 원인을 분류하고 게이트가 막는지 본다.' },
  'env-fault': { name: '환경 장애', expect: 'No-Go', about: '정상 빌드를 띄운 뒤 API 서버를 멈춤. 접속 오류를 제품 결함과 구분해 환경 문제로 분류하는지 본다.' },
};
const mark = { pass: '통과', fail: '실패', 'not-run': '미판정', unverified: '미검증', unknown: '판단 불가' };
const cause = { product: '제품 결함', test: '테스트 문제', environment: '환경 문제' };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const dir = process.argv[2] ?? 'results';
fs.mkdirSync('out/site/videos', { recursive: true });
const histPath = 'out/site/history.json';
let history = {};
try { const h = JSON.parse(fs.readFileSync(histPath, 'utf8')); if (!Array.isArray(h)) history = h; } catch {}
for (const k of Object.keys(history)) history[k] = history[k].map(run => ({ ...run, rows: run.rows.map(({ video, ...r }) => r) }));

for (const scenario of Object.keys(SCENARIOS)) {
  const file = path.join(dir, scenario, 'result.json');
  if (!fs.existsSync(file)) continue;
  const run = JSON.parse(fs.readFileSync(file, 'utf8'));
  const videos = path.join(dir, scenario, 'videos');
  if (fs.existsSync(videos)) {
    fs.mkdirSync(`out/site/videos/${scenario}`, { recursive: true });
    for (const v of fs.readdirSync(videos)) fs.copyFileSync(path.join(videos, v), `out/site/videos/${scenario}/${v}`);
  }
  run.rows = run.rows.map(r => ({ ...r, video: r.video ? `videos/${scenario}/${path.basename(r.video)}` : null }));
  history[scenario] = [run, ...(history[scenario] ?? [])].slice(0, 20);
}
fs.writeFileSync(histPath, JSON.stringify(history, null, 2));

const aiText = r => !r.ai ? '-'
  : `${r.review ? '검토 필요: ' : ''}${mark[r.ai.verdict] ?? r.ai.verdict}${r.ai.cause ? ` (${cause[r.ai.cause] ?? r.ai.cause})` : ''}. ${r.ai.reason ?? ''}`;
const table = run => `<table><tr><th>기준</th><th>심각도</th><th>코드 판정</th><th>근거</th><th>AI 판정</th></tr>${run.rows.map(r =>
  `<tr class="${r.review ? 'review' : r.verdict}"><td>${esc(r.id)} ${esc(r.title)}${r.video ? ` <a href="${esc(r.video)}">영상</a>` : ''}</td><td>${r.severity}</td><td>${mark[r.verdict] ?? r.verdict}</td><td><code>${esc(r.reason ?? JSON.stringify(r.evidence))}</code></td><td>${esc(aiText(r))}</td></tr>`).join('')}</table>`;
const count = (run, f) => run.rows.filter(f).length;

const sections = Object.entries(SCENARIOS).map(([key, s]) => {
  const runs = history[key] ?? [];
  if (!runs.length) return '';
  const [latest, ...older] = runs;
  const asExpected = latest.decision === s.expect;
  return `<section><h2>${s.name} <span class="${latest.decision}">${latest.decision}</span> <small>기대 ${s.expect} · ${asExpected ? '기대대로' : '기대와 다름'}</small></h2>
<p>${esc(s.about)}</p>
<p class="meta">커밋 ${esc(latest.commit)} · ${esc(latest.runAt)} · AI ${esc(latest.aiModel)} · 통과 ${count(latest, r => r.verdict === 'pass')} / 실패 ${count(latest, r => r.verdict === 'fail')} / AI 원인 분류: 제품 결함 ${count(latest, r => r.ai?.cause === 'product')}, 테스트 문제 ${count(latest, r => r.ai?.cause === 'test')}, 환경 문제 ${count(latest, r => r.ai?.cause === 'environment')} · 코드와 AI 판정 불일치 ${count(latest, r => r.review)}</p>
${table(latest)}
${older.length ? `<details><summary>이전 실행 ${older.length}회</summary>${older.map(o => `<h3>${o.decision} · ${esc(o.commit)} · ${esc(o.runAt)}</h3>${table(o)}`).join('')}</details>` : ''}</section>`;
}).join('');

fs.writeFileSync('out/site/index.html', `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI Verification Gate</title>
<style>body{font:14px system-ui;margin:24px auto;max-width:1300px;padding:0 16px;color:#1f2328}table{border-collapse:collapse;width:100%;margin:8px 0 24px;display:block;overflow-x:auto}td,th{border:1px solid #d0d7de;padding:4px 8px;text-align:left;vertical-align:top}
.Go{color:#1a7f37}.No-Go{color:#cf222e}.fail,.unverified,.not-run{background:#fff1f0}.review{background:#fff8c5}code{font-size:12px;word-break:break-all}.meta{color:#57606a}section{margin-bottom:40px}</style>
<h1>판정 이력</h1>
<p>같은 검증 기준(<code>criteria/*.yaml</code>)을 세 가지 상황에 돌린 결과입니다. 배포 판정은 규칙(blocker 실패·미판정·코드와 AI 판정 불일치면 No-Go)이 내리고, AI는 기준 문장과 근거만 보고 따로 판정하며 실패 원인을 분류합니다. 노란 줄은 코드와 AI 판정이 달라 사람 검토가 필요한 기준입니다.</p>
${sections}`);
console.log('site:', Object.keys(history).map(k => `${k}=${history[k][0]?.decision}`).join(' '));
