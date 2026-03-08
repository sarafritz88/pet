const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    // asar disabled: uiohook-napi is a native addon whose .node file cannot
    // be reliably loaded from inside an asar archive across platforms.
    // Without asar the files sit plain on disk and load without issues.
    asar: false,
    // Platform packagers pick the right extension automatically:
    // macOS → assets/icon.icns, Windows → assets/icon.ico, Linux → assets/icon.png
    icon: 'assets/icon',
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
