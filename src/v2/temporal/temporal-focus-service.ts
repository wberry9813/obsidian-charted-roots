export type TemporalFocus =
	| {
		kind: 'point';
		position: number;
		source?: string;
	}
	| {
		kind: 'range';
		start: number;
		endExclusive: number;
		source?: string;
	};

export type TemporalFocusListener = (
	focus: TemporalFocus | null
) => void;

/**
 * Runtime-only coordination state shared by temporal views.
 *
 * Timeline, Relationships and Map can exchange one canonical Julian Day focus
 * without depending on each other's view instances. This is navigation state,
 * not research data, so it is intentionally not persisted to the vault.
 */
export class TemporalFocusService {
	private focus: TemporalFocus | null = null;
	private readonly listeners = new Set<TemporalFocusListener>();

	get(): TemporalFocus | null {
		return this.focus ? { ...this.focus } : null;
	}

	setPoint(position: number, source?: string): void {
		if (!Number.isFinite(position)) {
			throw new Error('Temporal focus point must be finite.');
		}
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
		if (
			!Number.isFinite(start)
			|| !Number.isFinite(endExclusive)
			|| endExclusive <= start
		) {
			throw new Error(
				'Temporal focus range must be finite and end after start.'
			);
		}
		this.set({
			kind: 'range',
			start,
			endExclusive,
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

	subscribe(listener: TemporalFocusListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private set(next: TemporalFocus): void {
		this.focus = next;
		for (const listener of this.listeners) {
			listener({ ...next });
		}
	}
}
