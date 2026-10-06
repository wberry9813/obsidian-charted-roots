import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchObsidian } from './obsidian-harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VAULT = path.join(HERE, 'vault');
const ARTIFACTS = path.join(HERE, 'artifacts');

test('Charted Roots v2 foundation loads in real Obsidian', async (t) => {
	await mkdir(ARTIFACTS, { recursive: true });
	const session = await launchObsidian({ vault: VAULT });
	t.after(async () => session.close());

	const summary = await session.evalInApp(`
		const person = app.vault.getAbstractFileByPath('People/Cao-Cao.md');
		const office = app.vault.getAbstractFileByPath('Offices/Chancellor.md');
		const assertion = app.vault.getAbstractFileByPath('Assertions/Cao-Cao-Chancellor.md');

		if (!person || !office || !assertion) {
			throw new Error('One or more v2 fixture notes are missing from the vault.');
		}

		const personFm = app.metadataCache.getFileCache(person)?.frontmatter ?? {};
		const officeFm = app.metadataCache.getFileCache(office)?.frontmatter ?? {};
		const assertionFm = app.metadataCache.getFileCache(assertion)?.frontmatter ?? {};

		await app.workspace.getLeaf(false).openFile(person);

		return {
			pluginLoaded: !!app.plugins.plugins['charted-roots'],
			fileCount: app.vault.getMarkdownFiles().length,
			person: {
				cr_schema: personFm.cr_schema,
				cr_type: personFm.cr_type,
				cr_id: personFm.cr_id,
				name: personFm.name
			},
			office: {
				cr_schema: officeFm.cr_schema,
				cr_type: officeFm.cr_type,
				cr_id: officeFm.cr_id,
				name: officeFm.name
			},
			assertion: {
				cr_schema: assertionFm.cr_schema,
				cr_type: assertionFm.cr_type,
				assertion_type: assertionFm.assertion_type,
				predicate: assertionFm.predicate,
				time_start: assertionFm.time_start
			}
		};
	`);

	assert.equal(summary.pluginLoaded, true);
	assert.equal(summary.person.cr_schema, 2);
	assert.equal(summary.person.cr_type, 'person');
	assert.equal(summary.person.cr_id, 'person-cao-cao');
	assert.equal(summary.office.cr_type, 'office');
	assert.equal(summary.assertion.cr_type, 'assertion');
	assert.equal(summary.assertion.assertion_type, 'office_holding');
	assert.equal(summary.assertion.predicate, 'holds_office');
	assert.equal(summary.assertion.time_start, '建安十三年');

	await session.screenshot(path.join(ARTIFACTS, 'v2-foundation-smoke.png'));
	await writeFile(
		path.join(ARTIFACTS, 'v2-foundation-smoke.json'),
		JSON.stringify(summary, null, 2)
	);
});
