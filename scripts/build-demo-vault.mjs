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

// Showcase media fixtures and real import fixtures.
const mediaTarget = path.join(TARGET, '示例/林氏家族/Media');
await mkdir(mediaTarget, { recursive: true });
for (const [sourceName, targetName] of [
	['anderson_family_1990.jpg', '林家1990家庭合影-演示.jpg'],
	['james_anderson_portrait.jpg', '林国梁肖像-演示.jpg'],
	['linda_martinez_photo.jpg', '张淑芬肖像-演示.jpg'],
	['david_anderson_graduation.jpg', '林晨毕业照-演示.jpg'],
	['james_birth_certificate.pdf', '林晨出生证明-演示.pdf'],
	['anderson_martinez_marriage.pdf', '林晨婚姻证明-演示.pdf']
]) {
	await cp(path.join(ROOT, 'tests/fixtures/gedcom/media-sample', sourceName), path.join(mediaTarget, targetName));
}

const importTarget = path.join(TARGET, '实验台/导入样例');
await mkdir(importTarget, { recursive: true });
for (const [source, targetName] of [
	['tests/fixtures/gedcom/gedcom-sample-small-full.ged', 'GEDCOM-完整小型家谱.ged'],
	['tests/fixtures/gedcom/gedcom-sample-small-remarriage.ged', 'GEDCOM-再婚家庭.ged'],
	['tests/fixtures/gedcom/gedcom-sample-small-media.ged', 'GEDCOM-含媒体.ged'],
	['tests/fixtures/gedcom/gedcom-sample-duplicates-27.ged', 'GEDCOM-重复项测试.ged'],
	['tests/fixtures/gramps/gramps-app-export-test10-small.gpkg', 'Gramps-小型样例.gpkg']
]) {
	await cp(path.join(ROOT, source), path.join(importTarget, targetName));
}
await writeFile(
	path.join(TARGET, '.obsidian/app.json'),
	JSON.stringify({
		showInlineTitle: true,
		alwaysUpdateLinks: true
	}, null, 2)
);

console.log(`Ready-to-open demo vault: ${TARGET}`);
