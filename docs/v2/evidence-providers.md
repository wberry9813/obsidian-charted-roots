# Evidence, Claims, Providers and Reuse

## 1. Core evidence rule

**Source ≠ Citation ≠ Assertion ≠ Claim.**

~~~text
Source
  ↓
Citation
  ↓
Assertion
  ↓
Claim / interpretation
~~~

A Source is the work/document/object. A Citation identifies a specific location/occurrence and how it relates to a target fact. An Assertion is a factual proposition/relation. A Claim is interpretation, explanation, evaluation or hypothesis.

## 2. Citation model

~~~yaml
cr_type: citation
source: "[[史记]]"
target: "[[某 Assertion]]"
target_property:
locator: 卷四十三...
quote:
relation: supports
quality:
~~~

A Citation may target an Assertion, a Claim, or a compact property such as `born` via `target_property`.

Initial `relation` values:

- `supports`
- `conflicts`
- `mentions`
- `attributes`

Conflicting evidence must coexist. The system must not resolve contradiction by deleting one source.

## 3. Claim model

~~~yaml
cr_type: claim
claim_type: causal
statement: ...
asserted_by: "[[渤海小吏]]"
about:
  - "[[魏国]]"
evidence:
  - "[[相关 Assertion]]"
~~~

User-authored claims may use `asserted_by: self`.

AI-assisted workflows must preserve the distinction between source statement, factual assertion, inference, attributed interpretation and user opinion.

## 4. Existing evidence infrastructure

The fork should retain and extend upstream Charted Roots capabilities around Source, Citation, Proof Summary, source classification, information classification, evidence classification and confidence.

History-mode evidence should converge on Citation records rather than multiplying new `sourced_*` fields for every new historical fact type.

## 5. Research workflow

Preferred flow:

~~~text
raw source
  ↓
extract assertions
  ↓
attach citations
  ↓
preserve conflicts
  ↓
build entities / temporal structure
  ↓
form claims and synthesis
  ↓
write prose last
~~~

AI must not invent dates, collapse contradictions or silently turn attributed interpretation into fact.

## 6. Reuse strategy

Engineering principle: **Reuse -> Adapt -> Implement**.

For substantial subsystems:

1. use a mature open-source library if it fits;
2. wrap an implementation behind an adapter if its data model differs;
3. call an open API through a provider where live lookup is useful;
4. normalize an open dataset when offline use is better;
5. write a new implementation only when necessary.

## 7. Provider boundary

External libraries/services must not become the core data model.

~~~text
External library / API / dataset
          ↓
       Provider
          ↓
Normalization layer
          ↓
v2 semantic model
~~~

Likely provider families:

- `ChronologyProvider`
- `CalendarProvider`
- `EntityProvider`
- `PlaceProvider`
- `MapProvider`
- `AuthorityProvider`

Exact TypeScript interfaces remain implementation work.

## 8. Historical calendar reuse

Current integration direction:

- **Tyme4TS / lunar ecosystem**: primary candidate for a TypeScript-friendly calendar, sexagenary and Chinese lunisolar base.
- **寿星天文历 / compatible ports**: candidate deeper historical calendar provider and cross-check source where license/use conditions permit.
- **Wikidata**: external structured chronology/entity metadata provider where useful.

The project should not rewrite mature calendar math merely to avoid dependencies.

## 9. Wikidata integration

Wikidata is suited to:

- entity search;
- QID linking;
- aliases;
- external IDs;
- known temporal metadata;
- era/historical-period metadata;
- structured discovery queries.

Provider results are virtual/suggested data by default, not automatic vault truth.

~~~text
Provider result
    ↓
Virtual entity/assertion
    ↓ user review
Import/materialize
    ↓
Markdown entity/assertion
~~~

Searching an API must not flood the vault with notes.

## 10. Provenance and conflict

Imported data should preserve external identity, for example:

~~~yaml
external_ids:
  - wikidata:Q8450
~~~

If an external value conflicts with local research, preserve both and route the conflict through the evidence layer rather than overwriting the local assertion.

## 11. Timeline and map libraries

A mature renderer/plugin may be reused when licensing/integration fit, but another project's data model must not become authoritative.

Timeline receives normalized `TemporalItem` projections from v2 data.

Map stores WGS84 coordinates canonically; GCJ-02/BD-09 conversion belongs at provider/render time.

## 12. External data is not truth

Provider status and research status are separate concepts.

~~~text
External provider says X
≠
Vault has accepted X as settled fact
~~~
