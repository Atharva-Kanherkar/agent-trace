import { NextResponse } from "next/server";

import { fetchDailyCostPoints } from "../../../../../src/next-data";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    const points = await fetchDailyCostPoints();
    return NextResponse.json({
      status: "ok",
      points
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        status: "error",
        message: `failed to fetch daily cost points: ${String(error)}`
      },
      {
        status: 502
      }
    );
  }
}
