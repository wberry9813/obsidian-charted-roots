import type { App, TFile } from 'obsidian';
import { isPersonNote } from '../utils/note-type-detection';
import {
	getCanonicalLinktext,
	resolvePathToFile
} from '../utils/wikilink-resolver';
import type { AssertionScalar, AssertionRecord, AssertionService } from './assertion-service';
import type { TemporalFields } from './types';

export type SemanticAssertionOrigin =
	| 'assertion_note'
	| 'frontmatter'
	| 'derived'
	| 'provider';

export interface SemanticAssertionServiceOptions {
	/** Dynamic entity-note scope; omitted to preserve legacy whole-vault behavior. */
	fileProvider?: () => TFile[];
}

export interface SemanticAssertion extends TemporalFields {
	assertionType: string;
	subject: string;
	predicate: string;
	object?: string;
	value?: AssertionScalar;
	origin: SemanticAssertionOrigin;
	sourceFile?: TFile;
	materialized?: AssertionRecord;
}

function toArray(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
	}
	return typeof value === 'string' && value.trim() ? [value] : [];
}

function entityLink(app: App, file: TFile, name: string): string {
	const target = getCanonicalLinktext(app, file);
	return target === name ? `[[${target}]]` : `[[${target}|${name}]]`;
}

/**
 * Semantic projection over physical v2 Assertions and compact entity fields.
 *
 * v2 deliberately keeps simple genealogy fields compact on Person notes.
 * This service turns them into virtual Assertions at query time so consumers
 * do not need separate data paths for genealogy and materialized assertions.
 */
export class SemanticAssertionService {
	constructor(
		private readonly app: App,
		private readonly assertionService: AssertionService,
		private readonly options: SemanticAssertionServiceOptions = {}
	) {}

	getAll(): SemanticAssertion[] {
		return [
			...this.assertionService.getAll().map(record => this.fromMaterialized(record)),
			...this.getVirtualKinshipAssertions()
		];
	}

	getForFile(file: TFile): SemanticAssertion[] {
		return this.getAll().filter(assertion => {
			const sourcePath = assertion.sourceFile?.path ?? '';
			const subject = resolvePathToFile(this.app, assertion.subject, sourcePath);
			if (subject?.path === file.path) return true;

			if (assertion.object) {
				const object = resolvePathToFile(this.app, assertion.object, sourcePath);
				if (object?.path === file.path) return true;
			}
			return false;
		});
	}

	getByPredicate(predicate: string): SemanticAssertion[] {
		return this.getAll().filter(assertion => assertion.predicate === predicate);
	}

	private fromMaterialized(record: AssertionRecord): SemanticAssertion {
		const assertion = record.assertion;
		return {
			assertionType: assertion.assertion_type,
			subject: assertion.subject,
			predicate: assertion.predicate,
			object: assertion.object,
			value: assertion.value,
			time_start: assertion.time_start,
			time_end: assertion.time_end,
			time_not_before: assertion.time_not_before,
			time_not_after: assertion.time_not_after,
			time_start_precision: assertion.time_start_precision,
			time_end_precision: assertion.time_end_precision,
			time_start_certainty: assertion.time_start_certainty,
			time_end_certainty: assertion.time_end_certainty,
			origin: 'assertion_note',
			sourceFile: record.file,
			materialized: record
		};
	}

	private getVirtualKinshipAssertions(): SemanticAssertion[] {
		const result: SemanticAssertion[] = [];
		const spouseKeys = new Set<string>();

		const files = this.options.fileProvider?.()
			?? this.app.vault.getMarkdownFiles();
		for (const file of files) {
			const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (!frontmatter || !isPersonNote(frontmatter)) continue;

			const name = typeof frontmatter.name === 'string' && frontmatter.name.trim()
				? frontmatter.name.trim()
				: file.basename;
			const subject = entityLink(this.app, file, name);

			if (typeof frontmatter.father === 'string' && frontmatter.father.trim()) {
				result.push({
					assertionType: 'relationship',
					subject,
					predicate: 'father',
					object: frontmatter.father,
					origin: 'frontmatter',
					sourceFile: file
				});
			}

			if (typeof frontmatter.mother === 'string' && frontmatter.mother.trim()) {
				result.push({
					assertionType: 'relationship',
					subject,
					predicate: 'mother',
					object: frontmatter.mother,
					origin: 'frontmatter',
					sourceFile: file
				});
			}

			for (const spouse of [...toArray(frontmatter.spouse), ...toArray(frontmatter.spouses)]) {
				const spouseFile = resolvePathToFile(this.app, spouse, file.path);
				const left = file.path;
				const right = spouseFile?.path ?? spouse;
				const key = [left, right].sort().join('::');
				if (spouseKeys.has(key)) continue;
				spouseKeys.add(key);

				result.push({
					assertionType: 'relationship',
					subject,
					predicate: 'spouse',
					object: spouse,
					origin: 'frontmatter',
					sourceFile: file
				});
			}
		}

		return result;
	}
}
