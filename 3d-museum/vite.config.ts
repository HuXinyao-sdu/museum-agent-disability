import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

// 多页面应用：index.html 为国风首页，hall.html 为 3D 展厅。
export default defineConfig({
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        hall: fileURLToPath(new URL("./hall.html", import.meta.url)),
        games: fileURLToPath(new URL("./games.html", import.meta.url)),
      },
    },
  },
});
