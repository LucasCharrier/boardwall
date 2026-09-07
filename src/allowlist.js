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

// « Continue with Google / Apple » sort de github.com le temps d'un aller-retour :
//   /login -> /sessions/social/<idp>/initiate -> <idp> -> /sessions/social/<idp>/callback
// Ces deux hôtes sont donc autorisés en entier. C'est le seul trou volontaire du
// kiosque, et il est étroit : depuis ces pages, tout autre hôte reste bloqué —
// y compris le reste de Google.
const AUTH_HOSTS = new Set(["accounts.google.com", "appleid.apple.com"]);

function classify(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return "blocked";
  }
  if (url.protocol !== "https:") return "blocked";
  if (AUTH_HOSTS.has(url.hostname)) return "auth";
  if (!HOSTS.has(url.hostname)) return "blocked";

  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (BOARD_PATHS.some((pattern) => pattern.test(path))) return "board";
  if (AUTH_PATHS.some((pattern) => pattern.test(path))) return "auth";
  return "blocked";
}

function isAllowed(rawUrl) {
  return classify(rawUrl) !== "blocked";
}

module.exports = { classify, isAllowed };
