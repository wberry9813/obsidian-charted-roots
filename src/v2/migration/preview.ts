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
		case 'organization_members_mirror':
			return 'cleanup';
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
		count: finding.count,
		details: finding.details ? structuredClone(finding.details) : undefined
	};
}

/**
 * Convert one immutable analyzer snapshot into a UI/executor-facing preview.
 * No vault reads occur here: every detail comes from the analysis snapshot.
 */
export function buildMigrationPreview(
	report: MigrationAnalysisReport
): MigrationPreview {
	const files = report.files.map(file => ({
		filePath: file.filePath,
		sourceFingerprint: file.sourceFingerprint,
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
