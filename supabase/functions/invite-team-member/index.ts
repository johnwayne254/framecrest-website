import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed." }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("You must be signed in as an administrator.");

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData, error: userError } = await callerClient.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Your session could not be verified.");

    const adminClient = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: callerProfile, error: profileError } = await adminClient
      .from("profiles").select("role,account_type").eq("id", userData.user.id).single();
    if (profileError || callerProfile?.role !== "admin" || callerProfile?.account_type !== "staff") {
      return new Response(JSON.stringify({ error: "Only a FrameCrest administrator can invite staff." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const fullName = String(body.full_name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const role = String(body.role || "");
    if (!fullName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !["editor", "qa"].includes(role)) {
      throw new Error("Enter a valid name, email and staff role (Editor or QA).");
    }

    const { data: invitation, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName, framecrest_account_type: "staff", framecrest_role: role },
    });
    if (inviteError) throw inviteError;
    const invitedUserId = invitation.user?.id;
    if (!invitedUserId) throw new Error("Supabase did not return the invited user.");

    // The auth trigger creates a client-default profile. Promote only this new,
    // unlinked invitation to staff; the database guard blocks linked client accounts.
    const { error: updateError } = await adminClient.from("profiles").update({
      full_name: fullName, role, account_type: "staff", client_id: null,
    }).eq("id", invitedUserId);
    if (updateError) {
      await adminClient.auth.admin.deleteUser(invitedUserId);
      throw updateError;
    }

    return new Response(JSON.stringify({ success: true, invited_email: email, role }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || "Invitation failed." }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
