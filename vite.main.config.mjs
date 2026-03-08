import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // uiohook-napi is a native (.node) module — it cannot be bundled
      external: ['uiohook-napi'],
      output: {
        // In production, uiohook-napi is copied to resources/node_modules/ via
        // extraResources. Node's module resolver won't walk above resources/app/
        // by default in packaged Electron, so we explicitly register the path
        // in Module.globalPaths before any require('uiohook-napi') executes.
        banner: `;(function(){if(process.resourcesPath){var M=require('module'),p=require('path'),x=p.join(process.resourcesPath,'node_modules');if(!M.globalPaths.includes(x))M.globalPaths.push(x);}})();`,
      },
    },
  },
});
