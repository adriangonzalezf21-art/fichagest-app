import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function randomJoinCode(length = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function randomPassword(length = 24) {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Falta Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const {
      data: { user },
      error: authErr,
    } = await userClient.auth.getUser();

    if (authErr || !user) {
      return new Response(
        JSON.stringify({ error: authErr?.message || "No autenticado" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: me, error: meErr } = await adminClient
      .from("profiles")
      .select("user_id, is_owner, full_name")
      .eq("user_id", user.id)
      .maybeSingle();

    if (meErr) {
      return new Response(JSON.stringify({ error: meErr.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!me || me.is_owner !== true) {
      return new Response(JSON.stringify({ error: "Solo el owner puede ejecutar esta acción" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();

    const companyName = String(body.company_name || "").trim();
    const companyCif = String(body.company_cif || "").trim() || null;
    const adminFullName = String(body.admin_full_name || "").trim();
    const adminEmail = String(body.admin_email || "").trim().toLowerCase();

    if (!companyName) {
      return new Response(JSON.stringify({ error: "Falta el nombre de la empresa" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!adminFullName) {
      return new Response(JSON.stringify({ error: "Falta el nombre del admin" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!adminEmail) {
      return new Response(JSON.stringify({ error: "Falta el email del admin" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let joinCode = randomJoinCode();

    for (let i = 0; i < 10; i++) {
      const { data: existingCompany } = await adminClient
        .from("companies")
        .select("id")
        .eq("join_code", joinCode)
        .maybeSingle();

      if (!existingCompany) break;
      joinCode = randomJoinCode();
    }

    const generatedPassword = randomPassword(24);

    const { data: createdUser, error: createUserErr } =
      await adminClient.auth.admin.createUser({
        email: adminEmail,
        password: generatedPassword,
        email_confirm: true,
        user_metadata: {
          full_name: adminFullName,
        },
      });

    if (createUserErr || !createdUser.user) {
      return new Response(
        JSON.stringify({
          error: createUserErr?.message || "No se pudo crear el usuario admin",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const adminUserId = createdUser.user.id;

    const { data: companyRow, error: companyErr } = await adminClient
      .from("companies")
      .insert({
        name: companyName,
        cif: companyCif,
        join_code: joinCode,
        primary_admin_user_id: null,
      })
      .select("id, name, cif, join_code, primary_admin_user_id")
      .single();

    if (companyErr || !companyRow) {
      await adminClient.auth.admin.deleteUser(adminUserId);
      return new Response(
        JSON.stringify({
          error: companyErr?.message || "No se pudo crear la empresa",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const companyId = companyRow.id;

    const { error: upsertProfileErr } = await adminClient
      .from("profiles")
      .upsert(
        {
          user_id: adminUserId,
          full_name: adminFullName,
          company_id: companyId,
          role: "admin",
          is_owner: false,
          active: true,
        },
        { onConflict: "user_id" }
      );

    if (upsertProfileErr) {
      await adminClient.from("companies").delete().eq("id", companyId);
      await adminClient.auth.admin.deleteUser(adminUserId);
      return new Response(JSON.stringify({ error: upsertProfileErr.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: finalCompanyRow, error: updateCompanyErr } = await adminClient
      .from("companies")
      .update({
        primary_admin_user_id: adminUserId,
      })
      .eq("id", companyId)
      .select("id, name, cif, join_code, primary_admin_user_id")
      .single();

    if (updateCompanyErr || !finalCompanyRow) {
      await adminClient.from("companies").delete().eq("id", companyId);
      await adminClient.from("profiles").delete().eq("user_id", adminUserId);
      await adminClient.auth.admin.deleteUser(adminUserId);
      return new Response(
        JSON.stringify({
          error:
            updateCompanyErr?.message ||
            "La empresa se creó pero no se pudo asignar el admin principal",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let passwordSetupLink: string | null = null;
    let warning: string | null = null;

    const { data: resetData, error: resetErr } =
      await adminClient.auth.admin.generateLink({
        type: "recovery",
        email: adminEmail,
      });

    if (resetErr) {
      warning =
        "Empresa y admin creados, pero no se pudo generar el enlace para definir contraseña: " +
        resetErr.message;
    } else {
      passwordSetupLink = resetData?.properties?.action_link ?? null;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        company: finalCompanyRow,
        admin: {
          user_id: adminUserId,
          full_name: adminFullName,
          email: adminEmail,
        },
        password_setup_link: passwordSetupLink,
        warning,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Error inesperado",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});