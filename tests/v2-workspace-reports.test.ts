import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/settings';
import {
	ReportGenerationService
} from '../src/reports/services/report-generation-service';
import {
	createReportScopedSettings,
	registerDefaultReportGenerationContext,
	type ReportGenerationContext
} from '../src/reports/services/report-context';

describe('Workspace report context', () => {
	it('creates a scoped settings view without mutating persisted settings', () => {
		const settings = {
			...DEFAULT_SETTINGS,
			folderFilterMode: 'exclude' as const,
			includedFolders: ['Legacy Include'],
			excludedFolders: ['Legacy Exclude']
		};
		const original = JSON.parse(JSON.stringify(settings));
		const context: ReportGenerationContext = {
			workspaceRootProvider: () => 'History',
			folderProvider: kind => ({
				reports: 'History/Reports',
				events: 'History/Events',
				sources: 'History/Sources',
				citations: 'History/Citations',
				canvases: 'History/Canvases'
			})[kind]
		};

		const scoped = createReportScopedSettings(settings, context);

		expect(scoped.folderFilterMode).toBe('include');
		expect(scoped.includedFolders).toEqual(['History']);
		expect(scoped.excludedFolders).toEqual([]);
		expect(scoped.eventsFolder).toBe('History/Events');
		expect(scoped.sourcesFolder).toBe('History/Sources');
		expect(scoped.citationsFolder).toBe('History/Citations');
		expect(scoped.canvasesFolder).toBe('History/Canvases');
		expect(scoped.reportsFolder).toBe('History/Reports');
		expect(settings).toEqual(original);
	});

	it('saves to the Workspace Reports folder and rejects an outside path', async () => {
		const createdFolders: string[] = [];
		const createdFiles: Array<{ path: string; content: string }> = [];
		const app = {
			vault: {
				getAbstractFileByPath: () => null,
				createFolder: async (path: string) => {
					createdFolders.push(path);
				},
				create: async (path: string, content: string) => {
					createdFiles.push({ path, content });
					return { path };
				},
				getRoot: () => ({ children: [] })
			}
		} as never;
		const service = new ReportGenerationService(app, { ...DEFAULT_SETTINGS }, {
			workspaceRootProvider: () => 'History',
			folderProvider: kind => kind === 'reports' ? 'History/Reports' : undefined,
			fileProvider: () => []
		});

		const saved = await service.saveToVault('# Report', 'Summary');
		expect(saved).toBe('History/Reports/Summary.md');
		expect(createdFolders).toEqual(['History', 'History/Reports']);
		expect(createdFiles).toEqual([
			{ path: 'History/Reports/Summary.md', content: '# Report' }
		]);

		await expect(service.saveToVault('# Bad', 'Bad', 'Fiction/Reports'))
			.rejects.toThrow(/inside the active Workspace/);
	});

	it('hydrates legacy report construction from the registered active Workspace', async () => {
		registerDefaultReportGenerationContext(() => ({
			workspaceRootProvider: () => 'Workspace-E2E/History',
			folderProvider: kind => kind === 'reports'
				? 'Workspace-E2E/History/Reports'
				: undefined,
			fileProvider: () => []
		}));

		const created: string[] = [];
		const app = {
			vault: {
				getAbstractFileByPath: () => null,
				createFolder: async () => undefined,
				create: async (path: string) => {
					created.push(path);
					return { path };
				},
				getRoot: () => ({ children: [] })
			}
		} as never;

		// This is the legacy constructor shape used by ReportGeneratorModal.
		const service = new ReportGenerationService(app, { ...DEFAULT_SETTINGS });
		await service.saveToVault('content', 'Legacy UI');
		expect(created).toEqual([
			'Workspace-E2E/History/Reports/Legacy UI.md'
		]);

		// Do not leak this fixture's context into other tests.
		registerDefaultReportGenerationContext(() => ({}));
	});
});
