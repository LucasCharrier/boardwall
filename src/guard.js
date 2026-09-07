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

// Une SPA comme GitHub Projects peut quitter sa page de trois façons distinctes,
// et une seule déclenche `will-navigate` : les liens internes passent par Turbo,
// donc par `pushState`, que seul `did-navigate-in-page` voit passer.
function guard(contents, homeUrl) {
  const home = typeof homeUrl === "function" ? homeUrl : () => homeUrl;

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
      contents.loadURL(home());
    }
  });

  contents.on("did-navigate-in-page", (_event, url, isMainFrame) => {
    if (!isMainFrame || classify(url) !== "blocked") return;
    toast(contents, "Hors des Projects — retour au board.");
    if (contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
    else contents.loadURL(home());
  });
}

module.exports = { guard, toast };
