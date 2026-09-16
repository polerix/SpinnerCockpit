import { defineConfig } from "vite";
import cesium from "vite-plugin-cesium";
export default defineConfig({
  plugins: [cesium()],
  resolve: { dedupe: ["cesium"] },
  server: { fs: { deny: [".env", ".env.*", "**/.git/**", "**/ENVIRONMENT"] } },
  build: { chunkSizeWarningLimit: 1500 },
});
