/**
 * 공통 풀(pull) 루프 — CLI(cloud-worker.mjs)와 Electron 데스크톱 앱이 공유.
 *
 * claim(RPC) → 원본 다운로드 → ComfyUI 생성 → Storage 업로드 → done 처리.
 * 로깅/진행 표시는 onEvent 콜백으로 위임하고, signal(AbortSignal)로 중단한다.
 */

import { randomUUID } from 'node:crypto';
import * as comfy from './comfyui-client.mjs';
import { rpc, patchRow, uploadToStorage } from './supabase-rest.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {object} o
 * @param {import('./supabase-rest.mjs').Session} o.session
 * @param {string} o.comfyUrl
 * @param {object} o.workflow            API-format 워크플로 그래프
 * @param {string} o.defaultPositive
 * @param {string} o.defaultNegative
 * @param {number} o.timeoutMs           장당 타임아웃
 * @param {number} o.pollMs              pending 없을 때 폴링 간격
 * @param {string} o.workerId
 * @param {string} [o.hostname]          하트비트에 표시할 PC 이름
 * @param {number} [o.maxJobs=Infinity]
 * @param {boolean} [o.once=false]       pending 비면 종료
 * @param {AbortSignal} [o.signal]
 * @param {(e: object) => void} [o.onEvent]
 * @param {(buf: Buffer, job: object) => Promise<Buffer>} [o.processImage]
 *        원본 버퍼 → 결과 버퍼 변환기. 지정하면 ComfyUI 대신 이걸 사용한다(데스크탑: 누끼+흰배경 합성).
 *        미지정이면 기존 ComfyUI 생성 경로 사용(클라우드 워커는 무의존성 유지).
 * @returns {Promise<{processed:number, ok:number, fail:number}>}
 */
export async function runPullLoop({
  session, comfyUrl, workflow, defaultPositive, defaultNegative,
  timeoutMs, pollMs, workerId, hostname, appVersion, maxJobs = Infinity, once = false, signal, onEvent = () => {},
  processImage,
}) {
  const stopped = () => signal?.aborted;
  let processed = 0, ok = 0, fail = 0;
  let idleLogged = false;

  // 30초 주기 하트비트 — 웹의 "워커 연결됨" 표시용. 실패해도 루프엔 영향 없음.
  let lastBeat = 0;
  const beat = async () => {
    if (Date.now() - lastBeat < 30_000) return;
    lastBeat = Date.now();
    // p_app_version 은 서버가 "이 사용자가 구버전을 쓰는 중"을 실제로 감지하는 근거.
    // 서버 함수가 아직 3인자로 안 올라갔어도 DEFAULT 라 2인자 호출과 호환된다.
    try { await rpc(session, 'worker_heartbeat', { p_worker_id: workerId, p_hostname: hostname || workerId, p_app_version: appVersion ?? null }); }
    catch { /* ignore */ }
  };
  await beat();

  while (processed < maxJobs && !stopped()) {
    await beat();
    let jobs;
    try {
      jobs = await rpc(session, 'claim_thumbnail_jobs', { p_worker_id: workerId, p_limit: 1 });
    } catch (e) {
      onEvent({ type: 'warn', message: `claim 실패(재시도): ${e.message}` });
      await sleep(pollMs);
      continue;
    }

    if (!jobs || jobs.length === 0) {
      if (once) break;
      if (!idleLogged) { onEvent({ type: 'idle' }); idleLogged = true; }
      await sleep(pollMs);
      continue;
    }
    idleLogged = false;

    for (const job of jobs) {
      if (processed >= maxJobs || stopped()) break;
      processed++;
      const label = job.product_code || job.label || job.id.slice(0, 8);
      onEvent({ type: 'claimed', jobId: job.id, label, processed });
      try {
        const res = await fetch(job.source_url, { signal });
        if (!res.ok) throw new Error(`원본 다운로드 ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());

        const out = processImage
          ? await processImage(buf, job)
          : await comfy.generateThumbnail(comfyUrl, {
              imageBuffer: buf,
              inputName: `coupang_in_${job.id}.png`,
              workflow,
              positivePrompt: job.prompt || defaultPositive,
              negativePrompt: job.negative_prompt || defaultNegative,
              timeoutMs,
            });

        const path = `megaload/${job.megaload_user_id}/thumbnails/${randomUUID()}.png`;
        const url = await uploadToStorage(session, 'product-images', path, out, 'image/png');
        await patchRow(session, 'megaload_thumbnail_jobs', `id=eq.${job.id}`, {
          status: 'done', result_url: url, completed_at: new Date().toISOString(), error_message: null,
        });
        ok++;
        onEvent({ type: 'done', jobId: job.id, label, url, sizeKb: Math.round(out.length / 1024), ok, fail, processed });
      } catch (e) {
        if (stopped()) { onEvent({ type: 'stopped' }); break; }
        fail++;
        onEvent({ type: 'error', jobId: job.id, label, message: e.message, ok, fail, processed });
        try {
          await patchRow(session, 'megaload_thumbnail_jobs', `id=eq.${job.id}`, {
            status: 'error', error_message: String(e.message).slice(0, 500), completed_at: new Date().toISOString(),
          });
        } catch (e2) { onEvent({ type: 'warn', message: `오류 기록 실패: ${e2.message}` }); }
      }
    }
  }

  onEvent({ type: 'finished', processed, ok, fail });
  return { processed, ok, fail };
}
