"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { Download, Share, CheckCircle2 } from "lucide-react";
type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type PwaState = {
  ready: boolean;
  installed: boolean;
  ios: boolean;
  prompt: InstallPrompt | null;
  clearPrompt: () => void;
};
const PwaContext = createContext<PwaState>({
  ready: false,
  installed: false,
  ios: false,
  prompt: null,
  clearPrompt: () => {},
});
export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  useEffect(() => {
    setReady(true);
    setIos(
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
    );
    const display = window.matchMedia("(display-mode: standalone)");
    const standalone = () =>
      setInstalled(
        display.matches ||
          (navigator as Navigator & { standalone?: boolean }).standalone ===
            true,
      );
    standalone();
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const didInstall = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", didInstall);
    display.addEventListener("change", standalone);
    if (
      process.env.NODE_ENV === "production" &&
      "serviceWorker" in navigator &&
      window.isSecureContext
    ) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {});
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", didInstall);
      display.removeEventListener("change", standalone);
    };
  }, []);
  return (
    <PwaContext.Provider
      value={{
        ready,
        installed,
        ios,
        prompt,
        clearPrompt: () => setPrompt(null),
      }}
    >
      {children}
    </PwaContext.Provider>
  );
}
export function InstallApp() {
  const { ready, installed, ios, prompt, clearPrompt } = useContext(PwaContext);
  const [showHelp, setShowHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!ready) return null;
  async function install() {
    if (!prompt) {
      setShowHelp((v) => !v);
      return;
    }
    setBusy(true);
    try {
      await prompt.prompt();
      await prompt.userChoice;
      clearPrompt();
    } catch {
      setShowHelp(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="install-panel" aria-label="Instalar Amazonitos">
      {installed ? (
        <p className="install-status">
          <CheckCircle2 size={18} />
          Você está usando o aplicativo instalado.
        </p>
      ) : (
        <>
          <button
            className="install-button"
            type="button"
            disabled={busy}
            onClick={install}
            aria-expanded={showHelp}
          >
            <Download size={19} />
            {busy ? "Abrindo instalação..." : "Instalar aplicativo"}
          </button>
          {showHelp && (
            <div className="install-help" role="status">
              {ios ? (
                <>
                  <Share size={17} />
                  <p>
                    No Safari, toque em <strong>Compartilhar</strong> e depois
                    em <strong>Adicionar à Tela de Início</strong>. Se
                    necessário, abra este site no Safari.
                  </p>
                </>
              ) : (
                <p>
                  No menu do navegador, escolha{" "}
                  <strong>Instalar aplicativo</strong> ou{" "}
                  <strong>Adicionar à tela inicial</strong>. Se essa opção não
                  aparecer, abra este site no Chrome ou Edge atualizado.
                </p>
              )}
            </div>
          )}
          <small>Acesso rápido pela tela inicial do celular.</small>
        </>
      )}
    </section>
  );
}
