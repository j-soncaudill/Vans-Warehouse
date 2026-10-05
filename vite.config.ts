/// <reference types="vitest/config" />
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const root = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(root, "dist");

/** Cloudflare Pages SPA fallback. Must stay exactly this one line. */
const REDIRECTS = "/*    /index.html    200\n";

function pagesFiles(): Plugin {
  return {
    name: "vans-warehouse-pages",
    apply: "build",
    closeBundle() {
      writeFileSync(path.join(distDir, "_redirects"), REDIRECTS);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, "");
  const pin = (env.VITE_SHOP_PIN ?? "").trim();
  if (!pin && mode === "production") {
    console.warn(
      "\n[vans-warehouse] VITE_SHOP_PIN is empty. The unlock screen will only accept a PIN hash stored in the settings table.\n",
    );
  }
  // Only the hash ships to the browser. Client code never reads VITE_SHOP_PIN.
  const pinHash = pin ? createHash("sha256").update(pin, "utf8").digest("hex") : "";

  return {
    base: "/",
    envPrefix: ["VITE_SUPABASE_"],
    define: {
      __SHOP_PIN_HASH__: JSON.stringify(pinHash),
    },
    resolve: {
      alias: { "@": path.join(root, "src") },
    },
    plugins: [tailwindcss(), react(), pagesFiles()],
    build: {
      outDir: distDir,
      emptyOutDir: true,
      assetsDir: "",
      // Inline the logo and any other small asset so dist stays four files.
      assetsInlineLimit: 200_000,
      cssCodeSplit: false,
      sourcemap: false,
      modulePreload: false,
      chunkSizeWarningLimit: 2000,
      rolldownOptions: {
        output: {
          entryFileNames: "app.js",
          chunkFileNames: "app-[name].js",
          assetFileNames: (info: { names?: string[] }) =>
            (info.names ?? []).some((n) => n.endsWith(".css")) ? "app.css" : "[name][extname]",
          inlineDynamicImports: true,
        },
      },
    },
    test: {
      include: ["src/**/*.test.ts"],
    },
  };
});
