import { ImageResponse } from "next/og";

export const alt = "Her Africa Table — a private network for African women";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "60px 72px", background: "#f8f4ec", color: "#281d1b" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div style={{ display: "flex", width: 64, height: 64, border: "1px solid #aa8751", borderRadius: "50%", alignItems: "center", justifyContent: "center", color: "#5f1722", fontSize: 32 }}>H</div>
        <div style={{ display: "flex", fontSize: 29 }}>Her Africa Table</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", color: "#5f1722", fontSize: 18, letterSpacing: "3px" }}>MEET. CONNECT. RISE.</div>
        <div style={{ display: "flex", fontSize: 76, lineHeight: 1.05, letterSpacing: "-3px", maxWidth: 980 }}>Where African women gather with purpose.</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 24, borderTop: "1px solid #d6cbbd", fontSize: 21, color: "#6f615a" }}>
        <span>Communities · Introductions · Gatherings</span>
        <span>Nairobi, Kenya</span>
      </div>
    </div>,
    size,
  );
}
