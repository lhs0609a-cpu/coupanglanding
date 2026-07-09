// 광고 자동화 패널 — 셸이 new Function('root','api', this) 로 실행. root, api 주입됨.
const $ = (id) => root.querySelector('#' + id);
const logEl = $('ads-log');
const logLine = (m) => { logEl.textContent += `${new Date().toLocaleTimeString()}  ${m}\n`; logEl.scrollTop = logEl.scrollHeight; };
const msg = (m) => { $('ads-msg').textContent = m; };

$('ads-capture-open').onclick = async () => {
  msg('윙 창을 여는 중... 로그인 후 광고 성과 리포트 화면까지 이동하세요.');
  try { await api.invoke('ads:capture-open'); } catch (e) { msg('❌ ' + e.message); }
};
$('ads-capture-save').onclick = async () => {
  try { const fp = await api.invoke('ads:capture-save'); msg('✅ 저장됨: ' + fp + ' — 이 파일을 전달해 주세요.'); }
  catch (e) { msg('❌ ' + e.message); }
};
$('ads-verify').onclick = async () => {
  msg('전체 기능 점검 중... (돈 지출·삭제·생성 안 함)');
  try { await api.invoke('ads:verify'); } catch (e) { msg('❌ ' + e.message); }
};
$('ads-run').onclick = async () => {
  if (!confirm('실제로 예산변경·OFF·삭제·캠페인등록을 수행합니다. 진행할까요?')) return;
  msg('평가 실행 중...');
  try { await api.invoke('ads:run-once'); } catch (e) { msg('❌ ' + e.message); }
};
$('ads-start').onclick = async () => {
  msg('자동 실행(6시간 주기) 시작... 규칙 모드에 따라 동작합니다.');
  try { await api.invoke('ads:start'); } catch (e) { msg('❌ ' + e.message); }
};
$('ads-stop').onclick = async () => {
  msg('자동 실행 중지');
  try { await api.invoke('ads:stop'); } catch (e) { msg('❌ ' + e.message); }
};
$('ads-auto').onchange = async (ev) => {
  try {
    const on = await api.invoke('ads:set-auto', { on: ev.target.checked });
    msg(on ? '✅ 앱 시작 시 자동 실행 켜짐' : '앱 시작 시 자동 실행 꺼짐');
  } catch (e) { msg('❌ ' + e.message); }
};
// 초기 상태 로드
(async () => {
  try { $('ads-auto').checked = !!(await api.invoke('ads:get-auto')); } catch { /* ignore */ }
})();

api.on('ads:event', (e) => {
  if (e.type === 'capture-saved') { msg('✅ 저장됨: ' + e.path + ' — 이 파일을 전달해 주세요.'); return; }
  if (e.type === 'verify-step') { logLine('[점검] ' + (e.ok ? '✅' : '❌') + ' ' + e.name + (e.detail ? ' — ' + e.detail : '')); return; }
  if (e.type === 'verify-done') { msg(`점검 완료: ${e.ok}/${e.total} 통과`); logLine(`[점검] 완료 ${e.ok}/${e.total}`); return; }
  if (e.message) msg(e.message);
  logLine('[광고] ' + (e.type + (e.message ? ' — ' + e.message : '')));
});
