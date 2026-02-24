import { MapShell } from '@collage/map-template';

export function App() {
  return (
    <MapShell
      center={[-122.4194, 37.7749]}
      zoom={12}
      pitch={0}
      maxAreaM2={20_000_000}
      showAreaSelector={false}
      showLayerPanel={false}
      onExtracted={(data) => {
        console.log('[P5] Data loaded:', data.buildings?.features?.length, 'buildings');
      }}
    />
  );
}
