import { createClient } from "npm:@supabase/supabase-js@2";

const NTFY_TIMEOUT_MS = 10_000;

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Secret ausente: ${name}`);
  return value;
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const formatDateBR = (date: unknown) => {
  const [year, month, day] = String(date ?? "").split("-");
  return year && month && day ? `${day}/${month}/${year}` : "Não informada";
};

const limitedText = (value: unknown, maximumLength: number) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "Não informado";
  const characters = Array.from(normalized);
  return characters.length > maximumLength
    ? `${characters.slice(0, maximumLength - 1).join("")}…`
    : normalized;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const getHttpErrorCategory = (status: number) => {
  if (status === 400) return "invalid_request";
  if (status === 401 || status === 403) return "authentication_or_permission";
  if (status === 404) return "destination_not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "ntfy_unavailable";
  return "ntfy_http_error";
};

Deno.serve(async (request) => {
  let appointmentId: string | number | null = null;
  let storeId: string | null = null;
  let ntfyEnabled: boolean | null = null;
  let deliveryAttempted = false;

  const respond = (
    body: Record<string, unknown>,
    status: number,
    deliverySuccess: boolean,
    httpStatus: number | null,
    errorCategory: string | null,
  ) => {
    console.info(JSON.stringify({
      event: "ntfy_summary",
      appointment_id: appointmentId,
      store_id: storeId,
      ntfy_enabled: ntfyEnabled,
      delivery_attempted: deliveryAttempted,
      delivery_success: deliverySuccess,
      http_status: httpStatus,
      error_category: errorCategory,
    }));
    return jsonResponse(body, status);
  };

  if (request.method !== "POST") {
    return respond(
      { error: "Método não permitido." },
      405,
      false,
      null,
      "method_not_allowed",
    );
  }

  try {
    const webhookSecret = requiredEnv("APPOINTMENTS_NTFY_WEBHOOK_SECRET");
    if (request.headers.get("x-webhook-secret") !== webhookSecret) {
      return respond(
        { error: "Não autorizado." },
        401,
        false,
        null,
        "webhook_unauthorized",
      );
    }

    const payload = await request.json();
    if (
      payload.type !== "INSERT" ||
      payload.schema !== "public" ||
      payload.table !== "appointments" ||
      !payload.record
    ) {
      return respond(
        { error: "Evento inválido." },
        400,
        false,
        null,
        "webhook_payload_invalid",
      );
    }

    const appointment = payload.record;
    appointmentId = appointment.id ?? null;
    storeId = typeof appointment.store_id === "string" ? appointment.store_id : null;

    if (storeId === null || !uuidPattern.test(storeId)) {
      return respond(
        { success: true, sent: false, reason: "STORE_ID_INVALID" },
        200,
        false,
        null,
        "store_id_invalid",
      );
    }

    const supabase = createClient(
      requiredEnv("SUPABASE_URL"),
      requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: settings, error: settingsError } = await supabase
      .from("store_notification_settings")
      .select("ntfy_enabled, ntfy_server_url, ntfy_topic, use_legacy_ntfy_env")
      .eq("store_id", storeId)
      .maybeSingle();

    if (settingsError) {
      return respond(
        { error: "Não foi possível consultar a configuração." },
        500,
        false,
        null,
        "settings_query_failed",
      );
    }

    if (!settings) {
      return respond(
        { success: true, sent: false, reason: "NTFY_SETTINGS_NOT_FOUND" },
        200,
        false,
        null,
        "settings_not_found",
      );
    }

    ntfyEnabled = settings.ntfy_enabled === true;
    if (!ntfyEnabled) {
      return respond(
        { success: true, sent: false, reason: "NTFY_DISABLED" },
        200,
        false,
        null,
        "ntfy_disabled",
      );
    }

    let ntfyServer = settings.ntfy_server_url?.trim() || "";
    let ntfyTopic = settings.ntfy_topic?.trim() || "";

    if (settings.use_legacy_ntfy_env === true) {
      ntfyServer ||= Deno.env.get("NTFY_SERVER") ?? "https://ntfy.sh";
      ntfyTopic ||= Deno.env.get("NTFY_TOPIC") ?? "";
    }

    if (!ntfyTopic) {
      return respond(
        { success: true, sent: false, reason: "NTFY_TOPIC_NOT_CONFIGURED" },
        200,
        false,
        null,
        "topic_not_configured",
      );
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
        throw new Error("NTFY_SERVER_INVALID");
      }
      ntfyDestination.pathname =
        `${ntfyDestination.pathname.replace(/\/$/, "")}/${encodeURIComponent(ntfyTopic)}`;
    } catch {
      return respond(
        { success: true, sent: false, reason: "NTFY_SERVER_INVALID" },
        200,
        false,
        null,
        "server_invalid",
      );
    }

    const message = [
      `Cliente: ${limitedText(appointment.customer_name, 100)}`,
      `Serviço: ${limitedText(appointment.service, 500)}`,
      `Data: ${formatDateBR(appointment.appointment_date)}`,
      `Horário: ${limitedText(appointment.appointment_time, 8).slice(0, 5)}`,
    ].join("\n");

    deliveryAttempted = true;
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), NTFY_TIMEOUT_MS);

    try {
      const response = await fetch(ntfyDestination, {
        method: "POST",
        headers: {
          "Title": "Novo agendamento",
          "Priority": "high",
          "Tags": "calendar,barber",
          "Content-Type": "text/plain; charset=utf-8",
        },
        body: message,
        signal: abortController.signal,
      });

      if (!response.ok) {
        return respond(
          { error: "Não foi possível enviar a notificação." },
          502,
          false,
          response.status,
          getHttpErrorCategory(response.status),
        );
      }

      return respond(
        { success: true, sent: true, message: "Notificação enviada." },
        200,
        true,
        response.status,
        null,
      );
    } catch {
      const timedOut = abortController.signal.aborted;
      return respond(
        { error: "Não foi possível enviar a notificação." },
        502,
        false,
        null,
        timedOut ? "timeout" : "network_error",
      );
    } finally {
      clearTimeout(timeoutId);
    }
  } catch {
    return respond(
      { error: "Erro interno ao enviar notificação." },
      500,
      false,
      null,
      "function_error",
    );
  }
});
