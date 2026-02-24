import { NextResponse } from "next/server";

import { fetchSessionReplay } from "../../../../src/next-data";

export const runtime = "nodejs";

interface SessionRouteContext {
  readonly params: Promise<{
    readonly sessionId: string;
  }>;
}

export async function GET(_request: Request, context: SessionRouteContext): Promise<NextResponse> {
  const params = await context.params;
  const sessionId = params.sessionId;
  if (sessionId.length === 0) {
    return NextResponse.json(
      {
        status: "error",
        message: "session id is required"
      },
      {
        status: 400
      }
    );
  }

  try {
    const replay = await fetchSessionReplay(sessionId);
    if (replay === undefined) {
      return NextResponse.json(
        {
          status: "error",
          message: "session not found"
        },
        {
          status: 404
        }
      );
    }

    return NextResponse.json({
      status: "ok",
      session: replay
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        status: "error",
        message: `failed to fetch session replay: ${String(error)}`
      },
      {
        status: 502
      }
    );
  }
}
