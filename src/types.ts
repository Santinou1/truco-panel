export type User = {
  id: string;
  role: "user" | "super_admin";
  email: string | null;
  displayName: string;
};
export type CosmeticKind = "avatars" | "frames" | "tables" | "cardBacks";
export type AssetPrice = {
  category: CosmeticKind;
  assetId: string;
  label: string;
  price: number;
};
