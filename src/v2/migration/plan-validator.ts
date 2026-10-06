import { getFrontMatterInfo, parseYaml, type App } from 'obsidian';
import { fingerprintFrontmatter } from './legacy-analyzer';
import type {
	MigrationPlan,
	MigrationPlanValidationIssue,
	MigrationPlanValidationResult
} from './types';

function issue(
	code: MigrationPlanValidationIssue['code'],
	filePath: string,
	expectedFingerprint: string,
	message: string,
	actualFingerprint?: string
): MigrationPlanValidationIssue {
	return {
		code,
		filePath,
		message,
		expectedFingerprint,
		actualFingerprint
	};
}

/**
 * Revalidate an immutable migration plan against the current Markdown files.
 *
 * This intentionally reads file contents from Vault.read() rather than
 * MetadataCache so an edit made after Preview/Plan creation cannot slip
 * through because Obsidian has not refreshed its cache yet.
 *
 * Only files with executable operations are checked. Review/blocked files are
 * non-executable by definition and therefore do not participate in this guard.
 */
export async function validateMigrationPlanFreshness(
	app: App,
	plan: MigrationPlan
): Promise<MigrationPlanValidationResult> {
	const issues: MigrationPlanValidationIssue[] = [];
	const executable = plan.files.filter(file => file.operations.length > 0);

	for (const plannedFile of executable) {
		const file = app.vault.getFileByPath(plannedFile.filePath);
		if (!file) {
			issues.push(issue(
				'missing_file',
				plannedFile.filePath,
				plannedFile.sourceFingerprint,
				'The source file no longer exists.'
			));
			continue;
		}

		let content: string;
		try {
			content = await app.vault.read(file);
		} catch (error) {
			issues.push(issue(
				'invalid_frontmatter',
				plannedFile.filePath,
				plannedFile.sourceFingerprint,
				`Unable to read the source file: ${error instanceof Error ? error.message : String(error)}`
			));
			continue;
		}

		const info = getFrontMatterInfo(content);
		if (!info.exists) {
			issues.push(issue(
				'missing_frontmatter',
				plannedFile.filePath,
				plannedFile.sourceFingerprint,
				'The source frontmatter no longer exists.'
			));
			continue;
		}

		let frontmatter: Record<string, unknown>;
		try {
			const parsed = parseYaml(info.frontmatter);
			if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
				throw new Error('Frontmatter is not a mapping object.');
			}
			frontmatter = parsed as Record<string, unknown>;
		} catch (error) {
			issues.push(issue(
				'invalid_frontmatter',
				plannedFile.filePath,
				plannedFile.sourceFingerprint,
				`The current frontmatter could not be parsed: ${error instanceof Error ? error.message : String(error)}`
			));
			continue;
		}

		const actualFingerprint = fingerprintFrontmatter(frontmatter);
		if (actualFingerprint !== plannedFile.sourceFingerprint) {
			issues.push(issue(
				'stale_source',
				plannedFile.filePath,
				plannedFile.sourceFingerprint,
				'The source frontmatter changed after the migration plan was created.',
				actualFingerprint
			));
		}
	}

	return {
		valid: issues.length === 0,
		checkedFiles: executable.length,
		issues
	};
}
