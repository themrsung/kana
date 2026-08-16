import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Serve the kuromoji dictionary as opaque bytes.
 *
 * The IPADIC files are named `*.dat.gz`, and Vite's static middleware reads that
 * extension as "this response is transport-compressed" and sets
 * `Content-Encoding: gzip`. The browser then helpfully gunzips it before
 * kuromoji ever sees it, and kuromoji - which expects to do its own gunzipping -
 * fails with "invalid gzip data".
 *
 * The gzip here is the payload, not the transport, so these responses are served
 * by hand as application/octet-stream with no encoding claimed.
 */
function dictionaryAssets(): Plugin {
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    const name = (req.url ?? '').split('?')[0]?.replace(/^\//, '') ?? '';
    if (!/^[\w.-]+\.gz$/.test(name)) {
      next();
      return;
    }
    readFile(join(process.cwd(), 'public', 'dict', name)).then(
      (buf) => {
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Length', buf.byteLength);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.end(buf);
      },
      () => next(),
    );
  };

  return {
    name: 'kana:dictionary-assets',
    configureServer: (server) => void server.middlewares.use('/dict', handler),
    configurePreviewServer: (server) => void server.middlewares.use('/dict', handler),
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), dictionaryAssets()],
  build: {
    // pdf.js and the kuromoji runtime are both large and both lazy; warning
    // about them on every build is noise.
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
