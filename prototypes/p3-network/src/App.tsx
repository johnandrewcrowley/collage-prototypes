import { MapShell } from '@collage/map-template';

export function App() {
  return (
    <MapShell
      center={[2.1686, 41.3874]}
      zoom={14}
      pitch={0}
      maxAreaM2={5_000_000}
      showAreaSelector={true}
      showLayerPanel={true}
      onExtracted={(data) => {
        console.log('[P3] Extraction complete:', data.streets?.features?.length, 'streets');
      }}
    />
  );
}
