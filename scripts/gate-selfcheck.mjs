// 게이트 판정 규칙 점검: 가짜 판정을 넣고 Go/No-Go가 규칙대로 나오는지 본다.  node scripts/gate-selfcheck.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const gate = path.resolve('scripts/gate.mjs');
const criteria = 'criteria:\n' + [['C-A-01', 'blocker'], ['C-A-02', 'minor']]
  .map(([id, s]) => `  - {id: ${id}, title: t, pass: p, fail: f, severity: ${s}}`).join('\n');

const decide = results => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-'));
  fs.mkdirSync(path.join(dir, 'criteria'));
  fs.mkdirSync(path.join(dir, 'out'));
  fs.writeFileSync(path.join(dir, 'criteria/c.yaml'), criteria);
  fs.writeFileSync(path.join(dir, 'out/verdicts.json'), JSON.stringify({ runAt: 'x', commit: 'x', results }));
  const r = spawnSync('node', [gate], { cwd: dir });
  return r.status === 0 ? 'Go' : 'No-Go';
};

const v = (id, verdict) => ({ id, verdict });
assert.equal(decide([v('C-A-01', 'pass'), v('C-A-02', 'pass')]), 'Go');
assert.equal(decide([v('C-A-01', 'pass'), v('C-A-02', 'fail')]), 'Go', 'minor 실패는 위험으로만 기록');
assert.equal(decide([v('C-A-01', 'fail'), v('C-A-02', 'pass')]), 'No-Go', 'blocker 실패는 배포를 막는다');
assert.equal(decide([v('C-A-01', 'not-run'), v('C-A-02', 'pass')]), 'No-Go', 'blocker 미판정도 막는다');
assert.equal(decide([v('C-A-02', 'pass')]), 'No-Go', 'blocker를 판정하는 테스트가 없으면 막는다');
const ai = (id, verdict, aiVerdict) => ({ id, verdict, ai: { verdict: aiVerdict } });
assert.equal(decide([ai('C-A-01', 'pass', 'fail'), v('C-A-02', 'pass')]), 'No-Go', 'blocker에서 코드와 AI 판정이 다르면 사람 검토 전까지 막는다');
assert.equal(decide([ai('C-A-01', 'pass', 'unknown'), v('C-A-02', 'pass')]), 'Go', 'AI가 판단 불가면 코드 판정을 따른다');
assert.equal(decide([v('C-A-01', 'pass'), ai('C-A-02', 'pass', 'fail')]), 'Go', 'minor 불일치는 위험으로만 기록');
console.log('gate selfcheck ok');
