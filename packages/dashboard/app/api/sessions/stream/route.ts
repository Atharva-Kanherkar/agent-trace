import { getDashboardApiBaseUrl } from "../../../../src/next-data";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    const upstream = await fetch(`${getDashboardApiBaseUrl()}/v1/sessions/stream`, {
      cache: "no-store",
      headers: {
        Accept: "text/event-stream"
      }
    });
    if (!upstream.ok || upstream.body === null) {
      return Response.json(
        {
          status: "error",
          message: `upstream stream failed (${String(upstream.status)})`
        },
        {
          status: 502
        }
      );
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
      }
    });
  } catch (error: unknown) {
    return Response.json(
      {
        status: "error",
        message: `failed to proxy stream: ${String(error)}`
      },
      {
        status: 502
      }
    );
  }
}
