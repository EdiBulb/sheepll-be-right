import { defineConfig } from 'vite';
// server/src/shared.ts 를 클라이언트에서도 그대로 쓰기 때문에 상위 폴더 읽기를 허용
export default defineConfig({ server: { fs: { allow: ['..'] } } });
