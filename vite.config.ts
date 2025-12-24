import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// Plugin to copy assets, fonts, and style.css to dist
function copyAssetsPlugin() {
  return {
    name: 'copy-assets',
    writeBundle() {
      const distDir = 'dist';
      const assetsDir = join(distDir, 'assets');
      const fontsDir = join(distDir, 'fonts');

      // Copy assets folder
      if (existsSync('assets')) {
        if (!existsSync(assetsDir)) mkdirSync(assetsDir, { recursive: true });
        const files = readdirSync('assets');
        files.forEach(file => {
          const src = join('assets', file);
          const dest = join(assetsDir, file);
          if (statSync(src).isFile()) {
            copyFileSync(src, dest);
          }
        });
      }

      // Copy fonts folder
      if (existsSync('fonts')) {
        if (!existsSync(fontsDir)) mkdirSync(fontsDir, { recursive: true });
        const files = readdirSync('fonts');
        files.forEach(file => {
          const src = join('fonts', file);
          const dest = join(fontsDir, file);
          if (statSync(src).isFile()) {
            copyFileSync(src, dest);
          }
        });
      }

      // Copy style.css
      if (existsSync('style.css')) {
        copyFileSync('style.css', join(distDir, 'style.css'));
      }
    },
  };
}

export default defineConfig({
  plugins: [copyAssetsPlugin()],
});

