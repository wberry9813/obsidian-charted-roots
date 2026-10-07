import type CanvasRootsPlugin from '../../../main';
import type {
	TemporalFocus,
	TemporalInstitutionStateEntry,
	TemporalInstitutionStateSnapshot
} from '../../v2';
import { astronomicalYearToHistorical } from '../../v2/time/historical-year';
import type {
	EntityLinkClickFn,
	SectionState,
	SectionToggleFn
} from '../profile-types';
import { renderProfileSection } from './section-base';

export interface TemporalInstitutionProfileEntry {
	state: 'active' | 'possible';
	entry: TemporalInstitutionStateEntry;
	inbound: boolean;
}

export interface TemporalInstitutionSectionOptions {
	sectionStates: SectionState;
	onToggle: SectionToggleFn;
	onEntityLinkClick: EntityLinkClickFn;
	plugin: CanvasRootsPlugin;
}

export function getTemporalInstitutionEntriesForEntity(
	snapshot: TemporalInstitutionStateSnapshot,
	crId: string
): TemporalInstitutionProfileEntry[] {
	const result: TemporalInstitutionProfileEntry[] = [];

	for (const [state, entries] of [
		['active', snapshot.active],
		['possible', snapshot.possible]
	] as const) {
		for (const entry of entries) {
			if (entry.subject.crId === crId) {
				result.push({ state, entry, inbound: false });
			} else if (entry.object.crId === crId) {
				result.push({ state, entry, inbound: true });
			}
		}
	}

	return result;
}

function locale(): string {
	const lang = document.documentElement.lang?.trim();
	if (!lang) return 'en';
	if (lang.toLowerCase().startsWith('zh')) return 'zh-CN';
	return lang;
}

function formatPoint(
	plugin: CanvasRootsPlugin,
	position: number
): string {
	const calendar = plugin.getHistoricalDateService()
		.getCalendarProvider('tyme');
	if (!calendar) return 'Temporal focus';

	const solar = calendar.julianDayToSolar(position);
	const historical = astronomicalYearToHistorical(solar.year);
	const month = String(solar.month).padStart(2, '0');
	const day = String(solar.day).padStart(2, '0');
	return `${historical.year} ${historical.era} · ${month}-${day}`;
}

function formatFocus(
	plugin: CanvasRootsPlugin,
	focus: TemporalFocus
): string {
	return focus.kind === 'point'
		? formatPoint(plugin, focus.position)
		: `${formatPoint(plugin, focus.start)} → ${formatPoint(plugin, focus.endExclusive)}`;
}

export function renderTemporalInstitutionSection(
	parent: HTMLElement,
	crId: string,
	options: TemporalInstitutionSectionOptions
): void {
	const focus = options.plugin.getTemporalFocusService().get();
	if (!focus) return;

	const service = options.plugin.getTemporalInstitutionStateService();
	if (!service) return;

	const snapshot = focus.kind === 'point'
		? service.getAt(focus.position)
		: service.getRange({
			start: focus.start,
			endExclusive: focus.endExclusive
		});

	const entries = getTemporalInstitutionEntriesForEntity(snapshot, crId);
	if (entries.length === 0) return;

	const activeCount = entries.filter(value => value.state === 'active').length;
	const possibleCount = entries.length - activeCount;
	const content = renderProfileSection(parent, {
		sectionId: 'temporal-institution-state',
		title: 'At temporal focus',
		summary: `${activeCount} active · ${possibleCount} possible`,
		expanded: options.sectionStates['temporal-institution-state'] ?? true,
		onToggle: options.onToggle,
		icon: 'landmark'
	});
	if (!content) return;

	content.createDiv({
		text: formatFocus(options.plugin, focus),
		cls: 'cr-profile__rel-dates cr-profile__temporal-focus-label'
	});

	const registry = options.plugin.getV2OntologyRegistry();
	for (const value of entries) {
		const { entry } = value;
		const target = value.inbound ? entry.subject : entry.object;
		const item = content.createDiv({
			cls: 'cr-profile__rel-item cr-profile__temporal-institution-item',
			attr: {
				'data-temporal-state': value.state,
				'data-assertion-id': entry.assertionId,
				'data-relation-kind': entry.relationKind
			}
		});
		const row = item.createDiv({ cls: 'cr-profile__rel-row' });
		const predicate = registry.getPredicateLabel(entry.predicate, locale());

		row.createSpan({
			text: value.inbound ? `← ${predicate}` : predicate,
			cls: 'cr-profile__rel-type-label'
		});

		const targetEl = row.createSpan({
			text: target.label,
			cls: 'cr-profile__entity-link'
		});
		if (target.crId && target.filePath) {
			targetEl.addEventListener('click', () => {
				options.onEntityLinkClick(
					target.crId!,
					target.label,
					target.kind,
					target.filePath!
				);
			});
		}

		row.createSpan({
			text: value.state === 'active' ? 'Active' : 'Possible',
			cls: value.state === 'active'
				? 'cr-profile__member-badge cr-profile__member-badge--current'
				: 'cr-profile__member-badge'
		});
	}
}
