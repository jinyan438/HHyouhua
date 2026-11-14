import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { isManagedPath } from '../updater-core.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = {};
function walk(dir, relative = '') {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
		const name = relative ? relative + '/' + entry.name : entry.name;
		if (!isManagedPath(name)) continue;
		if (entry.isDirectory()) walk(path.join(dir, entry.name), name);
		else if (entry.isFile()) {
			const data = fs.readFileSync(path.join(dir, entry.name));
			files[name] = createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
		}
	}
}
walk(root);
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'info.json'), 'utf8'));
fs.writeFileSync(path.join(root, 'update-manifest.json'), JSON.stringify({ schema: 1, version, files }, null, '\t') + '\n');
console.log(`Update manifest: ${Object.keys(files).length} files, version ${version}`);
