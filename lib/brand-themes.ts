export const brandThemes = [
  { key: "wine", label: "Wine", accent: "#64172a", hover: "#461020", soft: "#f3e9ec" },
  { key: "gold", label: "Gold", accent: "#6f4e16", hover: "#50380f", soft: "#f6efdf" },
  { key: "forest", label: "Forest", accent: "#365e4c", hover: "#254334", soft: "#eaf1ec" },
  { key: "ocean", label: "Ocean", accent: "#315f70", hover: "#234552", soft: "#e9f0f3" },
  { key: "terracotta", label: "Terracotta", accent: "#8e412f", hover: "#682e21", soft: "#f5eae6" },
] as const;
export type BrandAccent = (typeof brandThemes)[number]["key"];
export function brandAccent(value: unknown): BrandAccent {
  return brandThemes.find(theme => theme.key === value)?.key ?? "wine";
}
