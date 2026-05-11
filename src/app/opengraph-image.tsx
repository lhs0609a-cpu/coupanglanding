import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "쿠팡PT · 메가로드 — 1:1 전문가 코칭 + AI 자동등록";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background:
            "linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #0f172a 100%)",
          padding: "80px",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "8px",
            background: "linear-gradient(90deg, #E31837 0%, #ff4d6a 100%)",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "20px",
            marginBottom: "40px",
          }}
        >
          <div
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "18px",
              background: "linear-gradient(135deg, #E31837, #ff4d6a)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "40px",
              fontWeight: 800,
              color: "white",
            }}
          >
            M
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: "20px",
                color: "rgba(255,255,255,0.6)",
                letterSpacing: "0.2em",
                fontWeight: 600,
              }}
            >
              COUPANG · MEGALOAD
            </div>
            <div style={{ fontSize: "28px", color: "white", fontWeight: 700 }}>
              메가로드
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            marginTop: "auto",
          }}
        >
          <div
            style={{
              fontSize: "92px",
              fontWeight: 800,
              color: "white",
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
            }}
          >
            쿠팡PT
          </div>
          <div
            style={{
              fontSize: "36px",
              color: "rgba(255,255,255,0.88)",
              fontWeight: 500,
              lineHeight: 1.3,
            }}
          >
            초기비용 0원 · 1:1 전문가 코칭
            <br />+ GPT-4 AI 쿠팡 자동등록 프로그램
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            bottom: "60px",
            right: "80px",
            display: "flex",
            gap: "12px",
          }}
        >
          {["3개월 매출 보장", "100개 10분", "ROAS 951%"].map((label) => (
            <div
              key={label}
              style={{
                padding: "10px 18px",
                borderRadius: "999px",
                background: "rgba(227,24,55,0.18)",
                border: "1px solid rgba(227,24,55,0.4)",
                color: "white",
                fontSize: "20px",
                fontWeight: 600,
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
