import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // The browser talks to the BFF only; the Go engine stays behind it, as in docs/architecture.md.
    proxy: { "/v1": "http://127.0.0.1:3000" },
  },
});
