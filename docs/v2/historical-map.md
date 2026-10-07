# Historical Map Foundation

> Status: **M6 C0-C4 historical map foundation implemented; C5 bidirectional Timeline/Map synchronization next**
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
- [x] current WGS84 rendering/integration remains green in real Obsidian smoke (#513, `9aba2162`);
- [x] keep GeoJSON export canonical WGS84;
- [x] route SVG current-view marker/path projection through the basemap adapter;
- [ ] add GeoJSON import/render adapter coverage (tracked with C4 historical control layers);
- [x] define an XYZ/WebMercator provider registry with runtime validation and safe fallback;
- [x] persist global selected provider ID and user-defined XYZ provider configs through plugin settings;
- [x] Controller validates saved provider configs and falls back to Carto for missing/invalid IDs without logging tile URL secrets;
- [x] expose Real-world basemap selection without mixing it into custom image maps;
- [x] expose validated user-defined XYZ providers with WGS84 / GCJ-02 / BD-09 datum metadata;
- [x] hot-switch already-open Map views while preserving the visible center in canonical WGS84;
- [x] real Obsidian smoke covers WGS84 -> GCJ-02 provider hot-switch and restoration;
- [ ] add China-friendly provider templates only through documented/authorized APIs or user-supplied endpoints;
- [ ] add dedicated WMTS / EPSG:4490 support before treating Tianditu CGCS2000 services as compatible.

#### C2 provider scope

The first provider registry intentionally accepts only ordinary XYZ raster
tiles on a WebMercator tile matrix. `coordinateCRS` describes the geographic
datum used to align overlays; it is **not** a Leaflet projection declaration.

This means WGS84, GCJ-02 and BD-09 XYZ providers can share the same rendering
boundary, while WMTS services with a different matrix/projection (for example
CGCS2000 / EPSG:4490) require a separate adapter rather than being mislabeled
as XYZ.

#### C2 acceptance

C2 is considered complete for the XYZ/WebMercator provider boundary when:

1. the existing CARTO Real-world map remains WGS84-compatible;
2. main map and MiniMap use the same provider definition;
3. canonical WGS84 markers, paths, heat data, searches and current-view SVG
   projections are transformed only at render time;
4. clicks, drags, saved centers and exports return to canonical WGS84;
5. invalid/missing providers fall back safely without logging tile URL secrets;
6. users can select and edit validated custom WGS84/GCJ-02/BD-09 XYZ
   providers in Settings;
7. an already-open Map can hot-switch provider/datum without changing the
   represented canonical center.

WMTS / EPSG:4490 remains intentionally outside this completed C2 boundary.

### C3 — historical place identity

- [x] Core `historical_name` designation type;
- [x] `has_designation` supports Place subjects and designation/source qualifiers;
- [x] Temporal projection preserves scalar Assertion qualifiers at the renderer boundary;
- [x] `PlaceDesignationService` queries active/possible names by stable Place `cr_id`;
- [x] Place Profile Add historical name flow creates time-bounded designation Assertions;
- [x] Place Profile re-renders on shared TemporalFocus and shows active/possible historical names;
- [x] batch Place designation lookup avoids rebuilding the temporal model per marker;
- [x] migration preview surfaces legacy `historical_names` as explicit review items without guessing dates or deleting legacy data;
- [x] focused Map marker/popup/Journey display uses one unambiguous active historical name without mutating canonical MapData;
- [x] clearing shared TemporalFocus restores the canonical Place name;
- [x] migration paths carry stable endpoint Place IDs and their display-only labels follow historical designations safely.

### C4 — historical control layers

- [x] time-bounded geographic GeoJSON/control-layer contract;
- [x] WGS84 is the canonical GeoJSON geometry datum;
- [x] import adapter normalizes WGS84 / GCJ-02 / BD-09 layer geometry to WGS84;
- [x] layer/feature contracts preserve source, confidence and uncertainty metadata;
- [x] Point / MultiPoint / LineString / MultiLineString / Polygon / MultiPolygon / GeometryCollection normalization;
- [x] altitude/extra position dimensions survive datum conversion;
- [x] shared TemporalFocus active/possible filtering using the same JDN semantics as Timeline;
- [x] layer-level and feature-level temporal windows intersect without manufacturing dates;
- [x] unresolved authored control-layer dates remain possible instead of definite;
- [x] render canonical WGS84 control layers through the active basemap datum adapter;
- [x] dedicated Leaflet control-layer group with distinct possible-state treatment;
- [x] Real Obsidian smoke covers active/possible filtering, focus clearing and basemap hot-switch retention;
- [x] `cr_type: control_layer` Markdown manifest contract with separate GeoJSON geometry files;
- [x] Workspace-scoped manifest repository and relative/vault-root GeoJSON path resolution;
- [x] open Map views automatically load persisted control layers from the Active Workspace;
- [x] Active Workspace switches replace the control-layer dataset instead of leaking prior Workspace geometry;
- [x] manifest metadata and referenced `.geojson` modifications refresh open Map views without re-reading layers on ordinary map filters;
- [x] storage loader rejects malformed/unsupported geometry and reports missing assets per layer;
- [x] non-canonical persisted CRS is normalized for compatibility but surfaced as a data-quality issue;
- [x] import writer/UI creates Workspace-scoped canonical WGS84 GeoJSON + manifest pairs, preserves source CRS provenance, rolls back partial writes and refreshes open Map views.

### C5 — full Timeline <-> Map synchronization

- [x] retain M5 shared-focus -> Map state projection;
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
