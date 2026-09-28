#!/usr/bin/env bash
# 대리 등록을 여러 번 나눠 돌린다.
#
# jimp 이미지 변형이 이미지를 통째로 메모리에 펼쳐서, 한 프로세스를 오래 돌리면
# 시스템 메모리가 바닥나 강제 종료된다(실측: 500건 근처에서 OOM kill).
# 회차마다 프로세스를 새로 띄워 메모리를 비운다.
# 회차 한도는 150건 — 이 PC에서 300건은 회차 중간에 OOM 으로 죽는다(실측 2026-09-27). 기등록분은 시작할 때 한 번에 읽어
# 즉시 건너뛰므로 재시작 비용이 거의 없다.
#
# 사용: bash run-bulk-loop.sh [회차수] [계정당상한]
#   예) bash run-bulk-loop.sh 20 250   → 계정당 250건이 될 때까지 20회차까지 돌린다
ROUNDS="${1:-20}"
PER_ACCOUNT="${2:-0}"

for i in $(seq 1 "$ROUNDS"); do
  echo ""
  echo "================== 회차 $i / $ROUNDS =================="
  node --expose-gc test-bulk-run.mjs --live --products=600 --limit=150 --per-account="$PER_ACCOUNT"
  code=$?
  if [ $code -ne 0 ]; then
    echo "회차 $i 종료코드 $code — 중단합니다."
    break
  fi
done

echo ""
echo "전체 종료. 중복 확인은 아래 명령으로:"
echo '  node test-registration-report.mjs'
