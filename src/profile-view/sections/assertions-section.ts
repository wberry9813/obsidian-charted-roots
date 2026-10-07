/**
 * Structured Assertions Section
 *
 * Shows first-class v2 Assertion notes on entity profiles. Virtual Assertions
 * (for example father/mother/spouse projected from compact Person frontmatter)
 * are intentionally excluded here because the legacy Family/Relationship UI
 * already renders them. They remain available to the semantic graph layer.
 */

import type { App, TFile } from 'obsidian';
import type CanvasRootsPlugin from '../../../main';
import type { SemanticAssertion } from '../../v2/semantic-assertion-service';
import type { PlaceDesignationEntry } from '../../v2/maps/place-designation-service';
import { resolvePathToFile } from '../../utils/wikilink-resolver';
import type { SectionState, SectionToggleFn } from '../profile-types';
import { renderProfileSection } from './section-base';

export interface AssertionsSectionOptions {
	sectionStates: SectionState;
	onToggle: SectionToggleFn;
	app: App;
	plugin: CanvasRootsPlugin;
	entityFile: TFile;
	onAddHistoricalName?: () => void;
	historicalNameFocus?: {
		active: PlaceDesignationEntry[];
		possible: PlaceDesignationEntry[];
	};
}

export function getMaterializedProfileAssertions(
	assertions: SemanticAssertion[]
): SemanticAssertion[] {
	return assertions.filter(assertion => assertion.origin === 'assertion_note');
}

export function summarizeHistoricalNameFocus(
	focus: AssertionsSectionOptions['historicalNameFocus']
): { state: 'active' | 'possible'; names: string[] } | null {
	if (!focus) return null;
	const active = [...new Set(
		focus.active
			.filter(entry => entry.designationType === 'historical_name')
			.map(entry => entry.name)
	)];
	if (active.length > 0) return { state: 'active', names: active };

	const possible = [...new Set(
		focus.possible
			.filter(entry => entry.designationType === 'historical_name')
			.map(entry => entry.name)
	)];
	return possible.length > 0
		? { state: 'possible', names: possible }
		: null;
}

export function formatAssertionTime(assertion: SemanticAssertion): string {
	const start = assertion.time_start?.trim();
	const end = assertion.time_end?.trim();

	if (start && end) return `${start} – ${end}`;
	if (start) return start;
	if (end) return `– ${end}`;

	const notBefore = assertion.time_not_before?.trim();
	const notAfter = assertion.time_not_after?.trim();
	if (notBefore && notAfter) return `${notBefore} … ${notAfter}`;
	if (notBefore) return `≥ ${notBefore}`;
	if (notAfter) return `≤ ${notAfter}`;
	return '';
}

function stripWikilink(value: string): string {
	const match = value.match(/^\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]$/);
	if (!match) return value;
	return (match[2] || match[1]).trim();
}

function targetForEntity(
	assertion: SemanticAssertion,
	entityFile: TFile,
	app: App
): { value: string; link?: string; inbound: boolean } {
	const sourcePath = assertion.sourceFile?.path ?? entityFile.path;
	const subjectFile = resolvePathToFile(app, assertion.subject, sourcePath);
	const entityIsSubject = subjectFile?.path === entityFile.path;

	if (entityIsSubject) {
		if (assertion.object) {
			return {
				value: stripWikilink(assertion.object),
				link: assertion.object,
				inbound: false
			};
		}
		return {
			value: assertion.value === undefined ? '' : String(assertion.value),
			inbound: false
		};
	}

	return {
		value: stripWikilink(assertion.subject),
		link: assertion.subject,
		inbound: true
	};
}

function displayLocale(): string {
	const lang = document.documentElement.lang?.trim();
	if (!lang) return 'en';
	if (lang.toLowerCase().startsWith('zh')) return 'zh-CN';
	return lang;
}

export function renderAssertionsSection(
	parent: HTMLElement,
	assertions: SemanticAssertion[],
	options: AssertionsSectionOptions
): void {
	const materialized = getMaterializedProfileAssertions(assertions);
	const focusSummary = summarizeHistoricalNameFocus(
		options.historicalNameFocus
	);
	if (
		materialized.length === 0
		&& !options.onAddHistoricalName
		&& !focusSummary
	) return;

	const content = renderProfileSection(parent, {
		sectionId: 'structured-assertions',
		title: 'Structured assertions',
		summary: `${materialized.length} assertion${materialized.length === 1 ? '' : 's'}`,
		expanded: options.sectionStates['structured-assertions'] ?? true,
		onToggle: options.onToggle,
		icon: 'waypoints'
	});
	if (!content) return;

	if (options.onAddHistoricalName) {
		const actions = content.createDiv({
			cls: 'cr-profile__assertion-actions'
		});
		const add = actions.createEl('button', {
			text: 'Add historical name',
			cls: 'cr-profile__add-historical-name'
		});
		add.addEventListener('click', options.onAddHistoricalName);
	}

	if (focusSummary) {
		const focus = content.createDiv({
			cls: 'cr-profile__historical-name-focus'
		});
		focus.dataset.temporalState = focusSummary.state;
		focus.createSpan({
			cls: 'cr-profile__historical-name-focus-label',
			text: focusSummary.state === 'active'
				? 'Historical name at focus: '
				: 'Possible historical name at focus: '
		});
		focus.createSpan({
			cls: 'cr-profile__historical-name-focus-value',
			text: focusSummary.names.join(' / ')
		});
	}

	const registry = options.plugin.getV2OntologyRegistry();
	const locale = displayLocale();

	for (const assertion of materialized) {
		const item = content.createDiv({ cls: 'cr-profile__rel-item cr-profile__assertion-item' });
		const row = item.createDiv({ cls: 'cr-profile__rel-row' });
		const predicateLabel = registry.getPredicateLabel(assertion.predicate, locale);
		const target = targetForEntity(assertion, options.entityFile, options.app);

		row.createSpan({
			text: target.inbound ? `← ${predicateLabel}` : predicateLabel,
			cls: 'cr-profile__rel-type-label cr-profile__assertion-predicate'
		});

		if (target.link) {
			const link = row.createSpan({
				text: target.value,
				cls: 'cr-profile__entity-link cr-profile__assertion-target'
			});
			link.addEventListener('click', () => {
				void options.app.workspace.openLinkText(
					target.link!,
					assertion.sourceFile?.path ?? options.entityFile.path,
					false
				);
			});
		} else {
			row.createSpan({
				text: target.value,
				cls: 'cr-profile__assertion-value'
			});
		}

		const time = formatAssertionTime(assertion);
		if (time) {
			row.createSpan({ text: time, cls: 'cr-profile__rel-dates cr-profile__assertion-time' });
		}

		if (assertion.materialized?.assertion.notes?.trim()) {
			item.createDiv({
				text: assertion.materialized.assertion.notes,
				cls: 'cr-profile__rel-notes'
			});
		}
	}
}
