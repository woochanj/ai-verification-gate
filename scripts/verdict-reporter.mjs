// 테스트 결과를 검증 기준 단위의 판정으로 바꿔 out/verdicts.json에 쓴다.
// 테스트 제목의 [C-XXX-00]이 기준 id다. 판정 근거는 테스트가 붙인 'evidence' 첨부와 실패 메시지다.
import fs from 'node:fs';
import path from 'node:path';

const VERDICT = { passed: 'pass', failed: 'fail', timedOut: 'fail', interrupted: 'fail', skipped: 'not-run' };

export default class VerdictReporter {
  results = [];

  onTestEnd(test, result) {
    const id = test.title.match(/\[(C-[A-Z0-9]+-\d+)\]/)?.[1];
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
      video: this.keepVideo(id, result.attachments.find(a => a.name === 'video')?.path),
      durationMs: result.duration,
    });
  }

  // 영상은 판정 이력 페이지에서 바로 볼 수 있게 out/videos/<기준 id>.webm으로 복사한다.
  keepVideo(id, src) {
    if (!src || !fs.existsSync(src)) return null;
    fs.mkdirSync('out/videos', { recursive: true });
    fs.copyFileSync(src, path.join('out/videos', `${id}.webm`));
    return `videos/${id}.webm`;
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
