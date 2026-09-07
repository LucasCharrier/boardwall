"use strict";

// Rejoue les évasions réelles contre un vrai board, à travers le guard de production
// (src/guard.js) — pas une copie de sa logique. `shell.openExternal` est neutralisé
// pour que la sonde n'ouvre pas de navigateur.
const { app, BaseWindow, WebContentsView, shell } = require("electron");

const opened = [];
shell.openExternal = (url) => {
  opened.push(url);
  return Promise.resolve();
};

const { guard } = require("../src/guard.js");

const HOME = process.env.KIOSK_PROBE_URL ?? "https://github.com/orgs/rust-lang/projects/22";
const ISSUE = "https://github.com/rust-lang/rust/issues/1";
const OUTSIDE = "/notifications";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];

function check(label, condition, detail) {
  results.push({ label, ok: Boolean(condition), detail });
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
}

app.whenReady().then(async () => {
  const win = new BaseWindow({ width: 1280, height: 820, show: false });
  const view = new WebContentsView({ webPreferences: { contextIsolation: true, sandbox: true } });
  win.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 1280, height: 820 });
  guard(view.webContents, () => HOME);

  await view.webContents.loadURL(HOME);
  check("le board charge", view.webContents.getURL() === HOME, view.webContents.getURL());
  check("le titre est celui du board", /\S/.test(win.getTitle() || view.webContents.getTitle()), view.webContents.getTitle());

  await view.webContents.executeJavaScript(`location.href=${JSON.stringify(ISSUE)}`).catch(() => {});
  await wait(1500);
  check("navigation vers une issue bloquée", view.webContents.getURL() === HOME, view.webContents.getURL());
  check("l'issue part vers le navigateur", opened.includes(ISSUE), opened.at(-1) ?? "rien");

  await view.webContents.executeJavaScript(`history.pushState({}, "", ${JSON.stringify(OUTSIDE)})`).catch(() => {});
  await wait(1500);
  check("pushState hors Projects ramené au board", view.webContents.getURL() === HOME, view.webContents.getURL());

  const inside = `${HOME}/views/1`;
  await view.webContents.executeJavaScript(`history.pushState({}, "", ${JSON.stringify(inside)})`).catch(() => {});
  await wait(900);
  check("pushState dans le board laissé tranquille", view.webContents.getURL() === inside, view.webContents.getURL());

  const failures = results.filter((result) => !result.ok).length;
  console.log(failures ? `\n${failures} échec(s) sur ${results.length}` : `\n${results.length}/${results.length} OK`);
  app.exit(failures ? 1 : 0);
});
