import type { App, TFile } from 'obsidian';
import { isAssertionNote } from '../utils/note-type-detection';
import { validateAssertionShape } from './schema-validation';
import type { AssertionFrontmatter } from './types';

export interface AssertionRecord {
	file: TFile;
	filePath: string;
	assertion: AssertionFrontmatter;
	raw: Record<string, unknown>;
}

export interface InvalidAssertionRecord {
	file: TFile;
	filePath: string;
	errors: string[];
	raw: Record<string, unknown>;
}

export interface AssertionScanResult {
	valid: AssertionRecord[];
	invalid: InvalidAssertionRecord[];
}

/**
 * Read-only v2 Assertion access.
 *
 * M0 deliberately does not write or mutate notes. This service provides one
 * normalized read boundary that Profile/Relationship/Organization code can
 * adopt incrementally before legacy writers are retired.
 */
export class AssertionService {
	constructor(private readonly app: App) {}

	parseFile(file: TFile): AssertionRecord | InvalidAssertionRecord | null {
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		if (!frontmatter || !isAssertionNote(frontmatter)) {
			return null;
		}

		const raw = { ...frontmatter } as Record<string, unknown>;
		const result = validateAssertionShape(raw);

		if (!result.valid) {
			return {
				file,
				filePath: file.path,
				errors: result.errors,
				raw
			};
		}

		return {
			file,
			filePath: file.path,
			assertion: raw as unknown as AssertionFrontmatter,
			raw
		};
	}

	scan(): AssertionScanResult {
		const valid: AssertionRecord[] = [];
		const invalid: InvalidAssertionRecord[] = [];

		for (const file of this.app.vault.getMarkdownFiles()) {
			const parsed = this.parseFile(file);
			if (!parsed) continue;

			if ('assertion' in parsed) {
				valid.push(parsed);
			} else {
				invalid.push(parsed);
			}
		}

		return { valid, invalid };
	}

	getAll(): AssertionRecord[] {
		return this.scan().valid;
	}

	getInvalid(): InvalidAssertionRecord[] {
		return this.scan().invalid;
	}

	getForSubject(subject: string): AssertionRecord[] {
		return this.getAll().filter(record => record.assertion.subject === subject);
	}

	getForObject(object: string): AssertionRecord[] {
		return this.getAll().filter(record => record.assertion.object === object);
	}

	getByPredicate(predicate: string): AssertionRecord[] {
		return this.getAll().filter(record => record.assertion.predicate === predicate);
	}

	getByAssertionType(assertionType: string): AssertionRecord[] {
		return this.getAll().filter(record => record.assertion.assertion_type === assertionType);
	}
}
