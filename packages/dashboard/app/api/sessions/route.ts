import { NextResponse } from "next/server";

import { fetchSessionSummaries } from "../../../src/next-data";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    const sessions = await fetchSessionSummaries();
    return NextResponse.json({
      status: "ok",
      count: sessions.length,
      sessions
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        status: "error",
        message: `failed to fetch sessions: ${String(error)}`
      },
      {
        status: 502
      }
    );
  }
}
