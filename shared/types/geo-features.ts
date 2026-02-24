import type { Feature, FeatureCollection, LineString, MultiPolygon, Polygon } from 'geojson';

// --- Building ---

export interface BuildingProperties {
  id: string;
  height_m: number | null;
  floor_count: number | null;
  use: string | null;
  height_source: 'osm_tag' | 'osm_levels' | 'gba_raster' | 'type_default' | null;
}

export type BuildingFeature = Feature<Polygon | MultiPolygon, BuildingProperties>;
export type BuildingCollection = FeatureCollection<Polygon | MultiPolygon, BuildingProperties>;

// --- Street ---

export interface StreetProperties {
  id: string;
  name: string | null;
  highway: string;
  width_m: number | null;
  lanes: number | null;
  oneway: boolean;
}

export type StreetFeature = Feature<LineString, StreetProperties>;
export type StreetCollection = FeatureCollection<LineString, StreetProperties>;

// --- Tessellation Cell ---

export interface TessellationCellProperties {
  id: string;
  building_id: string | null;
  area_m2: number;
  enclosure_id: string;
}

export type TessellationCellFeature = Feature<Polygon, TessellationCellProperties>;
export type TessellationCellCollection = FeatureCollection<Polygon, TessellationCellProperties>;

// --- Block / Enclosure ---

export interface BlockProperties {
  id: string;
  area_m2: number;
  building_count: number;
}

export type BlockFeature = Feature<Polygon, BlockProperties>;
export type BlockCollection = FeatureCollection<Polygon, BlockProperties>;
