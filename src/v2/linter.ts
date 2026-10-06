import type { App } from 'obsidian';
import { ALL_NOTE_TYPES, type NoteType } from '../utils/note-type-detection';
import type { AssertionService } from './assertion-service';
import type { OntologyRegistry } from './ontology-registry';

export type V2LintSeverity = 'error' | 'warning';

export interface V2LintIssue {
	severity: V2LintSeverity;
	code: string;
	message: string;
	filePath?: string;
	crId?: string;
}

export class V2Linter {
	constructor(
		private readonly app: App,
		private readonly ontology: OntologyRegistry,
		private readonly assertions: AssertionService
	) {}

	lint(): V2LintIssue[] {
		const issues: V2LintIssue[] = [];
		const seenIds = new Map<string, string>();

		for (const issue of this.ontology.validate()) {
			issues.push({
				severity: issue.severity,
				code: `ontology_${issue.code}`,
				message: issue.message
			});
		}

		for (const file of this.app.vault.getMarkdownFiles()) {
			const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (!frontmatter || frontmatter.cr_schema !== 2) continue;

			const crType = frontmatter.cr_type;
			if (
				typeof crType !== 'string'
				|| !ALL_NOTE_TYPES.includes(crType as NoteType)
			) {
				issues.push({
					severity: 'error',
					code: 'unknown_cr_type',
					message: `Unknown v2 cr_type: ${String(crType)}.`,
					filePath: file.path
				});
			}

			const crId = frontmatter.cr_id;
			if (typeof crId !== 'string' || !crId.trim()) {
				issues.push({
					severity: 'error',
					code: 'missing_cr_id',
					message: 'v2 notes require a non-empty cr_id.',
					filePath: file.path
				});
				continue;
			}

			const firstPath = seenIds.get(crId);
			if (firstPath) {
				issues.push({
					severity: 'error',
					code: 'duplicate_cr_id',
					message: `Duplicate cr_id "${crId}" also used by ${firstPath}.`,
					filePath: file.path,
					crId
				});
			} else {
				seenIds.set(crId, file.path);
			}
		}

		const scan = this.assertions.scan();
		for (const invalid of scan.invalid) {
			issues.push({
				severity: 'error',
				code: 'invalid_assertion_shape',
				message: invalid.errors.join(' '),
				filePath: invalid.filePath,
				crId: typeof invalid.raw.cr_id === 'string' ? invalid.raw.cr_id : undefined
			});
		}

		for (const record of scan.valid) {
			const assertion = record.assertion;
			if (!this.ontology.hasType('assertion_type', assertion.assertion_type)) {
				issues.push({
					severity: 'error',
					code: 'unknown_assertion_type',
					message: `Unknown assertion_type "${assertion.assertion_type}".`,
					filePath: record.filePath,
					crId: assertion.cr_id
				});
			}
			if (!this.ontology.hasPredicate(assertion.predicate)) {
				issues.push({
					severity: 'error',
					code: 'unknown_predicate',
					message: `Unknown predicate "${assertion.predicate}".`,
					filePath: record.filePath,
					crId: assertion.cr_id
				});
			}
		}

		return issues;
	}
}
