"use strict";

const HOSTS = new Set(["github.com", "www.github.com"]);

const BOARD_PATHS = [
  /^\/orgs\/[^/]+\/projects(\/\d+(\/.*)?)?$/,
  /^\/users\/[^/]+\/projects(\/\d+(\/.*)?)?$/,
];

const AUTH_PATHS = [
  /^\/login(\/.*)?$/,
  /^\/logout$/,
  /^\/session$/,
  /^\/sessions(\/.*)?$/,
  /^\/orgs\/[^/]+\/sso(\/.*)?$/,
  /^\/authentication(\/.*)?$/,
];

// GitHub propose « Continue with Google / Apple ». Ces fournisseurs refusent par
// politique l'OAuth depuis un webview embarqué, donc la ronde ne peut pas aboutir
// ici — autant le dire au lieu de renvoyer vers un navigateur d'où rien ne revient.
const IDENTITY_PROVIDERS = new Map([
  ["accounts.google.com", "Google"],
  ["accounts.youtube.com", "Google"],
  ["appleid.apple.com", "Apple"],
]);

function identityProvider(rawUrl) {
  try {
    return IDENTITY_PROVIDERS.get(new URL(rawUrl).hostname) ?? null;
  } catch {
    return null;
  }
}

function classify(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return "blocked";
  }
  if (url.protocol !== "https:" || !HOSTS.has(url.hostname)) return "blocked";

  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (BOARD_PATHS.some((pattern) => pattern.test(path))) return "board";
  if (AUTH_PATHS.some((pattern) => pattern.test(path))) return "auth";
  return "blocked";
}

function isAllowed(rawUrl) {
  return classify(rawUrl) !== "blocked";
}

module.exports = { classify, isAllowed, identityProvider };
