import { normalizePath, type App, type TFile } from 'obsidian';
import type { AssertionService, CreateAssertionData } from '../assertion-service';
import { validateMigrationPlanFreshness } from './plan-validator';
import type {
	FileMigrationPlan,
	MigrationBackupManifest,
	MigrationExecutionError,
	MigrationExecutionOptions,
	MigrationExecutionResult,
	MigrationPlan,
	MigrationPlanOperation
} from './types';

const DEFAULT_ASSERTION_FOLDER = 'Assertions';
const DEFAULT_BACKUP_ROOT = '.charted-roots/migration';

function executionRunId(): string {
	return new Date().toISOString().replace(/[:.]/g, '-');
}

function safeSegment(value: string): string {
	const sanitized = value.trim().replace(/[^A-Za-z0-9._-]+/g, '-');
	return sanitized || executionRunId();
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function singleFilePlan(file: FileMigrationPlan): MigrationPlan {
	return {
		files: [file],
		executableFiles: file.operations.length > 0 ? 1 : 0,
		reviewFiles: file.status === 'review' ? 1 : 0,
		blockedFiles: file.status === 'blocked' ? 1 : 0,
		operationCount: file.operations.length
	};
}

function asCreateAssertionData(
	operation: Extract<MigrationPlanOperation, { kind: 'create_assertion' }>
): CreateAssertionData {
	return {
		assertionType: operation.draft.assertionType,
		subject: operation.draft.subject,
		predicate: operation.draft.predicate,
		object: operation.draft.object,
		value: operation.draft.value,
		timeStart: operation.draft.timeStart,
		timeEnd: operation.draft.timeEnd,
		notes: operation.draft.notes,
		qualifiers: operation.draft.qualifiers
	};
}

/**
 * Transaction-like executor for the ready subset of a migration plan.
 *
 * Safety properties:
 * - review/blocked files are never touched;
 * - the full ready subset is freshness-checked before backup;
 * - every source Markdown file is backed up before any mutation;
 * - each file is freshness-checked again immediately before its operations;
 * - Assertions are created before legacy source fields are removed;
 * - on failure, modified sources are restored and newly-created Assertions are
 *   deleted on a best-effort basis;
 * - a hidden manifest remains as an audit/recovery record.
 */
export class V2MigrationExecutor {
	constructor(
		private readonly app: App,
		private readonly assertions: AssertionService
	) {}

	async executeReady(
		plan: MigrationPlan,
		options: MigrationExecutionOptions = {}
	): Promise<MigrationExecutionResult> {
		const runId = safeSegment(options.runId ?? executionRunId());
		const assertionFolder = normalizePath(
			options.assertionFolder ?? DEFAULT_ASSERTION_FOLDER
		);
		const backupRoot = normalizePath(
			options.backupRoot ?? DEFAULT_BACKUP_ROOT
		);
		const backupDirectory = normalizePath(`${backupRoot}/${runId}`);
		const executable = plan.files.filter(
			file => file.status === 'ready' && file.operations.length > 0
		);

		const result: MigrationExecutionResult = {
			success: false,
			runId,
			backupDirectory,
			filesMigrated: 0,
			assertionsCreated: 0,
			rewrittenFiles: 0,
			createdAssertionPaths: [],
			rolledBack: false,
			errors: []
		};

		if (executable.length === 0) {
			return {
				...result,
				success: true,
				backupDirectory: undefined
			};
		}

		const executablePlan: MigrationPlan = {
			files: executable,
			executableFiles: executable.length,
			reviewFiles: 0,
			blockedFiles: 0,
			operationCount: executable.reduce(
				(sum, file) => sum + file.operations.length,
				0
			)
		};

		const freshness = await validateMigrationPlanFreshness(
			this.app,
			executablePlan
		);
		if (!freshness.valid) {
			return {
				...result,
				backupDirectory: undefined,
				errors: freshness.issues.map(item => ({
					filePath: item.filePath,
					message: item.message
				}))
			};
		}

		const originals = new Map<string, string>();
		const modifiedPaths = new Set<string>();
		const createdFiles: TFile[] = [];
		const createdAt = new Date().toISOString();

		const manifest: MigrationBackupManifest = {
			version: 1,
			runId,
			createdAt,
			status: 'prepared',
			plan: executablePlan,
			sourceBackups: [],
			createdAssertionPaths: [],
			errors: []
		};

		try {
			await this.ensureDirectory(backupDirectory);

			// Back up every source before the first mutation.
			for (const plannedFile of executable) {
				const file = this.app.vault.getFileByPath(plannedFile.filePath);
				if (!file) {
					throw new Error(
						`Migration source disappeared before backup: ${plannedFile.filePath}`
					);
				}
				const original = await this.app.vault.read(file);
				originals.set(plannedFile.filePath, original);

				const backupPath = normalizePath(
					`${backupDirectory}/originals/${plannedFile.filePath}`
				);
				await this.ensureDirectory(
					backupPath.split('/').slice(0, -1).join('/')
				);
				await this.app.vault.adapter.write(backupPath, original);
				manifest.sourceBackups.push({
					filePath: plannedFile.filePath,
					fingerprint: plannedFile.sourceFingerprint,
					backupPath
				});
			}

			await this.writeManifest(backupDirectory, manifest);

			// Re-check after backup creation, then again per-file before mutation.
			const postBackupFreshness = await validateMigrationPlanFreshness(
				this.app,
				executablePlan
			);
			if (!postBackupFreshness.valid) {
				throw new Error(
					`Migration plan became stale before execution: ${postBackupFreshness.issues
						.map(item => item.filePath)
						.join(', ')}`
				);
			}

			for (const plannedFile of executable) {
				const fileFreshness = await validateMigrationPlanFreshness(
					this.app,
					singleFilePlan(plannedFile)
				);
				if (!fileFreshness.valid) {
					throw new Error(
						`Migration source changed before execution: ${plannedFile.filePath}`
					);
				}

				const sourceFile = this.app.vault.getFileByPath(plannedFile.filePath);
				if (!sourceFile) {
					throw new Error(
						`Migration source disappeared: ${plannedFile.filePath}`
					);
				}

				// Materialize all replacement facts before removing legacy fields.
				for (const operation of plannedFile.operations) {
					if (operation.kind !== 'create_assertion') continue;
					const created = await this.assertions.createAssertion(
						asCreateAssertionData(operation),
						{ folder: assertionFolder }
					);
					createdFiles.push(created);
					result.createdAssertionPaths.push(created.path);
					result.assertionsCreated++;
					manifest.createdAssertionPaths.push(created.path);
					await this.writeManifest(backupDirectory, manifest);
				}

				for (const operation of plannedFile.operations) {
					if (operation.kind !== 'rewrite_frontmatter') continue;

					// Mark before invoking processFrontMatter so a write that
					// succeeds but later throws is still eligible for rollback.
					modifiedPaths.add(plannedFile.filePath);
					await this.app.fileManager.processFrontMatter(
						sourceFile,
						frontmatter => {
							for (const field of operation.remove) {
								delete frontmatter[field];
							}
							for (const [field, value] of Object.entries(operation.set)) {
								frontmatter[field] = value;
							}
						}
					);
					result.rewrittenFiles++;
				}

				result.filesMigrated++;
			}

			manifest.status = 'completed';
			await this.writeManifest(backupDirectory, manifest);
			this.assertions.invalidateCache();

			return {
				...result,
				success: true
			};
		} catch (error) {
			const primaryError: MigrationExecutionError = {
				message: errorMessage(error)
			};
			result.errors.push(primaryError);

			const rollbackErrors: MigrationExecutionError[] = [];

			// Restore every source that may have been rewritten.
			for (const filePath of modifiedPaths) {
				const original = originals.get(filePath);
				const file = this.app.vault.getFileByPath(filePath);
				if (original === undefined || !file) {
					rollbackErrors.push({
						filePath,
						message: 'Unable to restore the original source file.'
					});
					continue;
				}
				try {
					await this.app.vault.modify(file, original);
				} catch (rollbackError) {
					rollbackErrors.push({
						filePath,
						message: `Source rollback failed: ${errorMessage(rollbackError)}`
					});
				}
			}

			// Delete only Assertions created by this execution attempt.
			for (const file of [...createdFiles].reverse()) {
				try {
					const current = this.app.vault.getFileByPath(file.path);
					if (current) {
						await this.app.vault.delete(current);
					}
				} catch (rollbackError) {
					rollbackErrors.push({
						filePath: file.path,
						message: `Created Assertion rollback failed: ${errorMessage(rollbackError)}`
					});
				}
			}

			result.errors.push(...rollbackErrors);
			result.rolledBack = modifiedPaths.size > 0 || createdFiles.length > 0;
			result.createdAssertionPaths = rollbackErrors.some(item =>
				manifest.createdAssertionPaths.includes(item.filePath ?? '')
			)
				? [...manifest.createdAssertionPaths]
				: [];
			result.assertionsCreated = 0;
			result.rewrittenFiles = 0;
			result.filesMigrated = 0;
			this.assertions.invalidateCache();

			manifest.status = result.rolledBack ? 'rolled_back' : 'failed';
			manifest.errors = [...result.errors];
			try {
				await this.writeManifest(backupDirectory, manifest);
			} catch (manifestError) {
				result.errors.push({
					message: `Migration manifest update failed: ${errorMessage(manifestError)}`
				});
			}

			return result;
		}
	}

	private async ensureDirectory(path: string): Promise<void> {
		const normalized = normalizePath(path);
		if (!normalized) return;

		let current = '';
		for (const segment of normalized.split('/').filter(Boolean)) {
			current = current ? `${current}/${segment}` : segment;
			if (await this.app.vault.adapter.exists(current)) continue;
			await this.app.vault.adapter.mkdir(current);
		}
	}

	private async writeManifest(
		backupDirectory: string,
		manifest: MigrationBackupManifest
	): Promise<void> {
		const path = normalizePath(`${backupDirectory}/manifest.json`);
		await this.app.vault.adapter.write(
			path,
			JSON.stringify(manifest, null, 2)
		);
	}
}
