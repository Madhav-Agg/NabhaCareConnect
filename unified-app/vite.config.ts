import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: true,
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
      // Video-call signalling. The socket.io client is created with a relative
      // URL (`io({...})`), so in development it dials the Vite origin; without
      // this entry the handshake never reaches the backend on :5000 and the
      // doctor's incoming-call event can never fire. `ws: true` is what makes
      // Vite upgrade the connection rather than treating it as HTTP.
      "/socket.io": {
        target: "http://localhost:5000",
        ws: true,
        changeOrigin: true,
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

