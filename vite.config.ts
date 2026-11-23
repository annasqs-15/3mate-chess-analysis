import { defineConfig } from 'vite';

const buildId = `build-${Date.now()}`;

export default defineConfig({
  base: './',
  define: {
    __3MATE_BUILD_ID__: JSON.stringify(buildId),
  },
  plugins: [
    {
      name: '3mate-build-version',
      configureServer(server) {
        server.middlewares.use('/version.json', (_request, response) => {
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          response.setHeader('Pragma', 'no-cache');
          response.end(JSON.stringify({ buildId }));
        });
      },
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ buildId }),
        });
      },
    },
  ],
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
  },
});
