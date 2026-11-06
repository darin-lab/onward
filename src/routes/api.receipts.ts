import { createFileRoute } from "@tanstack/react-router";

function cronAllowed(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization") ?? "";
  if (secret) return auth === `Bearer ${secret}`;
  return request.headers.get("x-vercel-cron") === "1";
}

export const Route = createFileRoute("/api/receipts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!cronAllowed(request)) return new Response("Unauthorized", { status: 401 });
        const { sendDueReceipts } = await import("@/lib/board/receipt.functions");
        const result = await sendDueReceipts();
        // Wednesday night backup for the weekly feedback email (normally it
        // already went out when the last manager's feedback came in).
        const { shopToday } = await import("@/lib/board/records.server");
        let feedback: unknown = null;
        if (shopToday().wednesday) {
          const { sendFeedbackDigest } = await import("@/lib/board/records.functions");
          feedback = await sendFeedbackDigest({ backup: true }).catch((error) => ({ ok: false, reason: String(error) }));
        }
        const failed = result.ok === false;
        return Response.json({ ...result, feedback }, { status: failed ? 500 : 200 });
      },
    },
  },
});
