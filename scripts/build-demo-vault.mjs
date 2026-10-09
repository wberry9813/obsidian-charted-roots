import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.resolve(
	ROOT,
	process.argv[2] ?? 'dist/Charted-Roots-Demo-Vault'
);

async function copyJson(source, target) {
	const raw = await readFile(path.join(ROOT, source), 'utf8');
	JSON.parse(raw);
	await writeFile(path.join(TARGET, target), raw);
}

await rm(TARGET, { recursive: true, force: true });
await mkdir(TARGET, { recursive: true });
await cp(path.join(ROOT, 'demo/vault'), TARGET, { recursive: true });

const pluginDir = path.join(TARGET, '.obsidian/plugins/charted-roots');
await mkdir(pluginDir, { recursive: true });
for (const file of ['main.js', 'manifest.json', 'styles.css']) {
	await cp(path.join(ROOT, file), path.join(pluginDir, file));
}

await mkdir(path.join(TARGET, '.charted-roots'), { recursive: true });
await copyJson('demo/config/workspaces.json', '.charted-roots/workspaces.json');
await copyJson('demo/config/plugin-data.json', '.obsidian/plugins/charted-roots/data.json');
await copyJson('demo/config/community-plugins.json', '.obsidian/community-plugins.json');

await writeFile(
	path.join(TARGET, '.obsidian/app.json'),
	JSON.stringify({
		showInlineTitle: true,
		alwaysUpdateLinks: true
	}, null, 2)
);

console.log(`Ready-to-open demo vault: ${TARGET}`);
