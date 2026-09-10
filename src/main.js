"use strict";

const { app, BaseWindow, WebContentsView, Menu, ipcMain, clipboard, dialog, shell, session, nativeTheme } = require("electron");
const path = require("node:path");
const { Store, normalizeUrl } = require("./boards.js");
const { guard } = require("./guard.js");
const { attachBoardMenu, attachEditMenu } = require("./context-menu.js");

app.setName("Boardwall");
app.userAgentFallback = app.userAgentFallback
  .replace(new RegExp(`\\s+${app.getName()}/\\S+`), "")
  .replace(/\s+Electron\/\S+/, "");

const SIDEBAR_WIDTH = 76;
const PRELOAD = path.join(__dirname, "preload.js");
const shellFile = (file) => path.join(__dirname, "shell", file);

let win = null;
let sidebar = null;
let modal = null;
let store = null;
const views = new Map();

const shellPrefs = { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true, devTools: false };
const boardPrefs = { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, devTools: false };

function surfaces() {
  const dark = nativeTheme.shouldUseDarkColors;
  return { window: dark ? "#0d1117" : "#ffffff", rail: dark ? "#16181d" : "#f0f2f5" };
}

// Repeindre le fond ne touche pas au thème : écrire `nativeTheme.themeSource`
// émet `updated`, même quand la valeur ne change pas. Faire les deux dans la
// même fonction et la brancher sur `updated` la ferait se rappeler elle-même —
// mesuré à 120 000 tours par seconde, soit un cœur entier brûlé en continu.
function paintSurfaces() {
  const { window: windowColor, rail } = surfaces();
  win?.setBackgroundColor(windowColor);
  sidebar?.setBackgroundColor(rail);
  for (const view of views.values()) view.setBackgroundColor(windowColor);
}

function applyTheme() {
  nativeTheme.themeSource = store.data.theme;
  paintSurfaces();
}

function activeView() {
  return views.get(store.data.activeId) ?? null;
}

function setVisible(view, visible) {
  if (typeof view.setVisible === "function") view.setVisible(visible);
  else if (!visible) view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
}

function layout() {
  if (!win) return;
  const { width, height } = win.getContentBounds();
  sidebar.setBounds({ x: 0, y: 0, width: SIDEBAR_WIDTH, height });
  const area = { x: SIDEBAR_WIDTH, y: 0, width: Math.max(0, width - SIDEBAR_WIDTH), height };
  for (const [id, view] of views) {
    view.setBounds(area);
    setVisible(view, id === store.data.activeId);
  }
  modal?.setBounds({ x: 0, y: 0, width, height });
}

function pushState() {
  sidebar?.webContents.send("state:changed", store.publicState());
}

function syncTitle() {
  const board = store.get(store.data.activeId);
  win?.setTitle(board ? board.name || board.url : "Boardwall");
}

// Le shell est local : aucune navigation ne doit pouvoir l'emmener ailleurs.
function lockShell(contents) {
  attachEditMenu(contents);
  contents.on("will-navigate", (event) => event.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
}

function createBoardView(board) {
  const view = new WebContentsView({ webPreferences: boardPrefs });
  view.setBackgroundColor(surfaces().window);
  guard(view.webContents, () => store.get(board.id)?.url ?? board.url);
  attachBoardMenu(view.webContents, () => store.get(board.id)?.url ?? board.url);

  view.webContents.on("page-title-updated", (_event, title) => {
    const current = store.get(board.id);
    if (!current || current.name) return;
    const cleaned = title.replace(/\s*·\s*GitHub\s*$/i, "").trim();
    if (!cleaned || /^github$/i.test(cleaned)) return;
    store.rename(board.id, cleaned);
    pushState();
    syncTitle();
  });

  views.set(board.id, view);
  win.contentView.addChildView(view);
  view.webContents.loadURL(board.url);
  raiseModal();
  return view;
}

function removeBoard(id) {
  const board = store.get(id);
  if (!board) return;
  const { response } = { response: dialog.showMessageBoxSync(win, {
    type: "warning",
    buttons: ["Annuler", "Retirer"],
    defaultId: 0,
    cancelId: 0,
    message: `Retirer « ${board.name || board.url} » ?`,
    detail: "Le board reste intact sur GitHub — seule cette vignette disparaît.",
  }) };
  if (response !== 1) return;

  const view = views.get(id);
  if (view) {
    win.contentView.removeChildView(view);
    view.webContents.close();
    views.delete(id);
  }
  store.remove(id);
  layout();
  pushState();
  syncTitle();
  if (store.data.boards.length === 0) openModal("add");
}

// Fermer une BaseWindow ne détruit pas les WebContentsView qu'elle portait :
// chaque board laisserait son process de rendu derrière lui, et l'app resterait
// vivante — invisible, sans fenêtre — jusqu'au kill. On les ferme donc à la
// main, à la fermeture de la fenêtre comme avant de quitter.
// Une vue déjà fermée n'a plus de `webContents` du tout : le raccourci
// `view.webContents.isDestroyed()` lèverait une TypeError au second passage
// (fermeture de la fenêtre, puis `before-quit`).
function closeContents(view) {
  const contents = view?.webContents;
  if (contents && !contents.isDestroyed()) contents.close();
}

function teardown() {
  for (const view of views.values()) closeContents(view);
  views.clear();
  closeContents(sidebar);
  closeContents(modal);
  sidebar = null;
  modal = null;
}

function raiseModal() {
  if (!modal) return;
  win.contentView.removeChildView(modal);
  win.contentView.addChildView(modal);
}

function openModal(page = "add") {
  if (modal) closeModal();
  modal = new WebContentsView({ webPreferences: shellPrefs });
  modal.setBackgroundColor("#00000000");
  lockShell(modal.webContents);
  modal.webContents.loadFile(shellFile(`${page}.html`));
  win.contentView.addChildView(modal);
  layout();
  modal.webContents.focus();
}

function closeModal() {
  if (!modal) return;
  win.contentView.removeChildView(modal);
  modal.webContents.close();
  modal = null;
  activeView()?.webContents.focus();
}

function selectBoard(id) {
  store.activate(id);
  layout();
  pushState();
  syncTitle();
  activeView()?.webContents.focus();
}

function signIn() {
  const board = store.get(store.data.activeId);
  const view = activeView();
  if (!board || !view) return;
  view.webContents.loadURL(`https://github.com/login?return_to=${encodeURIComponent(board.url)}`);
}

function cycleBoard(delta) {
  const { boards, activeId } = store.data;
  if (boards.length < 2) return;
  const index = boards.findIndex((board) => board.id === activeId);
  selectBoard(boards[(index + delta + boards.length) % boards.length].id);
}

function buildMenu() {
  const jumps = Array.from({ length: 9 }, (_value, index) => ({
    label: `Board ${index + 1}`,
    accelerator: `Cmd+${index + 1}`,
    click: () => {
      const board = store.data.boards[index];
      if (board) selectBoard(board.id);
    },
  }));

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: "appMenu" },
      {
        label: "Boards",
        submenu: [
          { label: "Ajouter un board…", accelerator: "Cmd+N", click: () => openModal("add") },
          { label: "Réglages…", accelerator: "Cmd+,", click: () => openModal("settings") },
          { type: "separator" },
          { label: "Se connecter à GitHub…", accelerator: "Cmd+L", click: signIn },
          { type: "separator" },
          { label: "Board suivant", accelerator: "Ctrl+Tab", click: () => cycleBoard(1) },
          { label: "Board précédent", accelerator: "Ctrl+Shift+Tab", click: () => cycleBoard(-1) },
          { type: "separator" },
          ...jumps,
          { type: "separator" },
          {
            label: "Revenir au board",
            accelerator: "Cmd+R",
            click: () => {
              const board = store.get(store.data.activeId);
              if (board) activeView()?.webContents.loadURL(board.url);
            },
          },
          { label: "Recharger la page", accelerator: "Cmd+Shift+R", click: () => activeView()?.webContents.reload() },
          {
            label: "Retour",
            accelerator: "Cmd+[",
            click: () => activeView()?.webContents.navigationHistory.goBack(),
          },
          {
            label: "Suivant",
            accelerator: "Cmd+]",
            click: () => activeView()?.webContents.navigationHistory.goForward(),
          },
        ],
      },
      { role: "editMenu" },
      {
        label: "Affichage",
        submenu: [
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { type: "separator" },
          { role: "togglefullscreen" },
        ],
      },
      { role: "windowMenu" },
    ]),
  );
}

function registerIpc() {
  ipcMain.handle("state:get", () => store.publicState());
  ipcMain.on("board:select", (_event, id) => selectBoard(id));
  ipcMain.on("board:reload", (_event, id) => views.get(id)?.webContents.reload());
  ipcMain.on("modal:open", (_event, page) => openModal(page));
  ipcMain.on("modal:close", closeModal);

  ipcMain.handle("theme:get", () => store.data.theme);
  ipcMain.on("theme:set", (_event, theme) => {
    store.setTheme(theme);
    applyTheme();
    pushState();
  });

  ipcMain.handle("modal:init", () => ({
    suggestedUrl: normalizeUrl(clipboard.readText()) ?? "",
    isFirstRun: store.data.boards.length === 0,
  }));

  ipcMain.handle("board:add", (_event, { url, name }) => {
    const result = store.add(url, name);
    if (result.error) {
      if (result.id) selectBoard(result.id);
      return { error: result.error };
    }
    createBoardView(result.board);
    layout();
    pushState();
    syncTitle();
    return { ok: true };
  });

  ipcMain.on("board:menu", (_event, id) => {
    const board = store.get(id);
    if (!board) return;
    Menu.buildFromTemplate([
      { label: board.name || board.url, enabled: false },
      { type: "separator" },
      { label: "Recharger", click: () => views.get(id)?.webContents.reload() },
      { label: "Monter", click: () => { store.move(id, -1); pushState(); } },
      { label: "Descendre", click: () => { store.move(id, 1); pushState(); } },
      { type: "separator" },
      { label: "Retirer ce board…", click: () => removeBoard(id) },
    ]).popup({ window: win });
  });
}

function createWindow() {
  win = new BaseWindow({
    width: 1440,
    height: 900,
    ...(store.data.bounds ?? {}),
    minWidth: 900,
    minHeight: 600,
    title: "Boardwall",
    titleBarStyle: "hiddenInset",
    backgroundColor: surfaces().window,
  });

  sidebar = new WebContentsView({ webPreferences: shellPrefs });
  sidebar.setBackgroundColor(surfaces().rail);
  lockShell(sidebar.webContents);
  sidebar.webContents.loadFile(shellFile("sidebar.html"));
  win.contentView.addChildView(sidebar);

  for (const board of store.data.boards) createBoardView(board);

  const remember = () => {
    if (win && !win.isDestroyed() && !win.isFullScreen()) {
      store.data.bounds = win.getBounds();
      store.save();
    }
  };
  win.on("resize", () => { layout(); remember(); });
  win.on("move", remember);
  win.on("closed", () => { teardown(); win = null; });

  layout();
  applyTheme();
  syncTitle();
  if (store.data.boards.length === 0) openModal("add");
}

if (!app.requestSingleInstanceLock()) app.quit();

app.on("second-instance", () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(() => {
  store = new Store(path.join(app.getPath("userData"), "config.json"));
  nativeTheme.themeSource = store.data.theme;
  nativeTheme.on("updated", paintSurfaces);
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  buildMenu();
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (!win) createWindow();
  });
});

app.on("before-quit", teardown);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
