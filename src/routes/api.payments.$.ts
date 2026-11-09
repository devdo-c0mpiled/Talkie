import { createFileRoute } from "@tanstack/react-router";
async function handle({ request }: { request: Request }) {
  const [{ env }, { getAuth }, { handlePayments }] = await Promise.all([
    import("cloudflare:workers"),
    import("../lib/auth.server"),
    import("../lib/payments.server"),
  ]);
  const session = await getAuth().api.getSession({ headers: request.headers });
  return handlePayments(request, env, session?.user.id);
}
export const Route = createFileRoute("/api/payments/$")({
  server: { handlers: { GET: handle, POST: handle } },
});
