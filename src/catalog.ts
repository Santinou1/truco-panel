import catalog from "./catalog.json";
import images from "./asset-manifest.json";
export { catalog };
export const asset = (path: string): string => {
  const url = (images as Record<string, string>)[path];
  if (!url) throw new Error(`Imagen sin URL publicada: ${path}`);
  return url;
};
export const label = (value: string) =>
  value.replaceAll("-", " ").replace(/^./, (s) => s.toUpperCase());
