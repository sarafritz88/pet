const path = require('path');
const fs = require('fs');
const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

// Copy native deps into the packaged app's node_modules so require('uiohook-napi') resolves.
// @electron/packager only supports extraResource (string[]), which copies to resources/ root,
// not into the app dir. afterCopy runs with buildPath = the app dir (resources/app).
function copyNativeModules(buildPath, _electronVersion, _platform, _arch, callback) {
  const destDir = path.join(buildPath, 'node_modules');
  const src = path.join(__dirname, 'node_modules');
  try {
    fs.mkdirSync(destDir, { recursive: true });
    fs.cpSync(path.join(src, 'uiohook-napi'), path.join(destDir, 'uiohook-napi'), {
      recursive: true,
    });
    fs.cpSync(path.join(src, 'node-gyp-build'), path.join(destDir, 'node-gyp-build'), {
      recursive: true,
    });
  } catch (err) {
    return callback(err);
  }
  callback();
}

module.exports = {
  packagerConfig: {
    asar: false,
    // Platform packagers pick the right extension automatically:
    // macOS → assets/icon.icns, Windows → assets/icon.ico, Linux → assets/icon.png
    icon: 'assets/icon',
    // Vite plugin only packages .vite/ output; node_modules are not included.
    // afterCopy puts uiohook-napi + node-gyp-build in app/node_modules/ so Node
    // finds them when resolving from app/.vite/build/index.js.
    afterCopy: [copyNativeModules],
  },
  // uiohook-napi ships N-API prebuilts (prebuilds/win32-x64/node.napi.node)
  // that are ABI-stable and work with Electron without recompilation.
  // Rebuilding from source corrupts the prebuilt, so we skip it entirely.
  rebuildConfig: { onlyModules: [] },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        setupIcon: 'assets/icon.ico',
        // Name of the generated setup exe (spaces not allowed here)
        setupExe: 'DesktopPetSetup.exe',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-vite',
      config: {
        build: [
          {
            entry: 'src/main/index.js',
            config: 'vite.main.config.mjs',
            target: 'main',
          },
          {
            entry: 'src/main/preload.js',
            config: 'vite.preload.config.mjs',
            target: 'preload',
          },
        ],
        renderer: [
          {
            name: 'main_window',
            config: 'vite.renderer.config.mjs',
          },
        ],
      },
    },
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      // These two fuses require asar — disabled since asar is off
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
      [FuseV1Options.OnlyLoadAppFromAsar]: false,
    }),
  ],
};
