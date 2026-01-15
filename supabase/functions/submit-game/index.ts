// Supabase Edge Function: submit-game
// Receives a finished game record and inserts it into public.game_logs.
//
// Deploy with Supabase CLI.
//
// Security note:
// - Keep RLS enabled on public.game_logs.
// - This function uses the service role key (server-side) so the client never gets write access.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type SubmitPayload = {
  game_id: string;
  winner: string;
  total_moves?: number;
  duration_seconds?: number;
  trajectory?: unknown;
  client_hint?: string;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // CORS (tighten later if you want)
      "access-control-allow-origin": "*",
      "access-control-allow-headers":
        "authorization, x-client-info, apikey, content-type",
      "access-control-allow-methods": "POST, OPTIONS",
    },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return json(200, { ok: true });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json(500, {
      error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    });
  }

  let payload: SubmitPayload;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  if (!payload?.game_id || !payload?.winner) {
    return json(400, { error: "game_id and winner are required" });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { error } = await supabase.from("game_logs").insert({
    game_id: payload.game_id,
    winner: payload.winner,
    total_moves: payload.total_moves ?? 0,
    duration_seconds: payload.duration_seconds ?? 0,
    trajectory: payload.trajectory ?? null,
    client_hint: payload.client_hint ?? null,
  });

  if (error) return json(500, { error: error.message });
  return json(200, { ok: true });
});
