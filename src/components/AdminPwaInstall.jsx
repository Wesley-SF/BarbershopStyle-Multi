import { useEffect, useState } from "react";
import {
  getPwaInstallState,
  promptPwaInstall,
  subscribeToPwaInstallState,
} from "../utils/pwaInstall";

function AdminPwaInstall() {
  const [installState, setInstallState] = useState(getPwaInstallState);
  const [isPrompting, setIsPrompting] = useState(false);

  useEffect(
    () => subscribeToPwaInstallState(() => setInstallState(getPwaInstallState())),
    [],
  );

  if (
    !installState.isInstalled &&
    !installState.canPromptInstall &&
    !installState.showIosInstructions
  ) {
    return null;
  }

  const handleInstall = async () => {
    setIsPrompting(true);
    await promptPwaInstall();
    setInstallState(getPwaInstallState());
    setIsPrompting(false);
  };

  return (
    <section className="admin-pwa-install" aria-labelledby="admin-pwa-title">
      <div>
        <p className="eyebrow">Aplicativo</p>
        <h2 id="admin-pwa-title">BarbershopStyle Admin</h2>
        {installState.isInstalled && (
          <p className="admin-pwa-installed" role="status">
            ✓ BarbershopStyle está instalado neste aparelho
          </p>
        )}
        {!installState.isInstalled && installState.canPromptInstall && (
          <p><strong>Android/Chrome:</strong> instale o painel para abrir o Admin diretamente.</p>
        )}
        {!installState.isInstalled && installState.showIosInstructions && (
          <p>No Safari, toque em Compartilhar → Adicionar à Tela de Início.</p>
        )}
      </div>
      {!installState.isInstalled && installState.canPromptInstall && (
        <button
          className="schedule-block-submit admin-pwa-install-button"
          type="button"
          disabled={isPrompting}
          onClick={handleInstall}
        >
          {isPrompting ? "Abrindo instalação..." : "Instalar aplicativo"}
        </button>
      )}
    </section>
  );
}

export default AdminPwaInstall;
