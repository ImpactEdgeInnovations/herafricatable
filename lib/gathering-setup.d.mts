export function gatheringSetup(values: { gatheringStyle?: string; format: string; onlineUrl?: string; videoLink?: string }): {
  kind: string;
  format: "in_person" | "hybrid" | "virtual";
  onlineUrl: string;
  videoLink: string;
};
