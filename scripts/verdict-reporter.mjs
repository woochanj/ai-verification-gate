// 테스트 결과를 검증 기준 단위의 판정으로 바꿔 out/verdicts.json에 쓴다.
// 테스트 제목의 [C-XXX-00]이 기준 id다. 판정 근거는 테스트가 붙인 'evidence' 첨부와 실패 메시지다.
import fs from 'node:fs';

const VERDICT = { passed: 'pass', failed: 'fail', timedOut: 'fail', interrupted: 'fail', skipped: 'not-run' };

export default class VerdictReporter {
  results = [];

  onTestEnd(test, result) {
    const id = test.title.match(/\[(C-[A-Z]+-\d+)\]/)?.[1];
    if (!id) return;
    const ev = result.attachments.find(a => a.name === 'evidence');
    this.results.push({
      id,
      verdict: VERDICT[result.status],
      evidence: ev?.body ? JSON.parse(ev.body.toString()) : null,
      reason: result.status === 'skipped'
        ? test.annotations.find(a => a.type === 'skip')?.description ?? null
        : result.errors[0]?.message?.replace(/\u001b\[\d+m/g, '').split('\n')[0] ?? null,
      screenshot: result.attachments.find(a => a.name === 'screenshot')?.path ?? null,
      durationMs: result.duration,
    });
  }

  onEnd() {
    fs.mkdirSync('out', { recursive: true });
    fs.writeFileSync('out/verdicts.json', JSON.stringify({
      runAt: new Date().toISOString(),
      commit: process.env.GITHUB_SHA?.slice(0, 7) ?? 'local',
      results: this.results,
    }, null, 2));
  }
}
