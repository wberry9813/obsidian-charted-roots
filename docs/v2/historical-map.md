# Historical Map Foundation

> Status: **M6-C0 coordinate foundation in progress**
>
> M6 follows the implemented M5 Temporal Views foundation.

## 1. Coordinate policy

For geographic places, Charted Roots v2 stores and reasons over **WGS84**
longitude/latitude as the canonical vault coordinate.

GCJ-02 and BD-09 are boundary coordinate systems:

- import/paste from providers that publish GCJ-02 or BD-09;
- display against a basemap that expects one of those systems;
- provider/API adapters.

Changing basemaps must never rewrite canonical Place coordinates.

Custom image/pixel maps remain a separate coordinate space and are not
converted through geographic CRS adapters.

## 2. First adapter

M6 initially adapts the MIT-licensed `gcoord` package behind a project-owned
`CoordinateTransformProvider` interface.

The dependency is an implementation detail. Domain code consumes
`CanonicalCoordinateService`, not `gcoord` directly.

Supported first-stage geographic CRS:

- `wgs84` — canonical;
- `gcj02`;
- `bd09`.

## 3. M6 implementation phases

### C0 — coordinate foundation

- [x] WGS84 canonical policy;
- [x] project-owned coordinate/provider types;
- [x] gcoord adapter;
- [x] WGS84 / GCJ-02 / BD-09 point transforms;
- [x] China-city golden fixtures;
- [x] outside-China WGS84 -> GCJ-02 no-op regression;
- [x] coordinate validation and batch transform helper.

### C1 — storage and input boundaries

- [x] central Place writer canonicalizes transient source CRS to WGS84;
- [x] transient `coordinateCRS` metadata is never persisted to Place notes;
- [x] Create/Edit Place exposes WGS84 / GCJ-02 / BD-09 input/display CRS;
- [x] switching the modal CRS transforms displayed values without moving the place;
- [x] Nominatim/Place Lookup geographic results reset the input CRS to WGS84;
- [x] GCJ-02 / BD-09 user input is normalized to WGS84 by the Place writer;
- [x] existing DMS parsing remains before CRS normalization;
- [ ] expose source CRS metadata to bulk/import pipelines where source CRS is known;
- [ ] migration/linter checks for any future non-canonical persisted CRS.

### C2 — basemap adapters

- [x] define a project-owned `GeographicBasemapDefinition` contract;
- [x] declare the existing Carto Voyager / OSM-backed Real world basemap as WGS84;
- [x] route main-map, MiniMap, map-switch and CRS-recreation tile creation through one definition;
- [x] define a bidirectional canonical WGS84 <-> basemap datum coordinate adapter;
- [x] route event/place marker, search, migration/journey path, arrow, heat and fitBounds rendering through the adapter;
- [x] route Journey camera and v2 temporal place overlay through the same Controller conversion API;
- [x] route geographic map click and Place drag write-back through the inverse adapter;
- [x] persist map center state as canonical WGS84 instead of basemap-shifted coordinates;
- [ ] prove current WGS84 rendering remains unchanged in the latest real-Obsidian smoke after integration;
- [x] keep GeoJSON export canonical WGS84;
- [x] route SVG current-view marker/path projection through the basemap adapter;
- [ ] add GeoJSON import/render adapter coverage;
- [ ] add China-friendly GCJ-02/BD-09 basemap options only after adapter tests.

### C3 — historical place identity

- [ ] historical aliases with time/source context;
- [ ] place-name resolution without rewriting stable Place identity;
- [ ] ontology/Assertion integration for time-bounded names where appropriate.

### C4 — historical control layers

- [ ] time-bounded GeoJSON/control-layer contract;
- [ ] WGS84 canonical GeoJSON policy;
- [ ] adapter conversion for GCJ-02/BD-09 layer sources;
- [ ] source/provenance and uncertainty metadata;
- [ ] shared TemporalFocus filtering.

### C5 — full Timeline <-> Map synchronization

- [ ] retain M5 shared-focus -> Map state projection;
- [ ] define bridge from legacy Map standard/fictional calendars into v2
  chronology axes;
- [ ] only then allow Map time controls to write shared TemporalFocus;
- [ ] never coerce fictional epoch-relative canonical years into astronomical
  year/JDN values.

## 4. Acceptance boundary

C0 is complete when:

1. one canonical WGS84 coordinate can render to GCJ-02 and BD-09 without
   mutating the stored value;
2. GCJ-02/BD-09 input can normalize back to WGS84 within tested tolerance;
3. coordinates outside China are not spuriously shifted by WGS84->GCJ-02;
4. invalid latitude/longitude values fail before adapter execution;
5. application code can replace the transform provider without changing
   canonical coordinate semantics.
