import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Method not allowed." }, 405);
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return reply({ error: "Sign in as an administrator first." }, 401);
    const url = Deno.env.get("SUPABASE_URL")!, anonKey = Deno.env.get("SUPABASE_ANON_KEY")!, serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const token = authHeader.replace(/^Bearer\\s+/i, "");
    const { data: authData, error: authError } = await caller.auth.getUser(token);
    if (authError || !authData.user) return reply({ error: "Your session could not be verified." }, 401);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: adminProfile, error: adminError } = await admin.from("profiles").select("role,account_type").eq("id", authData.user.id).single();
    if (adminError || adminProfile?.role !== "admin" || adminProfile?.account_type !== "staff") return reply({ error: "Only a FrameCrest administrator can manage staff accounts." }, 403);
    const body = await req.json(), userId = String(body.user_id || ""), action = String(body.action || "");
    if (!userId || !["disable", "enable", "delete"].includes(action)) return reply({ error: "A valid staff account and action are required." }, 400);
    const { data: target, error: targetError } = await admin.from("profiles").select("id,role,account_type,client_id").eq("id", userId).single();
    if (targetError || !target) return reply({ error: "Staff account not found." }, 404);
    if (target.account_type !== "staff" || !["editor", "qa"].includes(target.role) || target.client_id !== null) return reply({ error: "Only separate Editor or QA staff accounts can be managed here. Client and administrator accounts are protected." }, 403);
    if (action === "delete") {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw error;
      return reply({ success: true, action, user_id: userId });
    }
    const { error: authUpdateError } = await admin.auth.admin.updateUserById(userId, { ban_duration: action === "disable" ? "876000h" : "none" });
    if (authUpdateError) throw authUpdateError;
    const { error: profileUpdateError } = await admin.from("profiles").update({ is_active: action === "enable" }).eq("id", userId);
    if (profileUpdateError) {
      await admin.auth.admin.updateUserById(userId, { ban_duration: action === "disable" ? "none" : "876000h" });
      throw profileUpdateError;
    }
    return reply({ success: true, action, user_id: userId });
  } catch (error) { return reply({ error: error.message || "The account action failed." }, 400); }
});
