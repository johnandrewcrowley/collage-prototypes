import { MapShell } from '@collage/map-template';

export function App() {
  return (
    <MapShell
      center={[2.1686, 41.3874]}
      zoom={15}
      pitch={45}
      maxAreaM2={1_000_000}
      showAreaSelector={true}
      showLayerPanel={true}
      onExtracted={(data) => {
        console.log('[P1] Extraction complete:', data.buildings?.features?.length, 'buildings');
      }}
    />
  );
}
