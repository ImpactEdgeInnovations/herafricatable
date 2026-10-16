export type EventImageStyle = "automatic" | "complete";

// Cropping does not reduce sharpness; excessive upscaling does. Do not invent
// pixels or try to infer whether a photograph contains important poster text.
export function eventImageFit(style: EventImageStyle, width: number, height: number, frameWidth: number, frameHeight: number): "cover" | "contain" | "scale-down" {
  if (![width, height, frameWidth, frameHeight].every(value => Number.isFinite(value) && value > 0)) return "contain";
  const fillScale = Math.max(frameWidth / width, frameHeight / height);
  const wholeScale = Math.min(frameWidth / width, frameHeight / height);
  if (style === "complete") return wholeScale > 1.2 ? "scale-down" : "contain";
  return fillScale > 1.2 ? "scale-down" : "cover";
}
