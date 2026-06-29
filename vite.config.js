import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],
    base: "./",
    define: {
      "import.meta.env.SUPABASE_URL": JSON.stringify(env.SUPABASE_URL || ""),
      "import.meta.env.SUPABASE_PUBLISHABLE": JSON.stringify(env.SUPABASE_PUBLISHABLE || ""),
    },
  };
});
