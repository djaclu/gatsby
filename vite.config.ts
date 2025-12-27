import { defineConfig } from "vite";
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

// Plugin to copy assets, fonts, and style.css to dist
function copyAssetsPlugin() {
  return {
    name: "copy-assets",
    writeBundle() {
      const distDir = "dist";
      const assetsDir = join(distDir, "assets");
      const fontsDir = join(distDir, "fonts");

      // Recursively copy assets folder (including subdirectories)
      function copyRecursive(src: string, dest: string) {
        if (!existsSync(src)) return;

        if (statSync(src).isDirectory()) {
          if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
          const files = readdirSync(src);
          files.forEach((file) => {
            copyRecursive(join(src, file), join(dest, file));
          });
        } else {
          copyFileSync(src, dest);
        }
      }

      // Copy assets folder (recursively)
      copyRecursive("assets", assetsDir);

      // Copy fonts folder
      if (existsSync("fonts")) {
        if (!existsSync(fontsDir)) mkdirSync(fontsDir, { recursive: true });
        const files = readdirSync("fonts");
        files.forEach((file) => {
          const src = join("fonts", file);
          const dest = join(fontsDir, file);
          if (statSync(src).isFile()) {
            copyFileSync(src, dest);
          }
        });
      }

      // Copy style.css
      if (existsSync("style.css")) {
        copyFileSync("style.css", join(distDir, "style.css"));
      }
    },
  };
}

export default defineConfig({
  plugins: [copyAssetsPlugin()],
  server: {
    // Exclude API folder from being served by Vite
    // API routes should only work with Vercel dev or in production
    fs: {
      deny: ["./api"],
    },
  },
  publicDir: false, // We handle public assets manually
});
