import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [sveltekit()],
  server: { port: 32524 },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
