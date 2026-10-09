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
    installState.isStandalone ||
    (!installState.canPromptInstall && !installState.showIosInstructions)
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
        <h2 id="admin-pwa-title">BarbershopStyle no celular</h2>
        {installState.canPromptInstall ? (
          <p>Instale o painel para abrir o Admin diretamente pela tela inicial.</p>
        ) : (
          <p>No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”.</p>
        )}
      </div>
      {installState.canPromptInstall && (
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
