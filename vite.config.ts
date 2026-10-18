import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [tanstackStart(), react()],
    server: {
      host: "0.0.0.0",
      port: Number(env.WEB_PORT || 5173),
      proxy: {
        "/api": {
          target: `http://127.0.0.1:${env.RADAR_API_PORT || env.PORT || 3001}`,
          changeOrigin: false,
        },
      },
    },
  };
});
