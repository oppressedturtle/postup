/**
 * /api/og
 *
 * GET — Generate a 1200×630 Open Graph image for drop/hub/default pages.
 *
 * Query params:
 *   title        — page title (required)
 *   description? — subtitle / preview text
 *   type         — drop | hub | default  (default: default)
 *
 * Returns: PNG image (ImageResponse from @vercel/og)
 * Runtime: Edge
 */
import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

const WIDTH = 1200;
const HEIGHT = 630;

// Brand colours matching PostUp's Heat palette
const BRAND_500 = "#f97316"; // orange-500 equivalent
const BRAND_600 = "#ea580c";
const DARK_BG   = "#0f172a"; // slate-900
const DARK_CARD = "#1e293b"; // slate-800
const TEXT_PRIMARY   = "#f8fafc"; // slate-50
const TEXT_SECONDARY = "#94a3b8"; // slate-400

export async function GET(request: NextRequest): Promise<ImageResponse | Response> {
  const { searchParams } = request.nextUrl;

  const title       = searchParams.get("title")?.slice(0, 120) ?? "PostUp";
  const description = searchParams.get("description")?.slice(0, 200) ?? undefined;
  const type        = searchParams.get("type") ?? "default";

  // Type label badge
  const typeLabel =
    type === "drop" ? "Drop" :
    type === "hub"  ? "Hub"  :
    null;

  return new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          background: DARK_BG,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "60px 80px",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        {/* Top bar — logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          {/* Flame icon */}
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "12px",
              background: `linear-gradient(135deg, ${BRAND_500}, ${BRAND_600})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
            }}
          >
            🔥
          </div>
          <span style={{ color: TEXT_PRIMARY, fontSize: 32, fontWeight: 700 }}>
            PostUp
          </span>

          {typeLabel && (
            <div
              style={{
                marginLeft: 16,
                padding: "4px 16px",
                borderRadius: "20px",
                background: BRAND_500,
                color: "#fff",
                fontSize: 18,
                fontWeight: 600,
              }}
            >
              {typeLabel}
            </div>
          )}
        </div>

        {/* Main content card */}
        <div
          style={{
            background: DARK_CARD,
            borderRadius: "20px",
            padding: "48px 56px",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            border: `1px solid ${BRAND_500}33`,
            flex: 1,
            margin: "40px 0",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              color: TEXT_PRIMARY,
              fontSize: title.length > 60 ? 40 : 52,
              fontWeight: 700,
              lineHeight: 1.2,
              letterSpacing: "-0.02em",
            }}
          >
            {title}
          </div>

          {description && (
            <div
              style={{
                color: TEXT_SECONDARY,
                fontSize: 24,
                lineHeight: 1.5,
              }}
            >
              {description}
            </div>
          )}
        </div>

        {/* Bottom bar — tagline */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ color: TEXT_SECONDARY, fontSize: 20 }}>
            Community. Drops. Discussion.
          </span>
          <span
            style={{
              color: BRAND_500,
              fontSize: 20,
              fontWeight: 600,
            }}
          >
            postup.app
          </span>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
    },
  );
}
