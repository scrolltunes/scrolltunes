import { ImageResponse } from "next/og"

export const alt = "ScrollTunes - Live lyrics teleprompter for musicians"
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = "image/png"

export default async function Image() {
  return new ImageResponse(
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#0a0a0a",
        backgroundImage:
          "radial-gradient(circle at 25% 25%, #1e1b4b 0%, transparent 50%), radial-gradient(circle at 75% 75%, #312e81 0%, transparent 50%)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 40,
        }}
      >
        <svg width="80" height="80" viewBox="0 0 32 32" fill="none" style={{ marginRight: 20 }}>
          <path
            d="M21 8v11.5a3.5 3.5 0 1 1-2-3.16V10h-6v9.5a3.5 3.5 0 1 1-2-3.16V8a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1z"
            fill="#6366f1"
          />
        </svg>
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            color: "#ffffff",
            letterSpacing: "-0.02em",
          }}
        >
          ScrollTunes
        </div>
      </div>
      <div
        style={{
          fontSize: 32,
          color: "#a3a3a3",
          textAlign: "center",
          maxWidth: 800,
        }}
      >
        Live lyrics teleprompter for musicians
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 32,
          marginTop: 60,
          color: "#6366f1",
          fontSize: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="24" height="24" viewBox="0 0 256 256" fill="#6366f1">
            <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm45.66,109.66-48,48a8,8,0,0,1-11.32-11.32L148.69,136H88a8,8,0,0,1,0-16h60.69L114.34,85.66a8,8,0,0,1,11.32-11.32l48,48A8,8,0,0,1,173.66,133.66Z" />
          </svg>
          Voice-triggered scrolling
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="24" height="24" viewBox="0 0 256 256" fill="#6366f1">
            <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm45.66,109.66-48,48a8,8,0,0,1-11.32-11.32L148.69,136H88a8,8,0,0,1,0-16h60.69L114.34,85.66a8,8,0,0,1,11.32-11.32l48,48A8,8,0,0,1,173.66,133.66Z" />
          </svg>
          Hands-free control
        </div>
      </div>
    </div>,
    {
      ...size,
    },
  )
}
