# 배포 실체와 일치시킨 Dockerfile.
#
# 이전 Dockerfile 은 TypeScript(Hono) 소스를 빌드해 /app/dist/index.js 를 만들었지만,
# 실제로 돌고 있던 것은 의존성 없는 단일 /app/server.js 였다(2026-04-27 이후).
# 로컬 소스와 배포본이 갈라진 상태여서 로컬 기준으로 배포하면 돌아가던 서버가
# 다른 구현으로 교체될 뻔했다. 배포본을 레포로 흡수하고 이 파일을 실체에 맞춘다.
#
# 의존성은 Node 내장 모듈뿐이라 npm install 이 필요 없다.
# (src/, tsconfig.json, package.json 은 쓰이지 않는 옛 소스 — COPY 하지 않는다.)
FROM node:20-alpine
WORKDIR /app
COPY server.js .
EXPOSE 8080
CMD ["node", "server.js"]
