import {build} from 'esbuild'

// Bundle electron main process + backend into a single file
await build({
    entryPoints: ['main.ts', 'preload.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    outdir: 'dist',
    external: ['electron', '@node-rs/crc32'],
    banner: {
        // Needed for ESM compatibility with __dirname/__filename in bundled code
        js: `
import {createRequire as __createRequire} from 'node:module';
import {fileURLToPath as __fileURLToPath} from 'node:url';
import {dirname as __dirname_fn} from 'node:path';
const require = __createRequire(import.meta.url);
const __filename = __fileURLToPath(import.meta.url);
const __dirname = __dirname_fn(__filename);
`.trim(),
    },
})

console.log('Electron build complete')
