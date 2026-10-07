# Temporal Views Foundation

> Status: **T0-T2 implemented; D3 Timeline MVP under real-Obsidian validation**
>
> This document supersedes the Event-only assumptions in the older
> `docs/planning/interactive-timeline-view.md` wherever the two conflict.

## 1. Goal

Temporal views are not an Event list with a zoomable axis.

The v2 temporal layer must present one normalized read model over:

- Event;
- Process;
- Period;
- time-bounded Assertion.

Future Timeline, Map and time-aware graph surfaces consume that model rather
than parsing frontmatter independently.

~~~text
Markdown
  Event / Process / Period / Assertion
              ↓
HistoricalDateService
              ↓
TemporalProjectionService
              ↓
TemporalItem[]
       ↓        ↓        ↓
   Timeline    Map    Relation graph
~~~

## 2. TemporalItem is the renderer boundary

`TemporalItem` preserves:

- source file/id;
- temporal kind;
- type/predicate metadata;
- original authored expressions;
- start/end/not-before/not-after boundaries;
- declared precision/certainty;
- parser-resolved precision/certainty;
- resolved / partial / ambiguous / unresolved / undated status;
- legacy Event versus native v2 provenance.

Renderers must not read `date`, `time_start` or other storage fields
directly once they adopt this layer.

## 3. No false precision

A renderer must never turn a year into an arbitrary day merely because a UI
library requires a JavaScript `Date`.

Example:

~~~yaml
time_start: BCE 453
~~~

means the year interval represented by BCE 453. It does **not** mean January 1
of that year.

The historical-date parser's inferred precision is authoritative for
positional precision. Explicit `time_*_precision` metadata is preserved for
validation, but contradictory metadata cannot manufacture a finer coordinate.

An exact day and a year-only expression in the same year may therefore compare
as overlapping/equal rather than receiving an invented intra-year ordering.

## 4. Ambiguity is data

Temporal parsing can be:

- `resolved`;
- `ambiguous`;
- `unresolved`.

Temporal projection preserves those states. A UI may place unresolved or
ambiguous material in a review lane/list, but must not silently pick a
candidate or invent a coordinate.

Undated Event/Process/Period notes remain valid temporal entities and may be
shown in an undated section. Undated Assertions stay semantic graph edges and
are not timeline items until they gain a temporal constraint.

## 5. Migration compatibility boundary

During the one-way Schema v2 transition, Event is special:

- native v2 fields: `time_start`, `time_end`, `time_not_before`,
  `time_not_after`;
- legacy fallback: `date`, `date_end`.

If both exist, v2 fields win for the corresponding boundary.

Legacy `date_precision` is deliberately not trusted as v2 precision because
it mixes precision, certainty and range semantics. The projection parses the
actual expression instead.

This compatibility belongs in `TemporalProjectionService`, not in each
Timeline/Map renderer.

## 6. Workspace boundary

`TemporalProjectionService` accepts a dynamic file provider.

The plugin injects the Active Workspace scope, so one service instance follows
Workspace switches without owning a separate stale cache.

Whole-vault projection is only the standalone fallback when no Workspace
runtime is available.

## 7. Initial M5 implementation phases

### T0 — normalized projection

- [x] `TemporalItem` contract;
- [x] Event / Process / Period / time-bounded Assertion projection;
- [x] legacy Event date fallback;
- [x] HistoricalDateService parsing;
- [x] Workspace-scoped file provider;
- [x] resolved/ambiguous/unresolved/undated preservation;
- [x] non-lossy chronological comparison;
- [x] precision-declaration conflict diagnostics;
- [x] renderer-neutral Julian Day interval projection.

### T1 — temporal validation and queries

- [x] precision conflict diagnostics;
- [x] invalid/inverted start/end interval checks;
- [x] query helpers: items active at time, overlapping range, before/after range;
- [x] subject/object/predicate/type/universe filters for temporal queries;
- [x] stable grouping keys for person/place/organization/universe.

### T2 — renderer adapter

The renderer-neutral axis is a Julian Day half-open interval
`[start, endExclusive)`. Historical year ticks are generated at real calendar
year boundaries and formatted through historical BCE/CE numbering.

The current renderer choice is **D3**:

- D3 is already a project dependency;
- `scaleLinear` consumes the Julian Day axis directly;
- BCE/CE labels remain our own historical ticks rather than JavaScript
  `Date` formatting;
- year-only expressions remain full intervals instead of representative
  January 1 points;
- pan/zoom can rescale the same numeric axis without changing temporal
  semantics.

The older `vis-timeline` proposal remains useful design research, but is not
the selected v2 renderer because its Date-oriented axis would require an
additional mapping layer that is unnecessary with D3.

### T3 — interactive Timeline view

- [x] dockable full-size main-tab view;
- [x] Event / Process / Period / Assertion visual distinction;
- [x] exact/coarse date and start/end interval rendering;
- [x] D3 zoom/pan on the Julian Day axis;
- [x] filtering controls;
- [x] search;
- [x] click-to-open-note behavior;
- [x] optional person/place/organization/universe swimlanes;
- [x] unresolved/ambiguous/metadata-conflict review surface;
- [x] Active Workspace switching with live refresh;
- [x] visual treatment for open/constraint windows.

### T4 — temporal graph/map integration

- [x] read-only Assertion relationship state at an exact axis position / range;
- [ ] relationship state wired into the relationship graph UI;
- organization/office/affiliation state over time;
- timeline ↔ map synchronization;
- Period/Process contextual overlays.

## 8. Reuse from the legacy timeline system

Reuse where semantics still fit:

- existing event colors/icons where Event items are rendered;
- timeline export naming;
- relevant filter/search UI patterns;
- existing report/canvas output utilities when they can consume TemporalItem.

Do not reuse assumptions that:

- every temporal item is an Event;
- every sortable value can be reduced to a JavaScript `Date`;
- year/month precision can be represented by the first day;
- legacy `before` / `after` semantics are authoritative.

## 9. Renderer acceptance gate

The pre-renderer gate is now covered by automated tests and real-Obsidian
fixtures. The contract remains:

1. Event, Process, Period and timed Assertion share one projection contract;
2. legacy Event and v2 Event dates coexist without duplicate boundaries;
3. Workspace switching changes the projected dataset;
4. BCE/CE order is correct;
5. year-only versus exact-day overlap does not invent order;
6. contradictory precision metadata cannot increase positional precision;
7. ambiguous/unresolved expressions remain non-coordinate states;
8. interval and bound queries behave correctly.

These conditions are now satisfied by the D3/JDN implementation path.
Renderer/UI work must continue to consume `TimelineModel` rather than bypassing
it.
