import {
	normalizePath,
	type App,
	type Plugin,
	TFile,
	TFolder
} from 'obsidian';
import { generateCrId } from '../core/uuid';
import { sanitizeFilename } from '../utils/name-sanitization';
import { isAssertionNote } from '../utils/note-type-detection';
import { resolvePathToFile } from '../utils/wikilink-resolver';
import { waitForCacheRefresh } from '../utils/cache-utils';
import { validateAssertionShape } from './schema-validation';
import type { OntologyRegistry } from './ontology-registry';
import type {
	AssertionFrontmatter,
	TemporalCertainty,
	TemporalPrecision
} from './types';

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

export type AssertionScalar = string | number | boolean;

export interface CreateAssertionData {
	assertionType: string;
	subject: string;
	predicate: string;
	object?: string;
	value?: AssertionScalar;
	timeStart?: string;
	timeEnd?: string;
	timeNotBefore?: string;
	timeNotAfter?: string;
	timeStartPrecision?: TemporalPrecision;
	timeEndPrecision?: TemporalPrecision;
	timeStartCertainty?: TemporalCertainty;
	timeEndCertainty?: TemporalCertainty;
	confidence?: string;
	researchStatus?: string;
	notes?: string;
	qualifiers?: Record<string, AssertionScalar>;
	title?: string;
}

export interface CreateAssertionOptions {
	folder?: string;
}

export interface AssertionServiceOptions {
	/** Dynamic file scope; omitted to preserve legacy whole-vault behavior. */
	fileProvider?: () => TFile[];
	/** Dynamic default creation folder, e.g. the active Workspace Assertions folder. */
	defaultFolderProvider?: () => string;
}

interface AssertionCache {
	valid: AssertionRecord[];
	invalid: InvalidAssertionRecord[];
	bySubject: Map<string, AssertionRecord[]>;
	byObject: Map<string, AssertionRecord[]>;
	byPredicate: Map<string, AssertionRecord[]>;
	byAssertionType: Map<string, AssertionRecord[]>;
}

const RESERVED_ASSERTION_KEYS = new Set([
	'cr_schema',
	'cr_type',
	'cr_id',
	'assertion_type',
	'subject',
	'predicate',
	'object',
	'value',
	'time_start',
	'time_end',
	'time_not_before',
	'time_not_after',
	'time_start_precision',
	'time_end_precision',
	'time_start_certainty',
	'time_end_certainty',
	'confidence',
	'research_status',
	'notes'
]);

function pushMapValue(
	map: Map<string, AssertionRecord[]>,
	key: string | undefined,
	record: AssertionRecord
): void {
	if (!key) return;
	const records = map.get(key);
	if (records) {
		records.push(record);
	} else {
		map.set(key, [record]);
	}
}

function yamlScalar(value: AssertionScalar): string {
	if (typeof value === 'string') {
		return JSON.stringify(value);
	}
	return String(value);
}

function assertQualifierKey(key: string): void {
	if (!/^[a-z][a-z0-9_]*$/.test(key)) {
		throw new Error(`Invalid Assertion qualifier key "${key}". Use lowercase snake_case.`);
	}
	if (RESERVED_ASSERTION_KEYS.has(key)) {
		throw new Error(`Assertion qualifier "${key}" collides with a reserved field.`);
	}
}

/**
 * Build deterministic Markdown for a v2 Assertion note.
 *
 * Kept pure so storage format can be regression-tested independently from
 * Obsidian's metadata-cache timing.
 */
export function buildAssertionMarkdown(
	crId: string,
	data: CreateAssertionData
): string {
	const frontmatter: Record<string, unknown> = {
		cr_schema: 2,
		cr_type: 'assertion',
		cr_id: crId,
		assertion_type: data.assertionType,
		subject: data.subject,
		predicate: data.predicate
	};

	if (data.object !== undefined) frontmatter.object = data.object;
	if (data.value !== undefined) frontmatter.value = data.value;
	if (data.timeStart !== undefined) frontmatter.time_start = data.timeStart;
	if (data.timeEnd !== undefined) frontmatter.time_end = data.timeEnd;
	if (data.timeNotBefore !== undefined) frontmatter.time_not_before = data.timeNotBefore;
	if (data.timeNotAfter !== undefined) frontmatter.time_not_after = data.timeNotAfter;
	if (data.timeStartPrecision !== undefined) frontmatter.time_start_precision = data.timeStartPrecision;
	if (data.timeEndPrecision !== undefined) frontmatter.time_end_precision = data.timeEndPrecision;
	if (data.timeStartCertainty !== undefined) frontmatter.time_start_certainty = data.timeStartCertainty;
	if (data.timeEndCertainty !== undefined) frontmatter.time_end_certainty = data.timeEndCertainty;
	if (data.confidence !== undefined) frontmatter.confidence = data.confidence;
	if (data.researchStatus !== undefined) frontmatter.research_status = data.researchStatus;
	if (data.notes !== undefined) frontmatter.notes = data.notes;

	for (const [key, value] of Object.entries(data.qualifiers ?? {})) {
		assertQualifierKey(key);
		frontmatter[key] = value;
	}

	const validation = validateAssertionShape(frontmatter);
	if (!validation.valid) {
		throw new Error(`Invalid Assertion: ${validation.errors.join(' ')}`);
	}

	const lines = [
		'---',
		'cr_schema: 2',
		'cr_type: assertion',
		`cr_id: ${yamlScalar(crId)}`,
		`assertion_type: ${yamlScalar(data.assertionType)}`,
		`subject: ${yamlScalar(data.subject)}`,
		`predicate: ${yamlScalar(data.predicate)}`
	];

	if (data.object !== undefined) lines.push(`object: ${yamlScalar(data.object)}`);
	if (data.value !== undefined) lines.push(`value: ${yamlScalar(data.value)}`);
	if (data.timeStart !== undefined) lines.push(`time_start: ${yamlScalar(data.timeStart)}`);
	if (data.timeEnd !== undefined) lines.push(`time_end: ${yamlScalar(data.timeEnd)}`);
	if (data.timeNotBefore !== undefined) lines.push(`time_not_before: ${yamlScalar(data.timeNotBefore)}`);
	if (data.timeNotAfter !== undefined) lines.push(`time_not_after: ${yamlScalar(data.timeNotAfter)}`);
	if (data.timeStartPrecision !== undefined) lines.push(`time_start_precision: ${yamlScalar(data.timeStartPrecision)}`);
	if (data.timeEndPrecision !== undefined) lines.push(`time_end_precision: ${yamlScalar(data.timeEndPrecision)}`);
	if (data.timeStartCertainty !== undefined) lines.push(`time_start_certainty: ${yamlScalar(data.timeStartCertainty)}`);
	if (data.timeEndCertainty !== undefined) lines.push(`time_end_certainty: ${yamlScalar(data.timeEndCertainty)}`);
	if (data.confidence !== undefined) lines.push(`confidence: ${yamlScalar(data.confidence)}`);
	if (data.researchStatus !== undefined) lines.push(`research_status: ${yamlScalar(data.researchStatus)}`);
	if (data.notes !== undefined) lines.push(`notes: ${yamlScalar(data.notes)}`);

	for (const [key, value] of Object.entries(data.qualifiers ?? {})) {
		lines.push(`${key}: ${yamlScalar(value)}`);
	}

	lines.push('---');

	const title = data.title?.trim();
	return `${lines.join('\n')}\n\n${title ? `# ${title}\n` : ''}`;
}

/**
 * v2 Assertion read/write boundary.
 *
 * The service owns materialized Assertion notes only. Virtual assertions from
 * compact genealogy/provider data belong to a later semantic projection layer.
 */
export class AssertionService {
	private cache: AssertionCache | null = null;

	constructor(
		private readonly app: App,
		private readonly ontology?: OntologyRegistry,
		private readonly options: AssertionServiceOptions = {}
	) {}

	setupVaultListeners(plugin: Plugin): void {
		plugin.registerEvent(
			this.app.metadataCache.on('changed', (file, _data, cache) => {
				const isAssertion = cache?.frontmatter?.cr_type === 'assertion';
				if (isAssertion || this.cacheContainsFile(file.path)) {
					this.invalidateCache();
				}
			})
		);
		plugin.registerEvent(
			this.app.vault.on('delete', file => {
				if (file instanceof TFile && this.cacheContainsFile(file.path)) {
					this.invalidateCache();
				}
			})
		);
		plugin.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				if (
					file instanceof TFile
					&& (this.cacheContainsFile(oldPath) || this.cacheContainsFile(file.path))
				) {
					this.invalidateCache();
				}
			})
		);
	}

	invalidateCache(): void {
		this.cache = null;
	}

	private cacheContainsFile(filePath: string): boolean {
		if (!this.cache) return false;
		return this.cache.valid.some(record => record.filePath === filePath)
			|| this.cache.invalid.some(record => record.filePath === filePath);
	}

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

	private buildCache(): AssertionCache {
		const valid: AssertionRecord[] = [];
		const invalid: InvalidAssertionRecord[] = [];
		const bySubject = new Map<string, AssertionRecord[]>();
		const byObject = new Map<string, AssertionRecord[]>();
		const byPredicate = new Map<string, AssertionRecord[]>();
		const byAssertionType = new Map<string, AssertionRecord[]>();

		const files = this.options.fileProvider?.()
			?? this.app.vault.getMarkdownFiles();
		for (const file of files) {
			const parsed = this.parseFile(file);
			if (!parsed) continue;

			if ('assertion' in parsed) {
				valid.push(parsed);
				pushMapValue(bySubject, parsed.assertion.subject, parsed);
				pushMapValue(byObject, parsed.assertion.object, parsed);
				pushMapValue(byPredicate, parsed.assertion.predicate, parsed);
				pushMapValue(byAssertionType, parsed.assertion.assertion_type, parsed);
			} else {
				invalid.push(parsed);
			}
		}

		return {
			valid,
			invalid,
			bySubject,
			byObject,
			byPredicate,
			byAssertionType
		};
	}

	private ensureCache(): AssertionCache {
		if (!this.cache) {
			this.cache = this.buildCache();
		}
		return this.cache;
	}

	scan(): AssertionScanResult {
		const cache = this.ensureCache();
		return {
			valid: [...cache.valid],
			invalid: [...cache.invalid]
		};
	}

	getAll(): AssertionRecord[] {
		return [...this.ensureCache().valid];
	}

	getInvalid(): InvalidAssertionRecord[] {
		return [...this.ensureCache().invalid];
	}

	getForSubject(subject: string): AssertionRecord[] {
		return [...(this.ensureCache().bySubject.get(subject) ?? [])];
	}

	getForObject(object: string): AssertionRecord[] {
		return [...(this.ensureCache().byObject.get(object) ?? [])];
	}

	getByPredicate(predicate: string): AssertionRecord[] {
		return [...(this.ensureCache().byPredicate.get(predicate) ?? [])];
	}

	getByAssertionType(assertionType: string): AssertionRecord[] {
		return [...(this.ensureCache().byAssertionType.get(assertionType) ?? [])];
	}

	/**
	 * Resolve subject/object wikilinks through Obsidian and return all materialized
	 * Assertions touching a specific file. This survives path-qualified and
	 * alias-form wikilinks.
	 */
	getForFile(file: TFile): AssertionRecord[] {
		return this.getAll().filter(record => {
			const sourcePath = record.file.path;
			const subjectFile = resolvePathToFile(this.app, record.assertion.subject, sourcePath);
			if (subjectFile?.path === file.path) return true;

			if (record.assertion.object) {
				const objectFile = resolvePathToFile(this.app, record.assertion.object, sourcePath);
				if (objectFile?.path === file.path) return true;
			}
			return false;
		});
	}

	async createAssertion(
		data: CreateAssertionData,
		options: CreateAssertionOptions = {}
	): Promise<TFile> {
		if (this.ontology) {
			if (!this.ontology.hasType('assertion_type', data.assertionType)) {
				throw new Error(`Unknown assertion_type "${data.assertionType}".`);
			}
			if (!this.ontology.hasPredicate(data.predicate)) {
				throw new Error(`Unknown predicate "${data.predicate}".`);
			}
		}

		const crId = generateCrId();
		const markdown = buildAssertionMarkdown(crId, data);
		const folder = normalizePath(
			options.folder
			?? this.options.defaultFolderProvider?.()
			?? 'Assertions'
		);
		await this.ensureFolderExists(folder);

		const stem = sanitizeFilename(
			data.title?.trim()
			|| `${data.predicate}-${crId}`
		);
		const filePath = await this.nextAvailablePath(folder, stem);
		const file = await this.app.vault.create(filePath, markdown);

		// vault.create() and MetadataCache run on separate schedules. The generic
		// changed-event helper can miss the first parse when Obsidian emits it
		// before the listener is attached, so also wait until the newly-created
		// note is observably indexed with the expected cr_id.
		await waitForCacheRefresh(this.app, file);
		await this.waitForIndexedAssertion(file, crId);
		this.invalidateCache();
		return file;
	}

	private async waitForIndexedAssertion(
		file: TFile,
		crId: string,
		timeoutMs = 2500
	): Promise<void> {
		const deadline = Date.now() + timeoutMs;
		for (;;) {
			const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (
				frontmatter?.cr_type === 'assertion'
				&& frontmatter.cr_id === crId
			) {
				return;
			}
			if (Date.now() >= deadline) {
				throw new Error(
					`Timed out waiting for Obsidian to index Assertion "${file.path}".`
				);
			}
			await new Promise<void>(resolve => window.setTimeout(resolve, 25));
		}
	}

	private async nextAvailablePath(folder: string, stem: string): Promise<string> {
		let suffix = 0;
		for (;;) {
			const filename = suffix === 0 ? `${stem}.md` : `${stem}-${suffix + 1}.md`;
			const path = normalizePath(`${folder}/${filename}`);
			if (!this.app.vault.getAbstractFileByPath(path)) {
				return path;
			}
			suffix++;
		}
	}

	private async ensureFolderExists(folder: string): Promise<void> {
		const normalized = normalizePath(folder);
		if (!normalized || normalized === '/') return;

		let current = '';
		for (const segment of normalized.split('/').filter(Boolean)) {
			current = current ? `${current}/${segment}` : segment;
			const existing = this.app.vault.getAbstractFileByPath(current);
			if (existing instanceof TFolder) continue;
			if (existing) {
				throw new Error(`Cannot create Assertion folder "${current}": a file exists at that path.`);
			}
			await this.app.vault.createFolder(current);
		}
	}
}
