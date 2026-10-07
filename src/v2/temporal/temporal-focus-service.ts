export type TemporalAxis =
	| {
		kind: 'julian_day';
	}
	| {
		kind: 'chronology_year';
		chronologyId: string;
		label?: string;
		universe?: string;
	};

export type TemporalFocus =
	| {
		kind: 'point';
		position: number;
		/**
		 * Omitted for the legacy/default Julian Day axis so existing persisted
		 * view-state/test shapes remain stable.
		 */
		axis?: TemporalAxis;
		source?: string;
	}
	| {
		kind: 'range';
		start: number;
		endExclusive: number;
		axis?: TemporalAxis;
		source?: string;
	};

export type TemporalFocusListener = (
	focus: TemporalFocus | null
) => void;

const JULIAN_DAY_AXIS: TemporalAxis = { kind: 'julian_day' };

function cloneAxis(axis: TemporalAxis | undefined): TemporalAxis | undefined {
	return axis ? { ...axis } : undefined;
}

function cloneFocus(focus: TemporalFocus): TemporalFocus {
	return focus.kind === 'point'
		? {
			kind: 'point',
			position: focus.position,
			...(focus.axis ? { axis: cloneAxis(focus.axis) } : {}),
			source: focus.source
		}
		: {
			kind: 'range',
			start: focus.start,
			endExclusive: focus.endExclusive,
			...(focus.axis ? { axis: cloneAxis(focus.axis) } : {}),
			source: focus.source
		};
}

function assertAxis(axis: TemporalAxis): void {
	if (axis.kind === 'chronology_year' && !axis.chronologyId.trim()) {
		throw new Error('Chronology-year focus requires a chronology id.');
	}
}

export function getTemporalFocusAxis(focus: TemporalFocus): TemporalAxis {
	return cloneAxis(focus.axis) ?? { ...JULIAN_DAY_AXIS };
}

export function isJulianDayFocus(
	focus: TemporalFocus | null | undefined
): focus is TemporalFocus {
	return Boolean(focus)
		&& (!focus!.axis || focus!.axis.kind === 'julian_day');
}

export function isChronologyYearFocus(
	focus: TemporalFocus | null | undefined
): focus is TemporalFocus & { axis: Extract<TemporalAxis, { kind: 'chronology_year' }> } {
	return Boolean(focus?.axis?.kind === 'chronology_year');
}

/**
 * Runtime-only coordination state shared by temporal views.
 *
 * The default/legacy axis is canonical Julian Day. Axis metadata is omitted
 * for that default so existing callers keep the same object shape.
 *
 * Chronology-local axes are explicit and must never be interpreted as JDN by
 * consumers that do not support them.
 */
export class TemporalFocusService {
	private focus: TemporalFocus | null = null;
	private readonly listeners = new Set<TemporalFocusListener>();

	get(): TemporalFocus | null {
		return this.focus ? cloneFocus(this.focus) : null;
	}

	setPoint(position: number, source?: string): void {
		this.assertPoint(position);
		this.set({
			kind: 'point',
			position,
			source
		});
	}

	setRange(
		start: number,
		endExclusive: number,
		source?: string
	): void {
		this.assertRange(start, endExclusive);
		this.set({
			kind: 'range',
			start,
			endExclusive,
			source
		});
	}

	setAxisPoint(
		position: number,
		axis: TemporalAxis,
		source?: string
	): void {
		this.assertPoint(position);
		assertAxis(axis);
		if (axis.kind === 'julian_day') {
			this.setPoint(position, source);
			return;
		}
		this.set({
			kind: 'point',
			position,
			axis: cloneAxis(axis),
			source
		});
	}

	setAxisRange(
		start: number,
		endExclusive: number,
		axis: TemporalAxis,
		source?: string
	): void {
		this.assertRange(start, endExclusive);
		assertAxis(axis);
		if (axis.kind === 'julian_day') {
			this.setRange(start, endExclusive, source);
			return;
		}
		this.set({
			kind: 'range',
			start,
			endExclusive,
			axis: cloneAxis(axis),
			source
		});
	}

	clear(): void {
		if (this.focus === null) return;
		this.focus = null;
		for (const listener of this.listeners) {
			listener(null);
		}
	}

	/**
	 * Re-emit the current focus without changing it. Workspace switches use
	 * this so subscribers recompute the same instant/interval against the
	 * newly active dataset.
	 */
	refresh(): void {
		const current = this.get();
		for (const listener of this.listeners) {
			listener(current ? cloneFocus(current) : null);
		}
	}

	subscribe(listener: TemporalFocusListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private assertPoint(position: number): void {
		if (!Number.isFinite(position)) {
			throw new Error('Temporal focus point must be finite.');
		}
	}

	private assertRange(start: number, endExclusive: number): void {
		if (
			!Number.isFinite(start)
			|| !Number.isFinite(endExclusive)
			|| endExclusive <= start
		) {
			throw new Error(
				'Temporal focus range must be finite and end after start.'
			);
		}
	}

	private set(next: TemporalFocus): void {
		this.focus = cloneFocus(next);
		for (const listener of this.listeners) {
			listener(cloneFocus(next));
		}
	}
}
