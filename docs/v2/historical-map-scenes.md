# Historical Map Scenes and Ancient Gazetteer Layers

> Status: **H0/H1 implementation started on `feat/v2-historical-map-scenes`**
>
> This document extends the M6 Historical Map foundation. M6 remains responsible
> for canonical coordinates, temporal focus, historical designations and
> time-bounded control layers. Historical Map Scenes define how those pieces are
> composed into a useful research map.

## 1. Why a historical "basemap" is not enough

A single historical tile provider cannot satisfy the research requirements for
Charted Roots.

Two practical problems are especially visible for Chinese history:

1. global historical providers can be sparse for ancient Chinese settlements,
   passes, county seats and other places;
2. historical vector/raster maps often omit terrain context, making mountains,
   river valleys and route constraints hard to read.

The map therefore needs composition rather than replacement.

~~~text
Historical Map Scene
│
├─ 0 Terrain / geographic reference basemap
│    OpenTopoMap / OSM / user XYZ
│
├─ 1 Optional scanned historical map overlay
│    IIIF / XYZ / WMTS / georeferenced image
│
├─ 2 Historical control layers
│    boundaries / roads / rivers / routes / zones
│
├─ 3 Historical gazetteer labels
│    ancient cities / county seats / passes / settlements / sites
│
└─ 4 Active Workspace research data
     Places / Events / temporal names / user annotations
~~~

A historical scene is therefore a **layer recipe**, not a second coordinate
system and not a replacement for Place notes.

## 2. Core principles

### 2.1 Terrain and historical semantics are separate

Terrain changes slowly compared with political boundaries and place names.
A terrain basemap may be modern cartography while still being useful as a
physical-geography reference.

Historical names, settlements, borders and routes live in time-aware overlay
layers.

### 2.2 Workspace data wins

Rendering priority is:

~~~text
Active Workspace data
    >
reviewed local historical data pack
    >
live external historical provider
    >
basemap labels
~~~

External providers supplement research. They never silently overwrite a Place
note, historical designation Assertion or user-created control layer.

### 2.3 Historical labels are data, not pixels

Ancient cities must not depend on whether a raster basemap happens to label
them.

A historical-place provider yields structured point features with:

- stable provider ID;
- name and aliases;
- WGS84 coordinate;
- feature class / importance;
- temporal validity;
- source/provenance;
- confidence/uncertainty when available.

This lets Charted Roots filter and label the same ancient city according to the
shared TemporalFocus.

### 2.4 WGS84 remains canonical

Historical Map Scenes do not change the M6 storage contract.

- geographic coordinates remain WGS84 in the vault;
- GCJ-02 / BD-09 remain render/import boundaries;
- pixel custom maps remain a separate coordinate space;
- selecting a scene must never rewrite Place coordinates.

### 2.5 Provenance is mandatory

Every external historical feature must retain provider/source identity.
Provider records may be displayed without being imported into the vault.

Importing external features as durable Place notes must be an explicit user
action.

### 2.6 Restricted datasets are adapters, not bundled assets

China Historical GIS (CHGIS) is highly valuable for historical Chinese
placenames and administrative units, but its published dataset license limits
commercial use and redistribution.

Therefore Charted Roots will **not bundle CHGIS data**.

The supported architecture is:

1. user obtains an authorized CHGIS dataset;
2. Charted Roots imports/indexes it as a local provider;
3. queries happen against the user's local pack;
4. provenance remains attached to every result.

This keeps the provider useful without redistributing the dataset.

## 3. Initial provider strategy

### 3.1 OpenTopoMap — physical geography / terrain

Role: built-in optional terrain basemap.

Why:

- ordinary XYZ/WebMercator;
- compatible with the existing M6 basemap adapter;
- visible terrain, hillshade and topographic context;
- no Charted Roots account/API-key flow.

It is **not** a historical gazetteer. Modern labels from the basemap are
reference information only.

Attribution must remain visible according to the provider terms.

### 3.2 Active Workspace — first-class historical place provider

Role: highest-priority provider.

Sources include:

- Place notes;
- time-bounded historical-name designations;
- time-bounded place-state Assertions;
- user-created historical control layers.

This provider works offline and is always available.

### 3.3 OpenHistoricalMap — global live historical provider

Role: optional network provider for global historical features.

Strengths:

- public historical map project;
- vector tiles and Overpass/raw APIs;
- date-bearing features;
- suitable for global background enrichment.

Boundary:

- coverage is community-dependent;
- it must never be treated as complete, especially for ancient China.

The first adapter should target structured data rather than screenshot/raster
labels so Charted Roots can apply its own temporal focus and label rules.

### 3.4 CHGIS — China historical local pack

Role: optional local gazetteer / administrative-history provider.

Target capabilities:

- historical placenames;
- administrative units;
- county/prefectural seats;
- temporal validity;
- stable external IDs;
- source metadata.

CHGIS V6 is not bundled. The plugin only supplies an importer/index adapter.

### 3.5 Georeferenced scanned maps

Role: evidence/reference overlay rather than primary structured gazetteer.

Candidate protocols/sources:

- IIIF;
- XYZ;
- WMTS;
- user-georeferenced images;
- services exposed by map libraries / MapWarper-style systems.

Each overlay needs opacity, z-order, attribution/source and an optional temporal
window.

A scanned map never becomes authoritative geometry merely because it is drawn
under the markers.

## 4. Historical place feature contract

Conceptual first-stage contract:

~~~ts
interface HistoricalPlaceFeature {
  id: string;
  providerId: string;

  name: string;
  aliases?: string[];

  longitude: number;
  latitude: number;

  kind:
    | "capital"
    | "administrative_seat"
    | "city"
    | "town"
    | "fortress"
    | "pass"
    | "port"
    | "religious_site"
    | "settlement"
    | "other";

  importance?: number;

  timeStart?: string;
  timeEnd?: string;
  timeNotBefore?: string;
  timeNotAfter?: string;

  source?: string;
  sourceId?: string;
  confidence?: string;
}
~~~

Provider output is runtime data. It is not automatically persisted as a Place.

## 5. Gazetteer provider contract

Providers are capability-oriented.

~~~ts
interface HistoricalGazetteerProviderDefinition {
  id: string;
  label: string;

  mode:
    | "workspace"
    | "network"
    | "local_pack";

  coverage:
    | "workspace"
    | "global"
    | "china";

  supportsTemporalQuery: boolean;
  requiresNetwork: boolean;
  requiresLocalData: boolean;
}
~~~

Later runtime adapters implement query/search around this metadata.

The registry deliberately separates **provider availability** from
**provider definition** so a scene can degrade gracefully when a local CHGIS
pack is missing or a network provider is offline.

## 6. Label density and collision policy

Historical-city visibility must not be all-or-nothing.

Recommended ranking:

1. capitals;
2. administrative seats;
3. major cities / fortified cities;
4. passes / ports / strategic sites;
5. towns;
6. minor settlements.

Zoom and density control determine how many labels render.

The provider supplies semantic importance; the renderer decides collision and
screen density.

Workspace Places receive a priority boost over all external labels.

## 7. Temporal behavior

Real historical gazetteer features participate in the shared Julian-Day focus.

At a focused date:

- definite active feature -> normal historical label;
- uncertain/possible feature -> visually distinct possible state;
- inactive feature -> hidden;
- unresolved date -> review/possible policy, never silently forced active.

A scene without TemporalFocus may show either all known features or a
provider-defined overview depending on density.

Fictional `chronology_year` focus does not query real-world historical
gazetteers.

## 8. Merge and de-duplication policy

External features are not automatically merged into Workspace Places.

For display-time collision:

~~~text
same reviewed external ID
  -> safe identity

same user-linked external ID
  -> safe identity

similar name + nearby coordinate
  -> possible duplicate only

name alone
  -> never auto-merge
~~~

If a user imports an external feature as a Place, the external provider/source
ID should be retained for future matching.

## 9. Scene contract

A first-stage scene describes composition, not renderer internals.

~~~ts
interface HistoricalMapSceneDefinition {
  id: string;
  label: string;

  basemapId: string;

  gazetteerProviderIds: string[];
  includeWorkspaceControlLayers: boolean;
  includeWorkspacePlaces: boolean;

  labelDensity: "sparse" | "balanced" | "dense";
}
~~~

Initial scenes:

### Modern reference

- OSM Standard;
- Workspace Places;
- Workspace control layers.

### Historical terrain

- OpenTopoMap;
- Workspace Places;
- Workspace control layers;
- later OHM / local historical gazetteers.

### China historical research — later

- terrain basemap;
- Workspace Places;
- CHGIS local pack when installed;
- OHM as optional supplemental source;
- Workspace control layers.

The absence of CHGIS or OHM must not make the scene unusable.

## 10. Implementation phases

### H0 — contracts and architecture

- [x] design layer composition;
- [ ] HistoricalMapSceneDefinition;
- [ ] HistoricalGazetteerProviderDefinition;
- [ ] provider registry;
- [ ] built-in scene registry;
- [ ] validation tests.

### H1 — terrain scene foundation

- [ ] add OpenTopoMap as an optional built-in XYZ basemap;
- [ ] built-in Historical terrain scene;
- [ ] preserve OSM Standard as normal Real-world default;
- [ ] scene resolution tests;
- [ ] no coordinate rewrite.

### H2 — Workspace historical place layer

- [ ] project Workspace Place notes into HistoricalPlaceFeature;
- [ ] apply historical designation names at shared focus;
- [ ] rank capital / seat / city / pass / settlement labels;
- [ ] label collision/density layer independent of basemap labels;
- [ ] popup opens the local Place note.

### H3 — OpenHistoricalMap adapter

- [ ] provider metadata and network health state;
- [ ] date/bbox query boundary;
- [ ] normalize OHM features into HistoricalPlaceFeature;
- [ ] cache by bbox + temporal bucket;
- [ ] offline/network failure degrades to local layers;
- [ ] never persist OHM features without explicit import.

### H4 — CHGIS local data-pack adapter

- [ ] user-supplied dataset import;
- [ ] no bundled CHGIS records;
- [ ] local index;
- [ ] temporal placename/admin-unit lookup;
- [ ] source ID/provenance retention;
- [ ] China historical scene can enable the pack when present.

### H5 — scanned historical map overlays

- [ ] overlay contract;
- [ ] opacity/z-order;
- [ ] time window;
- [ ] IIIF/XYZ first;
- [ ] WMTS adapter only with explicit projection/matrix support;
- [ ] source/rights metadata visible in UI.

### H6 — historical routes and physical context

- [ ] route/road/pass feature classes;
- [ ] historical river/coastline overlays where sourced;
- [ ] terrain + historical route comparison;
- [ ] time-aware route filtering.

### H7 — UI and cache polish

- [ ] Scene selector separate from raw basemap provider selector;
- [ ] Gazetteer source toggles;
- [ ] label density control;
- [ ] external provider status;
- [ ] local-pack manager;
- [ ] clear cache / refresh provider.

## 11. Acceptance criteria

The feature is not accepted merely because a different raster appears.

A useful Historical Map Scene must satisfy:

1. terrain remains readable under historical overlays;
2. changing scene never rewrites WGS84 Place coordinates;
3. Workspace Places always render even if every external provider is offline;
4. ancient labels are independent of modern basemap labels;
5. shared TemporalFocus changes historical labels/boundaries;
6. Workspace historical designations override external display names;
7. external features retain provenance;
8. no CHGIS data is redistributed by Charted Roots;
9. missing local packs degrade gracefully;
10. network failures do not blank the map;
11. label density remains usable at regional and local zooms;
12. imported external places require explicit user action.

## 12. External-source notes

### OpenTopoMap

Used only as an optional terrain/reference basemap. Attribution must follow the
OpenTopoMap / OpenStreetMap / SRTM terms.

### OpenHistoricalMap

Used as an optional live historical provider. Coverage is not assumed complete.
The adapter must use source/date-bearing structured features.

### CHGIS

Used only through user-authorized local data. Do not ship dataset contents in
plugin artifacts.

### Scanned map libraries

Rights vary per map. Store and display source/rights metadata per overlay rather
than assigning one blanket license to all scanned maps.

## 13. Non-goals

This work does not:

- replace Leaflet immediately;
- claim a single authoritative reconstruction of historical borders;
- treat modern terrain as historically exact settlement data;
- infer missing ancient cities from modern city names;
- redistribute restricted historical datasets;
- convert every scanned historical map into vector geometry automatically;
- make external providers authoritative over the user's vault.
