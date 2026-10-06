import type {
	MigrationAnalysisReport,
	MigrationFinding,
	MigrationPreview,
	MigrationPreviewAction,
	MigrationPreviewActionKind,
	MigrationPreviewStatus
} from './types';

function actionKind(finding: MigrationFinding): MigrationPreviewActionKind {
	if (finding.severity === 'blocker') return 'blocker';
	if (finding.severity === 'review') return 'review';
	if (!finding.autoMigrate) return 'info';

	switch (finding.code) {
		case 'membership_parallel_arrays':
		case 'membership_nested':
		case 'membership_simple':
		case 'relationship_parallel_arrays':
		case 'relationship_nested':
		case 'organization_parent':
			return 'create_assertions';
		case 'legacy_event_date':
		case 'legacy_event_relative_order':
			return 'rewrite_frontmatter';
		default:
			return 'info';
	}
}

function fileStatus(findings: MigrationFinding[]): MigrationPreviewStatus {
	if (findings.some(finding => finding.severity === 'blocker')) return 'blocked';
	if (findings.some(finding => finding.severity === 'review')) return 'review';
	return 'ready';
}

function toAction(finding: MigrationFinding): MigrationPreviewAction {
	return {
		kind: actionKind(finding),
		code: finding.code,
		description: finding.message,
		fields: [...finding.fields],
		count: finding.count
	};
}

/**
 * Convert read-only analyzer output into a UI-friendly migration plan.
 *
 * The preview contains no mutation callbacks by design. A later executor must
 * consume an explicitly approved plan rather than re-running inference.
 */
export function buildMigrationPreview(
	report: MigrationAnalysisReport
): MigrationPreview {
	const files = report.files.map(file => ({
		filePath: file.filePath,
		status: fileStatus(file.findings),
		actions: file.findings.map(toAction)
	}));

	const readyFiles = files.filter(file => file.status === 'ready').length;
	const reviewFiles = files.filter(file => file.status === 'review').length;
	const blockedFiles = files.filter(file => file.status === 'blocked').length;

	return {
		files,
		readyFiles,
		reviewFiles,
		blockedFiles,
		canRunWithoutReview: reviewFiles === 0 && blockedFiles === 0
	};
}
