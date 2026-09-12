import { createClient } from "npm:@supabase/supabase-js@2";

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`Secret ausente: ${name}`);
  }

  return value;
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });

const formatDateBR = (date: string) => {
  const [year, month, day] = String(date).split("-");

  return year && month && day
    ? `${day}/${month}/${year}`
    : date;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const skippedResponse = (reason: string) =>
  jsonResponse({ success: true, sent: false, reason });

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse(
      { error: "Método não permitido." },
      405,
    );
  }

  try {
    const webhookSecret = requiredEnv(
      "APPOINTMENTS_NTFY_WEBHOOK_SECRET",
    );

    if (
      request.headers.get("x-webhook-secret") !== webhookSecret
    ) {
      return jsonResponse(
        { error: "Não autorizado." },
        401,
      );
    }

    const payload = await request.json();

    if (
      payload.type !== "INSERT" ||
      payload.schema !== "public" ||
      payload.table !== "appointments" ||
      !payload.record
    ) {
      return jsonResponse(
        { error: "Evento inválido." },
        400,
      );
    }

    const appointment = payload.record;

    if (
      typeof appointment.store_id !== "string" ||
      !uuidPattern.test(appointment.store_id)
    ) {
      return skippedResponse("STORE_ID_INVALID");
    }

    const supabase = createClient(
      requiredEnv("SUPABASE_URL"),
      requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
    const { data: settings, error: settingsError } = await supabase
      .from("store_notification_settings")
      .select(
        "ntfy_enabled, ntfy_server_url, ntfy_topic, use_legacy_ntfy_env",
      )
      .eq("store_id", appointment.store_id)
      .maybeSingle();

    if (settingsError) {
      console.error("Erro ao consultar configuração NTFY:", {
        code: settingsError.code,
        message: settingsError.message,
      });
      return jsonResponse(
        { error: "Não foi possível consultar a configuração." },
        500,
      );
    }

    if (!settings || !settings.ntfy_enabled) {
      return skippedResponse("NTFY_DISABLED");
    }

    let ntfyServer = settings.ntfy_server_url?.trim() || "";
    let ntfyTopic = settings.ntfy_topic?.trim() || "";

    if (settings.use_legacy_ntfy_env) {
      ntfyServer ||= Deno.env.get("NTFY_SERVER") ?? "https://ntfy.sh";
      ntfyTopic ||= Deno.env.get("NTFY_TOPIC") ?? "";
    }

    if (!ntfyTopic) {
      return skippedResponse("NTFY_TOPIC_NOT_CONFIGURED");
    }

    ntfyServer ||= "https://ntfy.sh";

    let ntfyDestination: URL;
    try {
      ntfyDestination = new URL(ntfyServer);
      if (
        ntfyDestination.protocol !== "https:" ||
        ntfyDestination.username ||
        ntfyDestination.password ||
        ntfyDestination.search ||
        ntfyDestination.hash
      ) {
        return skippedResponse("NTFY_SERVER_INVALID");
      }
      ntfyDestination.pathname =
        `${ntfyDestination.pathname.replace(/\/$/, "")}/${encodeURIComponent(ntfyTopic)}`;
    } catch {
      return skippedResponse("NTFY_SERVER_INVALID");
    }

    const message = [
      `Cliente: ${appointment.customer_name}`,
      `Serviço: ${appointment.service}`,
      `Data: ${formatDateBR(appointment.appointment_date)}`,
      `Horário: ${String(appointment.appointment_time).slice(0, 5)}`,
    ].join("\n");

    const response = await fetch(
      ntfyDestination,
      {
        method: "POST",
        headers: {
          "Title": "Novo agendamento",
          "Priority": "high",
          "Tags": "calendar,barber",
          "Content-Type": "text/plain; charset=utf-8",
        },
        body: message,
      },
    );

    if (!response.ok) {
      console.error("Erro retornado pelo ntfy:", {
        status: response.status,
      });

      return jsonResponse(
        { error: "Não foi possível enviar a notificação." },
        502,
      );
    }

    return jsonResponse({
      success: true,
      sent: true,
      message: "Notificação enviada.",
    });
  } catch (error) {
    console.error(
      "Erro na função send-ntfy-appointment:",
      error,
    );

    return jsonResponse(
      { error: "Erro interno ao enviar notificação." },
      500,
    );
  }
});
