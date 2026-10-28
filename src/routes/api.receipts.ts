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
        const failed = result.ok === false;
        return Response.json(result, { status: failed ? 500 : 200 });
      },
    },
  },
});
