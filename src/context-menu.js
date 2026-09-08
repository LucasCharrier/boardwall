"use strict";

// Electron ne fournit aucun menu contextuel : sans ça, un clic droit sur une page
// ne fait rien du tout. Les actions visent explicitement le `contents` cliqué
// plutôt que d'utiliser les `role:`, qui s'appliquent à la vue focalisée — et
// avec une vue par board, ce n'est pas forcément la même.
const { Menu, clipboard, shell } = require("electron");
const { classify } = require("./allowlist.js");

function editItems(contents, { editFlags, isEditable }) {
  const items = [];
  if (isEditable) {
    items.push(
      { label: "Annuler", enabled: editFlags.canUndo, click: () => contents.undo() },
      { label: "Rétablir", enabled: editFlags.canRedo, click: () => contents.redo() },
      { type: "separator" },
      { label: "Couper", enabled: editFlags.canCut, click: () => contents.cut() },
    );
  }
  items.push({ label: "Copier", enabled: editFlags.canCopy, click: () => contents.copy() });
  if (isEditable) {
    items.push({ label: "Coller", enabled: editFlags.canPaste, click: () => contents.paste() });
  }
  items.push({ label: "Tout sélectionner", enabled: editFlags.canSelectAll, click: () => contents.selectAll() });
  return items;
}

function linkItems(contents, { linkURL }) {
  if (!linkURL) return [];
  const inside = classify(linkURL) !== "blocked";
  return [
    inside
      ? { label: "Ouvrir dans ce board", click: () => contents.loadURL(linkURL) }
      : { label: "Ouvrir dans le navigateur", click: () => shell.openExternal(linkURL) },
    { label: "Copier l'adresse du lien", click: () => clipboard.writeText(linkURL) },
    { type: "separator" },
  ];
}

function imageItems({ mediaType, srcURL }) {
  if (mediaType !== "image" || !srcURL) return [];
  return [{ label: "Copier l'adresse de l'image", click: () => clipboard.writeText(srcURL) }, { type: "separator" }];
}

function attachBoardMenu(contents, homeUrl) {
  const home = typeof homeUrl === "function" ? homeUrl : () => homeUrl;

  contents.on("context-menu", (_event, params) => {
    const template = [
      ...linkItems(contents, params),
      ...imageItems(params),
      ...editItems(contents, params),
      { type: "separator" },
      {
        label: "Retour",
        enabled: contents.navigationHistory.canGoBack(),
        click: () => contents.navigationHistory.goBack(),
      },
      { label: "Recharger la page", click: () => contents.reload() },
      { label: "Revenir au board", click: () => contents.loadURL(home()) },
    ];
    Menu.buildFromTemplate(template).popup();
  });
}

function attachEditMenu(contents) {
  contents.on("context-menu", (_event, params) => {
    if (!params.isEditable && !params.editFlags.canCopy) return;
    Menu.buildFromTemplate(editItems(contents, params)).popup();
  });
}

module.exports = { attachBoardMenu, attachEditMenu };
