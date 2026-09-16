import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import cesium from "vite-plugin-cesium";

const appEntry = fileURLToPath(new URL("./app.html", import.meta.url));
const serveCockpitAtRoot = {
  name: "serve-cockpit-at-root",
  configureServer(server) {
    server.middlewares.use((request, _response, next) => {
      if (request.url === "/") request.url = "/app.html";
      next();
    });
  },
  configurePreviewServer(server) {
    server.middlewares.use((request, _response, next) => {
      if (request.url === "/") request.url = "/app.html";
      next();
    });
  },
};

export default defineConfig({
  plugins: [serveCockpitAtRoot, cesium()],
  resolve: { dedupe: ["cesium"] },
  server: { fs: { deny: [".env", ".env.*", "**/.git/**", "**/ENVIRONMENT"] } },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: { input: appEntry },
  },
});
