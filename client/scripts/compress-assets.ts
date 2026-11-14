import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { brotliCompressSync, constants } from 'node:zlib';

// Brotli's top quality is too slow to run per request but about 14% smaller than what the server manages on the fly,
// so the hashed bundles are compressed once here and the server sends the .br file to browsers that accept it.
const dir = 'dist/assets';
for (const name of readdirSync(dir)) {
  if (!/\.(js|css)$/.test(name)) continue;
  const path = `${dir}/${name}`;
  const compressed = brotliCompressSync(readFileSync(path), {
    params: { [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY },
  });
  writeFileSync(`${path}.br`, compressed);
}
