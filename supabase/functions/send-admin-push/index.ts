import { createClient } from "npm:@supabase/supabase-js@2";
import { buildPushPayload } from "npm:@block65/webcrypto-web-push@2.0.0";

class FunctionConfigurationError extends Error {
  category: string;

  constructor(category: string) {
    super(category);
    this.category = category;
  }
}

class PushServiceError extends Error {
  statusCode: number;
  body: string;

  constructor(statusCode: number, body: string) {
    super(`Push service respondeu com HTTP ${statusCode}.`);
    this.statusCode = statusCode;
    this.body = body;
  }
}

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) {
    throw new FunctionConfigurationError(
      `missing_${name.toLowerCase()}`,
    );
  }
  return value;
};

const normalizeVapidPublicKey = (value: string) =>
  value.trim().replace(/=+$/g, "");

const decodeBase64Url = (value: string) => {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
};

const isValidVapidKey = (
  value: string,
  expectedLength: number,
  expectedFirstByte?: number,
) => {
  try {
    const decoded = decodeBase64Url(value);
    return decoded.length === expectedLength &&
      (expectedFirstByte === undefined || decoded[0] === expectedFirstByte);
  } catch {
    return false;
  }
};

const validateVapidConfiguration = (
  subject: string,
  publicKey: string,
  privateKey: string,
) => {
  if (!/^mailto:.+@.+|^https:\/\/.+/i.test(subject)) {
    throw new FunctionConfigurationError("vapid_subject_invalid");
  }
  if (!isValidVapidKey(publicKey, 65, 4)) {
    throw new FunctionConfigurationError("vapid_public_key_invalid");
  }
  if (!isValidVapidKey(privateKey, 32)) {
    throw new FunctionConfigurationError("vapid_private_key_invalid");
  }
};

const getVapidFingerprint = async (publicKey: string) => {
  const normalizedKey = normalizeVapidPublicKey(publicKey);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalizedKey),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
};

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8",
    },
  });

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const limitedText = (value: unknown, maximumLength: number) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "Não informado";
  const characters = Array.from(normalized);
  return characters.length > maximumLength
    ? `${characters.slice(0, maximumLength - 1).join("")}…`
    : normalized;
};

const formatAppointmentTime = (value: unknown) =>
  limitedText(value, 8).slice(0, 5);

const logEvent = (
  event: Record<string, unknown>,
  level: "info" | "error" = "info",
) => console[level](JSON.stringify(event));

const isClearlyInvalidSubscription = (statusCode: number, error: unknown) => {
  if (statusCode !== 400 || typeof error !== "object" || error === null) {
    return false;
  }

  const pushError = error as { body?: unknown; message?: unknown };
  const safeInspectionText = [pushError.body, pushError.message]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  return [
    "invalidregistration",
    "not a valid fcm registration token",
    "invalid subscription",
    "subscription is invalid",
    "invalid endpoint",
  ].some((marker) => safeInspectionText.includes(marker));
};

const getPushProvider = (endpoint: unknown) => {
  if (typeof endpoint !== "string") return "unknown";

  try {
    const hostname = new URL(endpoint).hostname.toLowerCase();
    if (
      hostname === "fcm.googleapis.com" ||
      hostname === "android.googleapis.com"
    ) {
      return "fcm";
    }
    if (hostname.endsWith("push.services.mozilla.com")) return "mozilla";
    if (hostname.endsWith("push.apple.com")) return "apple";
  } catch {
    return "unknown";
  }

  return "other";
};

const getSafeProviderDiagnostics = (
  error: unknown,
  endpoint: unknown,
) => {
  const diagnostics: {
    provider: string;
    provider_error_code?: string;
    provider_error_reason?: string;
  } = { provider: getPushProvider(endpoint) };

  if (typeof error !== "object" || error === null) return diagnostics;

  const pushError = error as {
    body?: unknown;
    code?: unknown;
    message?: unknown;
  };
  let parsedBody: Record<string, unknown> | null = null;

  if (typeof pushError.body === "string") {
    try {
      const parsed = JSON.parse(pushError.body);
      if (typeof parsed === "object" && parsed !== null) {
        parsedBody = parsed as Record<string, unknown>;
      }
    } catch {
      // O corpo não estruturado é usado somente na classificação abaixo.
    }
  }

  const bodyError = parsedBody?.error;
  const structuredError =
    typeof bodyError === "object" && bodyError !== null
      ? bodyError as Record<string, unknown>
      : null;
  const details = Array.isArray(structuredError?.details)
    ? structuredError.details
    : [];
  const detailErrorCode = details
    .map((detail) =>
      typeof detail === "object" && detail !== null
        ? (detail as Record<string, unknown>).errorCode
        : undefined
    )
    .find((value) => typeof value === "string");
  const codeCandidates = [
    detailErrorCode,
    structuredError?.status,
    parsedBody?.errno,
    parsedBody?.code,
    pushError.code,
  ];
  const safeCode = codeCandidates.find(
    (value) =>
      (typeof value === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(value)) ||
      (typeof value === "number" && Number.isSafeInteger(value)),
  );

  if (safeCode !== undefined) {
    diagnostics.provider_error_code = String(safeCode);
  }

  const allowedAppleReasons = new Set([
    "VapidPkHashMismatch",
    "BadVapidPublicKey",
    "BadJwtToken",
    "BadAuthorizationHeader",
    "BadWebPushRequest",
    "BadTtl",
    "BadUrgency",
    "BadWebPushTopic",
    "BadPath",
    "PayloadTooLarge",
    "TooManyRequests",
    "InternalServerError",
    "ServiceUnavailable",
  ]);
  const appleReason = parsedBody?.reason;

  if (
    diagnostics.provider === "apple" &&
    typeof appleReason === "string" &&
    allowedAppleReasons.has(appleReason)
  ) {
    diagnostics.provider_error_reason = appleReason;
  }

  const inspectionText = [
    pushError.code,
    pushError.body,
    pushError.message,
    structuredError?.status,
    structuredError?.message,
    parsedBody?.error,
    parsedBody?.message,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  const reasonPatterns: Array<[RegExp, string]> = [
    [/unauthorizedregistration/, "UnauthorizedRegistration"],
    [/invalidregistration/, "InvalidRegistration"],
    [/badjwttoken|bad jwt token/, "BadJwtToken"],
    [/invalid[^.]{0,40}vapid|vapid[^.]{0,40}invalid/, "InvalidVapid"],
    [/invalid[^.]{0,40}encrypt|encrypt[^.]{0,40}invalid/, "InvalidEncryption"],
    [/invalid[^.]{0,40}subscription|subscription[^.]{0,40}invalid/, "InvalidSubscription"],
    [/invalid_argument|invalid argument/, "InvalidArgument"],
    [/badrequest|bad request/, "BadRequest"],
  ];
  const matchedReason = reasonPatterns.find(([pattern]) =>
    pattern.test(inspectionText)
  );

  if (!diagnostics.provider_error_reason && matchedReason) {
    diagnostics.provider_error_reason = matchedReason[1];
  }
  return diagnostics;
};

const getErrorCategory = (statusCode: number, invalidSubscription = false) => {
  if (invalidSubscription) return "subscription_invalid";
  if (statusCode === 400) return "invalid_subscription_or_payload";
  if (statusCode === 401 || statusCode === 403) return "vapid_authentication";
  if (statusCode === 404 || statusCode === 410) return "subscription_expired";
  if (statusCode === 429) return "rate_limited";
  if (statusCode >= 500) return "push_service_unavailable";
  if (statusCode === 0) return "network_or_unknown";
  return "push_service_error";
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Método não permitido." }, 405);
  }

  let appointmentId: string | number | null = null;
  let storeId: string | null = null;

  try {
    const payload = await request.json();
    const isPublicVapidRequest =
      typeof payload === "object" &&
      payload !== null &&
      Object.keys(payload).length === 1 &&
      payload.action === "get_vapid_public_key";

    if (isPublicVapidRequest) {
      const publicKey = normalizeVapidPublicKey(
        requiredEnv("VAPID_PUBLIC_KEY"),
      );

      if (!isValidVapidKey(publicKey, 65, 4)) {
        throw new FunctionConfigurationError("vapid_public_key_invalid");
      }

      return jsonResponse({
        publicKey,
        fingerprint: await getVapidFingerprint(publicKey),
      });
    }

    const webhookSecret = requiredEnv("APPOINTMENTS_WEBHOOK_SECRET");
    const receivedWebhookSecret = request.headers.get("x-webhook-secret");
    if (receivedWebhookSecret !== webhookSecret) {
      logEvent({
        event: "push_auth_failure",
        http_status: 401,
        error_category: receivedWebhookSecret
          ? "webhook_secret_mismatch"
          : "webhook_secret_missing",
      }, "error");
      return jsonResponse({ error: "Não autorizado." }, 401);
    }

    if (
      payload.type !== "INSERT" ||
      payload.schema !== "public" ||
      payload.table !== "appointments" ||
      !payload.record
    ) {
      return jsonResponse({ error: "Evento inválido." }, 400);
    }

    const appointment = payload.record;
    appointmentId = appointment.id ?? null;
    storeId = typeof appointment.store_id === "string" ? appointment.store_id : null;

    if (storeId === null || !uuidPattern.test(storeId)) {
      logEvent({
        event: "push_summary",
        appointment_id: appointmentId,
        store_id: storeId,
        subscriptions_found: 0,
        sent_successfully: 0,
        failed: 0,
        expired_removed: 0,
        outcome: "store_id_invalid",
      });
      return jsonResponse({ success: true, sent: 0, reason: "STORE_ID_INVALID" });
    }

    const supabase = createClient(
      requiredEnv("SUPABASE_URL"),
      requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const vapidSubject = requiredEnv("VAPID_SUBJECT");
    const vapidPublicKey = normalizeVapidPublicKey(
      requiredEnv("VAPID_PUBLIC_KEY"),
    );
    const vapidPrivateKey = requiredEnv("VAPID_PRIVATE_KEY");
    validateVapidConfiguration(vapidSubject, vapidPublicKey, vapidPrivateKey);
    const vapidFingerprint = await getVapidFingerprint(vapidPublicKey);
    const vapid = {
      subject: vapidSubject,
      publicKey: vapidPublicKey,
      privateKey: vapidPrivateKey,
    };

    const { data: subscriptions, error: subscriptionsError } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, vapid_key_fingerprint")
      .eq("role", "admin")
      .eq("store_id", storeId);

    if (subscriptionsError) throw subscriptionsError;

    const customerName = limitedText(appointment.customer_name, 80);
    const appointmentTime = formatAppointmentTime(appointment.appointment_time);
    const services = limitedText(appointment.service, 160);
    const notification = JSON.stringify({
      title: "Novo agendamento",
      body: `${customerName}\n${appointmentTime} • ${services}`,
      url: "/admin",
      tag: `appointment-${appointmentId}`,
      appointment_id: appointmentId,
    });

    const results = await Promise.allSettled(
      (subscriptions ?? []).map(async (subscription) => {
        if (subscription.vapid_key_fingerprint !== vapidFingerprint) {
          const { error: deleteError } = await supabase
            .from("push_subscriptions")
            .delete()
            .eq("id", subscription.id)
            .eq("store_id", storeId);

          if (deleteError) {
            logEvent({
              event: "push_failure",
              appointment_id: appointmentId,
              store_id: storeId,
              http_status: null,
              error_category: "stale_vapid_cleanup_failed",
            }, "error");
          } else {
            logEvent({
              event: "stale_vapid_removed",
              appointment_id: appointmentId,
              store_id: storeId,
            });
          }

          return {
            sent: false,
            expired: false,
            invalidSubscription: false,
            staleVapid: true,
            removed: !deleteError,
          };
        }

        try {
          const pushPayload = await buildPushPayload(
            {
              data: notification,
              options: { ttl: 300 },
            },
            {
              endpoint: subscription.endpoint,
              expirationTime: null,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            vapid,
          );
          const response = await fetch(subscription.endpoint, pushPayload);

          if (!response.ok) {
            throw new PushServiceError(response.status, await response.text());
          }

          return {
            sent: true,
            expired: false,
            invalidSubscription: false,
            staleVapid: false,
            removed: false,
          };
        } catch (error) {
          const statusCode = Number(
            (error as { statusCode?: number }).statusCode ?? 0,
          );
          const expired = statusCode === 404 || statusCode === 410;
          const invalidSubscription = isClearlyInvalidSubscription(
            statusCode,
            error,
          );
          const shouldRemove = expired || invalidSubscription;
          const errorCategory = getErrorCategory(
            statusCode,
            invalidSubscription,
          );
          const providerDiagnostics = getSafeProviderDiagnostics(
            error,
            subscription.endpoint,
          );
          let removed = false;

          if (shouldRemove) {
            const { error: deleteError } = await supabase
              .from("push_subscriptions")
              .delete()
              .eq("id", subscription.id)
              .eq("store_id", storeId);
            removed = !deleteError;

            if (deleteError) {
              logEvent({
                event: "push_failure",
                appointment_id: appointmentId,
                store_id: storeId,
                http_status: statusCode,
                error_category: invalidSubscription
                  ? "invalid_subscription_cleanup_failed"
                  : "expired_subscription_cleanup_failed",
              }, "error");
            }
          }

          logEvent({
            event: "push_failure",
            appointment_id: appointmentId,
            store_id: storeId,
            http_status: statusCode || null,
            error_category: errorCategory,
            ...providerDiagnostics,
          }, "error");
          return {
            sent: false,
            expired,
            invalidSubscription,
            staleVapid: false,
            removed,
          };
        }
      }),
    );

    const reports = results.map((result) => {
      if (result.status === "fulfilled") return result.value;

      logEvent({
        event: "push_failure",
        appointment_id: appointmentId,
        store_id: storeId,
        http_status: null,
        error_category: "unexpected_send_rejection",
      }, "error");
      return {
        sent: false,
        expired: false,
        invalidSubscription: false,
        staleVapid: false,
        removed: false,
      };
    });

    const summary = {
      event: "push_summary",
      appointment_id: appointmentId,
      store_id: storeId,
      vapid_fingerprint: vapidFingerprint,
      subscriptions_found: reports.length,
      sent_successfully: reports.filter((item) => item.sent).length,
      failed: reports.filter((item) => !item.sent && !item.staleVapid).length,
      expired_removed: reports.filter((item) => item.removed && item.expired)
        .length,
      invalid_removed: reports.filter(
        (item) => item.removed && item.invalidSubscription,
      ).length,
      stale_vapid_removed: reports.filter(
        (item) => item.removed && item.staleVapid,
      ).length,
    };
    logEvent(summary);

    return jsonResponse({
      subscriptions: summary.subscriptions_found,
      sent: summary.sent_successfully,
      failed: summary.failed,
      removed: summary.expired_removed + summary.invalid_removed +
        summary.stale_vapid_removed,
    });
  } catch (error) {
    logEvent({
      event: "push_failure",
      appointment_id: appointmentId,
      store_id: storeId,
      http_status: null,
      error_category: error instanceof FunctionConfigurationError
        ? error.category
        : "function_error",
    }, "error");
    return jsonResponse({ error: "Não foi possível enviar as notificações." }, 500);
  }
});
