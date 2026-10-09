let deferredInstallPrompt = null;
let appInstalledInSession = false;
const installAvailabilityListeners = new Set();

function isRunningStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function isIosDevice() {
  return (
    /iPad|iPhone|iPod/.test(window.navigator.userAgent) ||
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1)
  );
}

function notifyAvailabilityChanged() {
  installAvailabilityListeners.forEach((listener) => listener());
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    notifyAvailabilityChanged();
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    appInstalledInSession = true;
    notifyAvailabilityChanged();
  });
}

export function getPwaInstallState() {
  const isStandalone = isRunningStandalone();
  const isInstalled = isStandalone || appInstalledInSession;
  return {
    canPromptInstall: !isInstalled && deferredInstallPrompt !== null,
    showAndroidInstructions:
      !isInstalled && /Android/i.test(window.navigator.userAgent),
    showIosInstructions: !isInstalled && isIosDevice(),
    isInstalled,
    isStandalone,
  };
}

export function subscribeToPwaInstallState(listener) {
  installAvailabilityListeners.add(listener);
  return () => installAvailabilityListeners.delete(listener);
}

export async function promptPwaInstall() {
  if (!deferredInstallPrompt || isRunningStandalone()) return false;

  const installPrompt = deferredInstallPrompt;
  deferredInstallPrompt = null;
  await installPrompt.prompt();
  const { outcome } = await installPrompt.userChoice;
  notifyAvailabilityChanged();
  return outcome === "accepted";
}
