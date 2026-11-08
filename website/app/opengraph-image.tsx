import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt =
  "Opaline — A database client built around your projects. PostgreSQL first. macOS coming soon. A preview of the Opaline workspace.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const screenshot = await readFile(
  join(process.cwd(), "public/screenshots/workspace-overview.jpg"),
  "base64",
);

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        background: "#090a0b",
        color: "#f3f0e9",
        fontFamily: "geist",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "radial-gradient(ellipse at 89% 55%, #dfbb7918 0%, #090a0b00 57%)",
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          position: "absolute",
          top: 56,
          left: 64,
          fontSize: 38,
          letterSpacing: -1.4,
        }}
      >
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
          <circle cx="17" cy="19" r="13" stroke="#f3f0e9" strokeWidth="5" />
          <circle
            cx="29"
            cy="7"
            r="5"
            fill="#dfbb79"
            stroke="#090a0b"
            strokeWidth="2"
          />
        </svg>
        opaline
      </div>
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 75,
          right: 64,
          color: "#a2a39f",
          fontSize: 13,
          letterSpacing: 2.4,
        }}
      >
        DESKTOP DATABASE CLIENT
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          position: "absolute",
          top: 188,
          left: 64,
          fontSize: 61,
          letterSpacing: -2.9,
          lineHeight: 1.08,
        }}
      >
        <span>A database client</span>
        <span>built around</span>
        <span style={{ color: "#dfbb79" }}>your projects.</span>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          position: "absolute",
          top: 443,
          left: 64,
          color: "#aaa9a5",
          fontSize: 23,
          lineHeight: 1.5,
        }}
      >
        <span>PostgreSQL first.</span>
        <span>macOS coming soon.</span>
      </div>
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 170,
          left: 668,
          width: 800,
          height: 450,
          border: "1px solid #ffffff2b",
          borderRadius: 13,
          overflow: "hidden",
          boxShadow: "0 24px 70px #00000090",
        }}
      >
        {/* ImageResponse renders the local screenshot directly into the PNG. */}
        <img
          src={`data:image/jpeg;base64,${screenshot}`}
          alt="Opaline workspace showing a project's connections and table tabs"
          width={800}
          height={450}
        />
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          position: "absolute",
          bottom: 40,
          left: 64,
          color: "#dfbb79",
          fontSize: 12,
          letterSpacing: 2.1,
        }}
      >
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "#dfbb79",
          }}
        />
        IN DEVELOPMENT
      </div>
    </div>,
    size,
  );
}
