# Historical Time Architecture

## 1. Problem

Historical time is not one date-string format. The same year may be expressed as 前453年, 453 BCE, a Zhou royal regnal year, a state/ruler regnal year, a sexagenary year, or later an era-name year such as 贞观十年.

These may refer to the same underlying time while preserving different historical contexts.

## 2. One time, multiple representations

The architecture distinguishes:

1. original expression — what the source/user wrote;
2. chronology context — polity/ruler/era/calendar needed to interpret it;
3. canonical interval — internal normalized time used for sorting/comparison;
4. display format — how the UI renders the same time.

The vault should preserve meaningful historical expressions instead of replacing them with fake ISO dates.

## 3. Unified temporal fields

~~~yaml
time_start:
time_end:
time_not_before:
time_not_after:
time_start_precision:
time_end_precision:
time_start_certainty:
time_end_certainty:
~~~

Not every field is required.

## 4. Precision and certainty are independent

Precision values initially:

- `day`
- `month`
- `year`
- `decade`
- `unknown`

Certainty values initially:

- `certain`
- `approximate`
- `inferred`
- `uncertain`
- `disputed`
- `unknown`

Example:

~~~yaml
time_start: 前453年
time_start_precision: year
time_start_certainty: approximate
~~~

`approximate` is not a precision.

## 5. Do not manufacture false precision

A year-only statement must not become January 1st as if the exact day were historically known. Year-level values resolve to an interval representing the year.

## 6. Canonical representation

The internal engine should use a continuous temporal representation suitable for BCE/CE and cross-calendar work rather than JavaScript `Date` as the authoritative model.

A Julian Day Number or equivalent continuous day index is the preferred direction for day-level normalization. Year-level values may remain interval-based.

## 7. No-year-zero handling

Historical BCE/CE display has no year zero. Internal astronomical numbering is acceptable, but conversion must be explicit and tested.

Required regression case: 1 BCE -> 1 CE must sort correctly without displaying year 0.

## 8. Parser contract

Historical parsing must allow ambiguity.

Conceptual API:

~~~ts
parse(expression, context): TemporalParseResult
~~~

Possible states:

- `resolved`
- `ambiguous`
- `unresolved`

Repeated era names or insufficient context should produce candidates instead of silently choosing one.

## 9. Chronology context

A chronology context can influence preferred display, for example:

- 前453年
- 周王纪年
- 晋国纪年
- 赵氏纪年
- 干支

The Event should not need duplicated fields for every simultaneous chronology.

## 10. Chinese chronology families

Chinese History Pack should progressively support:

- Common Era / BCE-CE;
- ruler/regnal year;
- era-name year;
- sexagenary cycle;
- Chinese lunisolar dates.

The architecture should remain reusable for Japanese, Korean and Vietnamese era systems later.

## 11. Provider-based time engine

~~~text
HistoricalDateService
    ├ TymeProvider
    ├ SxwnlProvider
    ├ ChineseEraProvider
    ├ WikidataChronologyProvider
    └ CustomCalendarProvider
~~~

The service owns parser routing, ambiguity handling, normalization, formatting, interval comparison and sorting. Providers own specific algorithms/data.

## 12. Reuse mature libraries

Current direction:

- Tyme4TS / lunar ecosystem as the TypeScript-friendly calendar/sexagenary/lunisolar base;
- 寿星天文历 / related ports as a deeper historical provider/cross-check source where license/use conditions fit;
- Wikidata as an external structured chronology metadata provider where useful.

Exact bundling and redistribution details must be verified before implementation.

## 13. Canonical values should not pollute frontmatter by default

Avoid writing implementation fields such as `canonical_jdn`, `astronomical_year` or `normalized_start` into every note.

~~~text
Markdown expression
    ↓
HistoricalDateService
    ↓
TemporalValue
    ↓
rebuildable index/cache
~~~

If native Bases later needs sortable materialized fields, make that optional.

## 14. Relative ordering

Legacy `before` / `after` semantics are not retained. v2 should use unambiguous names such as `chronologically_before` and `chronologically_after` with ordinary semantics.
