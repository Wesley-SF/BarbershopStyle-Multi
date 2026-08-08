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

export async function getCurrentPushSubscription() {
  if (!isWebPushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function createAdminPushSubscription(publicVapidKey) {
  if (!publicVapidKey) throw new Error("A chave pública VAPID não foi configurada.");
  const registration = await navigator.serviceWorker.ready;
  const existingSubscription = await registration.pushManager.getSubscription();
  return existingSubscription ?? registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicVapidKey),
  });
}

export async function saveAdminPushSubscription(subscription, userId) {
  const { endpoint, keys } = subscription.toJSON();
  if (!endpoint || !keys?.p256dh || !keys?.auth) throw new Error("A assinatura de notificações está incompleta.");

  const { error } = await supabase.from("push_subscriptions").upsert({
    user_id: userId,
    role: "admin",
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    updated_at: new Date().toISOString(),
  }, { onConflict: "endpoint" });
  if (error) throw error;
}

export async function removeAdminPushSubscription() {
  const subscription = await getCurrentPushSubscription();
  if (!subscription) return;
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
  if (error) throw error;
  await subscription.unsubscribe();
}
