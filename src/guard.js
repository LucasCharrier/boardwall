"use strict";

const { shell } = require("electron");
const { classify } = require("./allowlist.js");

function toast(contents, text) {
  contents
    .executeJavaScript(
      `(() => {
        const id = "kiosk-toast";
        document.getElementById(id)?.remove();
        const el = document.createElement("div");
        el.id = id;
        el.textContent = ${JSON.stringify(text)};
        Object.assign(el.style, {
          position: "fixed", insetInline: "0", bottom: "22px", zIndex: "2147483647",
          margin: "0 auto", width: "fit-content", maxWidth: "80vw",
          padding: "10px 16px", borderRadius: "8px",
          font: "13px/1.4 -apple-system, BlinkMacSystemFont, sans-serif",
          color: "#fff", background: "rgba(28,30,33,.94)",
          boxShadow: "0 6px 24px rgba(0,0,0,.35)", pointerEvents: "none",
        });
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 3500);
      })()`,
    )
    .catch(() => {});
}

function openOutside(contents, url) {
  try {
    if (/^https?:$/.test(new URL(url).protocol)) {
      shell.openExternal(url);
      toast(contents, "Hors des Projects — ouvert dans le navigateur.");
    }
  } catch {}
}

// Un échec de chargement fait sonner plusieurs événements à la fois
// (`did-fail-load` puis `did-stop-loading`), et le retour au board qu'ils
// déclenchent échoue à son tour tant que le réseau est coupé ou que GitHub
// traîne. Sans garde-fou, la récupération se rappelle elle-même une vingtaine
// de fois par seconde et par board : le process principal sature et le réseau
// disparaît sous les requêtes. D'où une seule récupération en vol à la fois,
// et des tentatives de plus en plus espacées tant que rien n'aboutit.
const RETRY_DELAYS = [0, 1000, 3000, 8000, 20000, 60000];

// Une SPA comme GitHub Projects peut quitter sa page de trois façons distinctes,
// et une seule déclenche `will-navigate` : les liens internes passent par Turbo,
// donc par `pushState`, que seul `did-navigate-in-page` voit passer.
function guard(contents, homeUrl) {
  const home = typeof homeUrl === "function" ? homeUrl : () => homeUrl;

  let pending = null;
  let attempt = 0;
  let failed = false;

  // Naviguer depuis l'intérieur d'un événement de navigation est fragile : on
  // repousse toujours la récupération au tick suivant.
  const recover = () => {
    if (pending || contents.isDestroyed()) return;
    const delay = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
    attempt += 1;
    pending = setTimeout(() => {
      pending = null;
      if (contents.isDestroyed()) return;
      contents.loadURL(home()).catch(() => {});
    }, delay);
  };

  // Une page qui s'affiche pour de bon efface l'ardoise : la prochaine
  // récupération repart immédiate. Attention, `did-finish-load` sonne aussi
  // pour la page d'erreur de Chromium, juste après `did-fail-load` — s'y fier
  // seul remettrait le compteur à zéro à chaque échec, et l'espacement des
  // tentatives ne servirait plus à rien.
  contents.on("did-start-loading", () => { failed = false; });
  contents.on("did-finish-load", () => { if (!failed) attempt = 0; });

  contents.on("destroyed", () => {
    clearTimeout(pending);
    pending = null;
  });

  contents.setWindowOpenHandler(({ url }) => {
    if (classify(url) === "blocked") openOutside(contents, url);
    else contents.loadURL(url);
    return { action: "deny" };
  });

  contents.on("will-navigate", (event, url) => {
    if (classify(url) === "blocked") {
      event.preventDefault();
      openOutside(contents, url);
    }
  });

  contents.on("will-redirect", (event, url) => {
    if (classify(url) === "blocked") {
      event.preventDefault();
      recover();
    }
  });

  // Google refuse l'OAuth depuis une app embarquée (disallowed_useragent) : « Ce
  // navigateur ou cette application ne sont peut-être pas sécurisés ». Le contrôle
  // tombe après la saisie de l'e-mail, pas sur la page d'identification — d'où
  // l'intérêt de prévenir avant le clic plutôt qu'après.
  contents.on("did-navigate", (_event, url) => {
    if (/^https:\/\/github\.com\/login(\?|$)/.test(url)) {
      toast(contents, "Identifiant + mot de passe : Google refuse la connexion depuis une app embarquée.");
    }
  });

  contents.on("did-navigate-in-page", (_event, url, isMainFrame) => {
    if (!isMainFrame || classify(url) !== "blocked") return;
    toast(contents, "Hors des Projects — retour au board.");
    if (contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
    else recover();
  });

  // Filet de sécurité : quoi qu'il arrive, une vue ne reste jamais vide. Un
  // ERR_ABORTED (-3) est le cas normal d'une navigation qu'on vient de bloquer.
  contents.on("did-fail-load", (_event, errorCode, _description, _url, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    failed = true;
    recover();
  });

  contents.on("did-stop-loading", () => {
    const url = contents.getURL();
    if (!url || url === "about:blank") recover();
  });
}

module.exports = { guard, toast };
