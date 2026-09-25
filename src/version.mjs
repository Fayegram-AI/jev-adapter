import manifest from '../package.json' with { type: 'json' };

/** CLI and SDK metadata always identify the installed package version. */
export const VERSION = manifest.version;
