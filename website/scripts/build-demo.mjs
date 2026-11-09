import { build } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Separate bundle: actual desktop components, without leaking their global CSS
// or bundling a second React runtime into Next. No desktop build is changed.
await build({
  configFile: false,
  root: fileURLToPath(new URL("../demo", import.meta.url)),
  base: "./",
  publicDir: false,
  plugins: [react()],
  resolve: { dedupe: ["react", "react-dom", "lucide-react"] },
  build: {
    outDir: fileURLToPath(new URL("../public/demo", import.meta.url)),
    emptyOutDir: true,
    target: "es2022",
  },
});
