/** Configuration for a layer in the layer panel. */
export interface LayerConfig {
  id: string;
  label: string;
  type: 'toggle' | 'metric-select' | 'slider';
  defaultVisible?: boolean;
  metrics?: Array<{ key: string; label: string; ramp: string }>;
}

/** Color ramp definition for metric visualization. */
export interface ColorRamp {
  name: string;
  stops: Array<{ value: number; color: string }>;
  domain: [number, number];
  nullColor: string;
}

/** Built-in color ramp names. */
export type ColorRampName = 'viridis' | 'magma' | 'rdylgn' | 'blues' | 'spectral';
