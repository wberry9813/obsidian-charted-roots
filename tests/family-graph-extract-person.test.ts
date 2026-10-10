/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- Obsidian API returns any-typed surfaces (frontmatter, file caches, plugin state); project policy accepts these. */
import { describe, expect, it } from 'vitest';
import { App, TFile, makeTFile } from 'obsidian';
import { FamilyGraphService } from '../src/core/family-graph';

/**
 * #489 — `FamilyGraphService.extractPersonNode` previously screened out a
 * known list of non-person `cr_type` values (source, event, place, etc.) and
 * treated everything else with a `cr_id` as a person. User-defined custom
 * `cr_type` values like `hex` or `faction` fell through every exclusion and
 * got coerced into people, surfacing in the Person notes browser.
 *
 * The fix adds an explicit `isPersonNote` inclusion check after the exclusion
 * list. This suite fences the regression.
 *
 * Reported by @Lemmeron with screenshots showing custom-typed notes (`0423`,
 * `3226`) appearing in the Control Center person browser.
 */

interface PrivateAccess {
	extractPersonNode: (file: TFile) => unknown;
}

function makeFile(path: string, basename: string): TFile {
	return makeTFile({ path, basename, extension: 'md' });
}

function makeService(): { service: FamilyGraphService; app: App } {
	const app = new App();
	const service = new FamilyGraphService(app);
	return { service, app };
}

function privates(service: FamilyGraphService): PrivateAccess {
	return service as unknown as PrivateAccess;
}

describe('FamilyGraphService.extractPersonNode — non-person cr_type rejection (#489)', () => {
	it('rejects notes with a custom non-person cr_type ("hex")', () => {
		const { service, app } = makeService();
		const file = makeFile('notes/0423.md', '0423');
		app.vault.files.set(file.path, file);
		app.metadataCache._setFrontmatter(file, {
			cr_id: 'abc-123-def-456',
			cr_type: 'hex',
		});

		expect(privates(service).extractPersonNode(file)).toBeNull();
	});

	it('rejects notes with a custom non-person cr_type ("faction")', () => {
		const { service, app } = makeService();
		const file = makeFile('notes/3226.md', '3226');
		app.vault.files.set(file.path, file);
		app.metadataCache._setFrontmatter(file, {
			cr_id: 'def-456-ghi-789',
			cr_type: 'faction',
		});

		expect(privates(service).extractPersonNode(file)).toBeNull();
	});

	it('returns the place sentinel for cr_type: place (existing exclusion behavior)', () => {
		const { service, app } = makeService();
		const file = makeFile('places/Tatooine.md', 'Tatooine');
		app.vault.files.set(file.path, file);
		app.metadataCache._setFrontmatter(file, {
			cr_id: 'plc-100-tat-200',
			cr_type: 'place',
		});

		const result = privates(service).extractPersonNode(file) as { isPlace?: boolean } | null;
		expect(result).not.toBeNull();
		expect(result?.isPlace).toBe(true);
	});

	it('keeps the Family Chart node set person-only when the vault mixes entity types', () => {
		const { service, app } = makeService();

		const fixtures = [
			{ path: 'people/Ada.md', basename: 'Ada', cr_id: 'person-ada', cr_type: 'person', name: 'Ada' },
			{ path: 'events/Battle.md', basename: 'Battle', cr_id: 'event-battle', cr_type: 'event', title: 'Battle' },
			{ path: 'sources/Chronicle.md', basename: 'Chronicle', cr_id: 'source-chronicle', cr_type: 'source', title: 'Chronicle' },
			{ path: 'places/Capital.md', basename: 'Capital', cr_id: 'place-capital', cr_type: 'place', name: 'Capital' },
			{ path: 'organizations/Court.md', basename: 'Court', cr_id: 'org-court', cr_type: 'organization', name: 'Court' },
			{ path: 'citations/Citation.md', basename: 'Citation', cr_id: 'citation-1', cr_type: 'citation' },
			{ path: 'universes/World.md', basename: 'World', cr_id: 'universe-1', cr_type: 'universe', name: 'World' }
		] as const;

		for (const fixture of fixtures) {
			const file = makeFile(fixture.path, fixture.basename);
			app.vault.files.set(file.path, file);
			app.metadataCache._setFrontmatter(file, {
				cr_id: fixture.cr_id,
				cr_type: fixture.cr_type,
				name: 'name' in fixture ? fixture.name : undefined,
				title: 'title' in fixture ? fixture.title : undefined
			});
		}

		const people = service.getAllPeople();

		expect(people.map(person => person.crId)).toEqual(['person-ada']);
		expect(people.every(person =>
			app.metadataCache.getFileCache(person.file)?.frontmatter?.cr_type === 'person'
		)).toBe(true);
	});
	it('returns a PersonNode for cr_type: person', () => {
		const { service, app } = makeService();
		const file = makeFile('people/Cliegg Lars.md', 'Cliegg Lars');
		app.vault.files.set(file.path, file);
		app.metadataCache._setFrontmatter(file, {
			cr_id: 'prs-100-cle-200',
			cr_type: 'person',
			name: 'Cliegg Lars',
		});

		const result = privates(service).extractPersonNode(file) as { crId?: string; name?: string } | null;
		expect(result).not.toBeNull();
		expect(result?.crId).toBe('prs-100-cle-200');
		expect(result?.name).toBe('Cliegg Lars');
	});

	it('preserves the legacy fallback: cr_id with no cr_type is treated as person', () => {
		// Older vaults predating strict cr_type tagging — still recognized.
		const { service, app } = makeService();
		const file = makeFile('people/Old Vault Person.md', 'Old Vault Person');
		app.vault.files.set(file.path, file);
		app.metadataCache._setFrontmatter(file, {
			cr_id: 'prs-200-leg-300',
			name: 'Old Vault Person',
		});

		const result = privates(service).extractPersonNode(file) as { crId?: string } | null;
		expect(result).not.toBeNull();
		expect(result?.crId).toBe('prs-200-leg-300');
	});

	it('returns null when cr_id is missing entirely', () => {
		const { service, app } = makeService();
		const file = makeFile('notes/no-id.md', 'no-id');
		app.vault.files.set(file.path, file);
		app.metadataCache._setFrontmatter(file, {
			cr_type: 'person',
			name: 'Missing Id',
		});

		expect(privates(service).extractPersonNode(file)).toBeNull();
	});
});