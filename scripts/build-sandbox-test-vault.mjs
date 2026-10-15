import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.resolve(
	ROOT,
	process.argv[2] ?? 'dist/Charted-Roots-Sandbox-Test-Vault'
);

await rm(TARGET, { recursive: true, force: true });
await mkdir(TARGET, { recursive: true });

// This is the exact static vault used by the Real Obsidian E2E harness.
// Keeping these fixtures permanent means manual testing and CI start from
// the same Cao Cao / Xun Yu / Guo Jia Historical relationship data.
await cp(path.join(ROOT, 'tests/e2e/vault'), TARGET, { recursive: true });

const pluginDir = path.join(TARGET, '.obsidian/plugins/charted-roots');
await mkdir(pluginDir, { recursive: true });
for (const file of ['main.js', 'manifest.json', 'styles.css']) {
	await cp(path.join(ROOT, file), path.join(pluginDir, file));
}

// Let the plugin derive the same legacy Default Workspace that the E2E harness
// uses: root "Charted Roots", id/name "default"/"Default".
await writeFile(
	path.join(TARGET, '.obsidian/community-plugins.json'),
	JSON.stringify(['charted-roots'], null, 2)
);
await writeFile(
	path.join(TARGET, '.obsidian/app.json'),
	JSON.stringify({
		showInlineTitle: true,
		alwaysUpdateLinks: true
	}, null, 2)
);

await writeFile(
	path.join(TARGET, 'HISTORICAL-MANUAL-TEST.md'),
	[
		'# Historical Family Chart 手工验收',
		'',
		'这份 Vault 与 Real Obsidian smoke 使用同一套静态 `tests/e2e/vault` 数据。',
		'',
		'## 197 CE / Depth 2',
		'',
		'1. 打开 Family Chart。',
		'2. 通过搜索选择“曹操”。',
		'3. Mode 切到 Historical。',
		'4. Historical 时间输入 `197 CE`。',
		'5. Depth 选择 2。',
		'6. 关系选择“全部关系”。',
		'',
		'应看到：',
		'',
		'- 结构层：曹嵩、曹操；',
		'- Historical Depth 1：荀彧；',
		'- Historical Depth 2：郭嘉；',
		'- 曹操—荀彧 ally_of；',
		'- 荀彧 → 郭嘉 recommends。',
		'',
		'静态夹具位于：',
		'',
		'- `Charted Roots/People/Xun-Yu-Historical-Lane-E2E.md`',
		'- `Charted Roots/People/Guo-Jia-Historical-Lane-E2E.md`',
		'- `Charted Roots/Assertions/Cao-Cao-Xun-Yu-Historical-Lane-E2E.md`',
		'- `Charted Roots/Assertions/Xun-Yu-Guo-Jia-Historical-Lane-E2E.md`',
		'',
		'切到 201 CE 后，上述 Historical 扩展应退出，但曹嵩→曹操家谱结构保留。'
	].join('\n')
);

console.log(`Ready-to-open Sandbox test vault: ${TARGET}`);
