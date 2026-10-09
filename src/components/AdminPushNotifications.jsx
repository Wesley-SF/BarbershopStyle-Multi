import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { getPwaInstallState } from "../utils/pwaInstall";
import {
  createAdminPushSubscription,
  getCurrentPushSubscription,
  isAdminPushSubscriptionSaved,
  isWebPushSupported,
  removeAdminPushSubscription,
  saveAdminPushSubscription,
} from "../utils/pushNotifications";

const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function isIosDevice() {
  return (
    /iPad|iPhone|iPod/.test(window.navigator.userAgent) ||
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1)
  );
}

function AdminPushNotifications({ storeId, userId }) {
  const [status, setStatus] = useState("loading");
  const [feedback, setFeedback] = useState("");
  const [isWorking, setIsWorking] = useState(false);

  const refreshStatus = useCallback(async () => {
    if (isIosDevice() && !getPwaInstallState().isStandalone) {
      setStatus("ios-install-required");
      return;
    }

    if (!isWebPushSupported()) {
      setStatus("unsupported");
      return;
    }

    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }

    if (!vapidPublicKey) {
      setStatus("unconfigured");
      return;
    }

    const subscription = await getCurrentPushSubscription();
    const isSaved = await isAdminPushSubscriptionSaved(subscription, userId, storeId);
    setStatus(isSaved ? "active" : "inactive");
  }, [storeId, userId]);

  useEffect(() => {
    let isCancelled = false;

    const loadStatus = async () => {
      try {
        await refreshStatus();
      } catch (error) {
        console.error("Erro ao verificar notificações deste aparelho:", error);
        if (!isCancelled) {
          setFeedback("Não foi possível verificar as notificações neste aparelho.");
          setStatus("error");
        }
      }
    };

    void loadStatus();
    return () => {
      isCancelled = true;
    };
  }, [refreshStatus]);

  const handleActivate = async () => {
    setIsWorking(true);
    setFeedback("");
    let createdSubscription = null;

    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user || data.user.id !== userId) {
        throw new Error("A sessão administrativa mudou. Entre novamente no painel.");
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "inactive");
        setFeedback("A permissão não foi concedida.");
        return;
      }

      let subscription = await getCurrentPushSubscription();
      const belongsToCurrentAdmin = await isAdminPushSubscriptionSaved(
        subscription,
        userId,
        storeId,
      );

      if (subscription && !belongsToCurrentAdmin) {
        await subscription.unsubscribe();
        subscription = null;
      }

      if (!subscription) {
        subscription = await createAdminPushSubscription(vapidPublicKey);
        createdSubscription = subscription;
      }

      await saveAdminPushSubscription(subscription, userId, storeId);
      setStatus("active");
      setFeedback("Notificações ativadas neste aparelho.");
    } catch (error) {
      if (createdSubscription) await createdSubscription.unsubscribe().catch(() => false);
      console.error("Erro ao ativar notificações:", error);
      setStatus("error");
      setFeedback(error.message || "Não foi possível ativar as notificações.");
    } finally {
      setIsWorking(false);
    }
  };

  const handleDeactivate = async () => {
    setIsWorking(true);
    setFeedback("");
    try {
      await removeAdminPushSubscription(userId, storeId);
      setStatus("inactive");
      setFeedback("Notificações desativadas neste aparelho.");
    } catch (error) {
      console.error("Erro ao desativar notificações:", error);
      setFeedback("Não foi possível desativar as notificações neste aparelho.");
    } finally {
      setIsWorking(false);
    }
  };

  const descriptions = {
    loading: "Verificando este aparelho...",
    active: "Este aparelho receberá avisos de novos agendamentos desta barbearia.",
    inactive: "Ative para receber avisos de novos agendamentos neste aparelho.",
    denied: "As notificações estão bloqueadas. Libere-as nas configurações do navegador.",
    unsupported: "Este navegador não oferece suporte a notificações Web Push.",
    unconfigured: "As notificações ainda não foram configuradas para este ambiente.",
    error: "Não foi possível confirmar o estado das notificações.",
  };

  return (
    <section className="admin-push-settings" aria-labelledby="admin-push-title">
      <div>
        <p className="eyebrow">Notificações</p>
        <h2 id="admin-push-title">Avisos de novos agendamentos</h2>
        {status === "ios-install-required" ? (
          <p>
            No iPhone, abra no Safari, toque em Compartilhar → Adicionar à Tela de Início e
            ative as notificações pelo aplicativo instalado.
          </p>
        ) : (
          <p>{descriptions[status]}</p>
        )}
        {feedback && (
          <p className={`admin-feedback admin-feedback--${status === "active" || status === "inactive" ? "success" : "error"}`} role="status">
            {feedback}
          </p>
        )}
      </div>
      {status === "inactive" && (
        <button className="schedule-block-submit admin-push-button" type="button" disabled={isWorking} onClick={handleActivate}>
          {isWorking ? "Ativando..." : "Ativar notificações"}
        </button>
      )}
      {status === "active" && (
        <button className="schedule-block-remove admin-push-button" type="button" disabled={isWorking} onClick={handleDeactivate}>
          {isWorking ? "Desativando..." : "Desativar neste aparelho"}
        </button>
      )}
    </section>
  );
}

export default AdminPushNotifications;
