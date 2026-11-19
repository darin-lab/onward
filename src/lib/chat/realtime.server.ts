// Real-time nudges through Ably. The database stays the source of truth: a nudge only
// tells open screens "something changed, check now", so a missed nudge costs nothing
// (the normal slow check still catches up). Nothing here ever throws.
type Sql = Awaited<ReturnType<typeof import("@/lib/db").getSql>>;

export function realtimeEnabled() {
  return Boolean(process.env.ABLY_API_KEY?.trim());
}

async function rest() {
  const key = process.env.ABLY_API_KEY?.trim();
  if (!key) return null;
  const mod = (await import("ably")) as unknown as { Rest?: new (o: { key: string }) => AblyRest; default?: { Rest: new (o: { key: string }) => AblyRest } };
  const Rest = mod.Rest ?? mod.default?.Rest;
  return Rest ? new Rest({ key }) : null;
}

type AblyRest = {
  channels: { get(name: string): { publish(name: string, data: unknown): Promise<unknown> } };
  auth: { createTokenRequest(params: Record<string, unknown>): Promise<unknown> };
};

/** Everyone who should hear about a change in a room: its members, plus Darin and Arun who can read all rooms. */
export async function roomAudience(sql: Sql, roomId: string): Promise<string[]> {
  const rows = await sql.query<{ person_id: string }>("select person_id from chat_members where room_id = $1", [roomId]);
  return [...new Set([...rows.map((r) => r.person_id), "darin", "arun"])];
}

export async function pingUsers(personIds: string[], data: Record<string, unknown>) {
  try {
    const client = await rest();
    if (!client || personIds.length === 0) return;
    const work = Promise.all(
      personIds.map((id) => client.channels.get(`u-${id}`).publish("ping", data).catch(() => undefined)),
    );
    await Promise.race([work, new Promise((resolve) => setTimeout(resolve, 1500))]);
  } catch (error) {
    console.error("[chat] realtime ping failed:", error instanceof Error ? error.message : error);
  }
}

/** Tells every open screen that presence or pictures changed. */
export async function pingEveryone(data: Record<string, unknown>) {
  try {
    const client = await rest();
    if (!client) return;
    await Promise.race([
      client.channels.get("chat-all").publish("ping", data).catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  } catch (error) {
    console.error("[chat] realtime ping failed:", error instanceof Error ? error.message : error);
  }
}

/** A short-lived, listen-only pass for one person's browser. The key itself never leaves the server. */
export async function createToken(personId: string): Promise<unknown | null> {
  try {
    const client = await rest();
    if (!client) return null;
    return await client.auth.createTokenRequest({
      clientId: personId,
      ttl: 60 * 60 * 1000,
      capability: JSON.stringify({ [`u-${personId}`]: ["subscribe"], "chat-all": ["subscribe"] }),
    });
  } catch (error) {
    console.error("[chat] realtime token failed:", error instanceof Error ? error.message : error);
    return null;
  }
}
