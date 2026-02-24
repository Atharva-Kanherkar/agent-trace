import { NextResponse } from "next/server";

export function GET(): Response {
  return NextResponse.json({
    status: "ok",
    service: "dashboard"
  });
}
