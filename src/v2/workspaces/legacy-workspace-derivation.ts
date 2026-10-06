import { normalizeWorkspacePath } from './path-utils';
import type { WorkspaceDefinition } from './types';

export interface LegacyFolderSettingsLike {
	peopleFolder?: string;
	placesFolder?: string;
	mapsFolder?: string;
	schemasFolder?: string;
	canvasesFolder?: string;
	stagingFolder?: string;
	universesFolder?: string;
	organizationsFolder?: string;
	sourcesFolder?: string;
	notesFolder?: string;
	basesFolder?: string;
	eventsFolder?: string;
	timelinesFolder?: string;
	citationsFolder?: string;
	reportsFolder?: string;
}

export interface LegacyWorkspaceDerivation {
	status: 'ready' | 'review';
	workspace?: WorkspaceDefinition;
	suggestedRoot?: string;
	reasons: string[];
	inspectedFields: string[];
}

const LEGACY_FOLDER_SUFFIXES: ReadonlyArray<
	readonly [keyof LegacyFolderSettingsLike, string]
> = [
	['peopleFolder', 'People'],
	['placesFolder', 'Places'],
	['mapsFolder', 'Places/Maps'],
	['schemasFolder', 'Schemas'],
	['canvasesFolder', 'Canvases'],
	['stagingFolder', 'Staging'],
	['universesFolder', 'Universes'],
	['organizationsFolder', 'Organizations'],
	['sourcesFolder', 'Sources'],
	['notesFolder', 'Notes'],
	['basesFolder', 'Bases'],
	['eventsFolder', 'Events'],
	['timelinesFolder', 'Timelines'],
	['citationsFolder', 'Citations'],
	['reportsFolder', 'Reports']
];

function rootBeforeSuffix(path: string, suffix: string): string | null {
	const normalized = normalizeWorkspacePath(path);
	const normalizedSuffix = normalizeWorkspacePath(suffix);
	if (!normalized || !normalizedSuffix) return null;

	if (normalized === normalizedSuffix) return '';
	const tail = `/${normalizedSuffix}`;
	if (!normalized.endsWith(tail)) return null;
	return normalized.slice(0, -tail.length);
}

function commonParent(paths: string[]): string | undefined {
	if (paths.length === 0) return undefined;
	const parts = paths.map(path =>
		normalizeWorkspacePath(path).split('/').filter(Boolean)
	);
	if (parts.some(item => item.length === 0)) return undefined;

	const common: string[] = [];
	const shortest = Math.min(...parts.map(item => item.length));
	for (let i = 0; i < shortest; i++) {
		const value = parts[0][i];
		if (!parts.every(item => item[i] === value)) break;
		common.push(value);
	}
	return common.length > 0 ? common.join('/') : undefined;
}

/**
 * Conservative legacy-folder inference.
 *
 * Automatic conversion is allowed only when every configured legacy folder
 * uses its canonical suffix beneath exactly one non-empty root. A mere common
 * parent is returned only as a review suggestion; it never becomes automatic
 * Workspace ownership.
 */
export function deriveLegacyWorkspace(
	settings: LegacyFolderSettingsLike
): LegacyWorkspaceDerivation {
	const configured: Array<{
		field: keyof LegacyFolderSettingsLike;
		path: string;
		suffix: string;
		root: string | null;
	}> = [];

	for (const [field, suffix] of LEGACY_FOLDER_SUFFIXES) {
		const raw = settings[field];
		if (typeof raw !== 'string' || !raw.trim()) continue;
		configured.push({
			field,
			path: normalizeWorkspacePath(raw),
			suffix,
			root: rootBeforeSuffix(raw, suffix)
		});
	}

	const inspectedFields = configured.map(item => String(item.field));
	if (configured.length === 0) {
		return {
			status: 'review',
			reasons: ['No legacy Charted Roots folders are configured.'],
			inspectedFields
		};
	}

	const mismatched = configured.filter(item => item.root === null);
	const unsafeVaultRoot = configured.filter(item => item.root === '');
	const candidateRoots = new Set(
		configured
			.map(item => item.root)
			.filter((root): root is string => !!root)
	);

	if (
		mismatched.length === 0
		&& unsafeVaultRoot.length === 0
		&& candidateRoots.size === 1
	) {
		const rootFolder = [...candidateRoots][0];
		return {
			status: 'ready',
			workspace: {
				id: 'default',
				name: 'Default',
				rootFolder,
				mode: 'genealogy',
				enabledPacks: ['core']
			},
			suggestedRoot: rootFolder,
			reasons: [],
			inspectedFields
		};
	}

	const reasons: string[] = [];
	if (mismatched.length > 0) {
		reasons.push(
			`Legacy folders with custom/non-canonical paths require review: ${mismatched
				.map(item => item.field)
				.join(', ')}.`
		);
	}
	if (unsafeVaultRoot.length > 0) {
		reasons.push(
			'At least one legacy folder would make the Workspace root equal to the whole vault.'
		);
	}
	if (candidateRoots.size > 1) {
		reasons.push(
			`Legacy folders resolve to multiple candidate roots: ${[...candidateRoots].join(', ')}.`
		);
	}

	return {
		status: 'review',
		suggestedRoot: commonParent(configured.map(item => item.path)),
		reasons,
		inspectedFields
	};
}
