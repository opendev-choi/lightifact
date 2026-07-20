# 의존성이 0개라 빌드 스텝 없이 런타임 이미지 하나면 충분
FROM node:22-alpine

WORKDIR /app
COPY server.mjs package.json ./

# artifact 저장 위치 (k8s에서는 PVC를 여기에 마운트)
ENV PORT=4321
VOLUME ["/app/data"]
EXPOSE 4321

CMD ["node", "server.mjs"]
