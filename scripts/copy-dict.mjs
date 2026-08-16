/**
 * Stage the kuromoji dictionary as static assets.
 *
 * IPADIC is ~17 MB of .dat.gz that the browser fetches at runtime. It is a
 * build input, not source, so it is copied out of node_modules into public/
 * rather than committed - see .gitignore. Runs from `predev` and `prebuild`,
 * and no-ops when the files are already in place.
 */
import { cp, mkdir, readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'node_modules', '@sglkc', 'kuromoji', 'dict');
const to = join(root, 'public', 'dict');

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(from))) {
  console.error(`copy-dict: ${from} is missing - run npm install first.`);
  process.exit(1);
}

const sources = await readdir(from);
if (await exists(to)) {
  const staged = await readdir(to);
  if (sources.every((name) => staged.includes(name))) {
    console.log(`copy-dict: ${staged.length} files already staged.`);
    process.exit(0);
  }
}

await mkdir(to, { recursive: true });
await cp(from, to, { recursive: true });
console.log(`copy-dict: staged ${sources.length} dictionary files into public/dict.`);
