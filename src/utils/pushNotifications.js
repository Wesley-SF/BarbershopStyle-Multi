import { supabase } from "../lib/supabase";

export function isWebPushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, (character) => character.charCodeAt(0));
}

function uint8ArrayToUrlBase64(value) {
  const binary = Array.from(value, (byte) => String.fromCharCode(byte)).join("");
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function createVapidFingerprint(publicVapidKey) {
  const digest = await window.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(publicVapidKey),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("").slice(0, 16);
}

export function isValidVapidPublicKey(value) {
  if (!value || value !== value.trim()) return false;

  try {
    const decoded = urlBase64ToUint8Array(value);
    return decoded.length === 65 && decoded[0] === 4;
  } catch {
    return false;
  }
}

export function doesPushSubscriptionUseVapidKey(subscription, publicVapidKey) {
  const currentKey = subscription?.options?.applicationServerKey;
  if (!currentKey || !isValidVapidPublicKey(publicVapidKey)) return false;

  return uint8ArrayToUrlBase64(new Uint8Array(currentKey)) === publicVapidKey;
}

export async function getVapidPublicConfiguration() {
  const { data, error } = await supabase.functions.invoke("send-admin-push", {
    body: { action: "get_vapid_public_key" },
  });

  if (error || !isValidVapidPublicKey(data?.publicKey)) {
    throw new Error("A chave pública de notificações não está disponível.");
  }
  if (!/^[0-9a-f]{16}$/.test(data?.fingerprint ?? "")) {
    throw new Error("A identificação da chave de notificações é inválida.");
  }

  const localFingerprint = await createVapidFingerprint(data.publicKey);
  if (localFingerprint !== data.fingerprint) {
    throw new Error("A chave de notificações não pôde ser validada.");
  }

  return { publicKey: data.publicKey, fingerprint: data.fingerprint };
}

export async function getCurrentPushSubscription() {
  if (!isWebPushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function getSavedAdminPushSubscription(
  subscription,
  userId,
  storeId,
) {
  if (!subscription?.endpoint || !userId || !storeId) return null;

  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id, vapid_key_fingerprint")
    .eq("endpoint", subscription.endpoint)
    .eq("user_id", userId)
    .eq("store_id", storeId)
    .eq("role", "admin")
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function createAdminPushSubscription(publicVapidKey) {
  if (!isValidVapidPublicKey(publicVapidKey)) {
    throw new Error("A chave pública VAPID não foi configurada corretamente.");
  }
  const registration = await navigator.serviceWorker.ready;
  const existingSubscription = await registration.pushManager.getSubscription();

  if (existingSubscription) {
    throw new Error("A assinatura anterior precisa ser removida antes da ativação.");
  }

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicVapidKey),
  });
}

async function removeAdminPushSubscriptionRecord(subscription, userId, storeId) {
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", subscription.endpoint)
    .eq("user_id", userId)
    .eq("store_id", storeId)
    .eq("role", "admin");

  if (error) throw error;
}

export async function replaceAdminPushSubscription(
  vapidConfiguration,
  userId,
  storeId,
) {
  const { publicKey, fingerprint } = vapidConfiguration;

  if (!isValidVapidPublicKey(publicKey)) {
    throw new Error("A chave pública VAPID não foi configurada corretamente.");
  }

  const existingSubscription = await getCurrentPushSubscription();

  if (existingSubscription) {
    await removeAdminPushSubscriptionRecord(
      existingSubscription,
      userId,
      storeId,
    );
    await existingSubscription.unsubscribe();
  }

  const subscription = await createAdminPushSubscription(publicKey);

  if (!doesPushSubscriptionUseVapidKey(subscription, publicKey)) {
    await subscription.unsubscribe().catch(() => false);
    throw new Error("A assinatura criada não corresponde à chave atual.");
  }

  return { subscription, fingerprint };
}

export async function saveAdminPushSubscription(
  subscription,
  userId,
  storeId,
  vapidKeyFingerprint,
) {
  const { endpoint, keys } = subscription.toJSON();
  if (!endpoint || !keys?.p256dh || !keys?.auth) throw new Error("A assinatura de notificações está incompleta.");
  if (!/^[0-9a-f]{16}$/.test(vapidKeyFingerprint)) {
    throw new Error("A identificação da chave de notificações é inválida.");
  }

  const { error } = await supabase.from("push_subscriptions").upsert({
    user_id: userId,
    store_id: storeId,
    role: "admin",
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    vapid_key_fingerprint: vapidKeyFingerprint,
    updated_at: new Date().toISOString(),
  }, { onConflict: "endpoint" });
  if (error) throw error;
}

export async function removeAdminPushSubscription(userId, storeId) {
  const subscription = await getCurrentPushSubscription();
  if (!subscription) return false;
  const { data, error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", subscription.endpoint)
    .eq("user_id", userId)
    .eq("store_id", storeId)
    .eq("role", "admin")
    .select("id");
  if (error) {
    await subscription.unsubscribe().catch(() => false);
    throw error;
  }

  if (!data?.length) return false;
  await subscription.unsubscribe();
  return true;
}
