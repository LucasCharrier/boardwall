"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("kiosk", {
  getState: () => ipcRenderer.invoke("state:get"),
  onState: (callback) => ipcRenderer.on("state:changed", (_event, state) => callback(state)),
  select: (id) => ipcRenderer.send("board:select", id),
  reload: (id) => ipcRenderer.send("board:reload", id),
  contextMenu: (id) => ipcRenderer.send("board:menu", id),
  add: (url, name) => ipcRenderer.invoke("board:add", { url, name }),
  openAdd: () => ipcRenderer.send("modal:open", "add"),
  openSettings: () => ipcRenderer.send("modal:open", "settings"),
  getTheme: () => ipcRenderer.invoke("theme:get"),
  setTheme: (theme) => ipcRenderer.send("theme:set", theme),
  modalInit: () => ipcRenderer.invoke("modal:init"),
  closeModal: () => ipcRenderer.send("modal:close"),
});
