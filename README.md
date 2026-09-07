# Boardwall

> Le mur de tes GitHub Projects — et le mur qui t'empêche d'en sortir.

Une app macOS à la Ferdium, mais pour les GitHub Projects : une rail latérale, un
board par vignette, tous chargés en parallèle — et **aucune sortie possible**. Un
lien vers une issue, un dépôt, les réglages ou les notifications part dans le
navigateur système ; la fenêtre, elle, reste sur le board.

GitHub ne propose ni mode kiosque ni embed : `github.com` répond
`x-frame-options: deny`, donc un `<iframe>` est impossible. Le seul angle restant
est une fenêtre native qui charge la page en top-level et filtre la navigation.

## Usage

```bash
npm install
npm start                    # lancer en dev
npm test                     # allowlist (hors ligne) + évasions réelles contre un board public
npm run icon                 # régénère build/icon.png, rendu par Electron lui-même
npm run dist                 # dist/mac-arm64/Boardwall.app, signée ad-hoc
```

Au premier lancement, l'app demande l'adresse d'un board. Ensuite : `⌘N` pour en
ajouter un, `⌘,` pour les réglages, clic droit sur une vignette pour la recharger,
la déplacer ou la retirer.

La connexion à GitHub se fait **dans la fenêtre**, une seule fois pour tous les
boards : la session est persistée dans le profil de l'app, indépendante de
Safari et de Chrome. Les passkeys ne fonctionnent pas dans un webview Electron —
mot de passe + TOTP.

## Ce qui est autorisé

`src/allowlist.js` est la seule source de vérité. Sur `github.com`, en HTTPS :

| Motif | Exemple |
|---|---|
| board d'orga, ses vues, panneaux et insights | `/orgs/<orga>/projects/12/views/1?pane=issue` |
| liste des projects d'une orga | `/orgs/<orga>/projects` |
| board perso | `/users/<login>/projects/3` |
| étapes d'authentification | `/login`, `/session`, `/sessions/two-factor`, `/orgs/<orga>/sso` |

Tout le reste est bloqué — `github.com/` compris.

## Les trois barrages

Une SPA quitte sa page de trois façons distinctes, et une seule déclenche
l'événement auquel on pense d'abord.

| Voie de sortie | Handler | Réaction |
|---|---|---|
| navigation classique (`location.href`, clic) | `will-navigate` | refusée, URL ouverte dans le navigateur |
| redirection serveur (retour de login, 302) | `will-redirect` | refusée, retour au board |
| navigation Turbo (`history.pushState`) | `did-navigate-in-page` | `goBack()`, sinon retour au board |
| `target="_blank"` | `setWindowOpenHandler` | popup refusée ; board → même fenêtre, reste → navigateur |

Le troisième est celui qu'on oublie : **GitHub navigue en Turbo**, donc un clic sur
un lien interne ne déclenche pas `will-navigate` mais un `pushState`. Sans ce
barrage, l'app fuit sur la moitié des liens tout en ayant l'air verrouillée.
`npm test` rejoue les quatre voies contre un vrai board.

## Architecture

```
BaseWindow
 ├─ WebContentsView  shell/sidebar.html   rail 76 px, toujours visible
 ├─ WebContentsView  board A ─┐
 ├─ WebContentsView  board B  ├─ un par board, gardés vivants, un seul visible
 ├─ WebContentsView  board C ─┘
 └─ WebContentsView  shell/{add,settings}.html   ajouté au-dessus à la demande
```

Chaque board est une `WebContentsView` distincte qui **continue de tourner quand
elle n'est pas affichée** : `setVisible(false)` la masque sans la décharger, donc
changer de board est instantané et aucun board n'est jamais périmé au retour.

Le nom d'un board est repris de son `<title>` au premier chargement, et son avatar
est celui de l'orga (`github.com/<orga>.png`), avec repli sur les initiales.

L'app prend un `requestSingleInstanceLock()` : deux processus sur un même
`config.json` s'écrasent mutuellement — c'est arrivé pendant le développement, et
la liste de boards s'était silencieusement réduite à un seul.

## Réglages

`⌘,` → thème **Clair / Sombre / Système**. Il pilote `nativeTheme.themeSource`,
donc à la fois l'habillage de la fenêtre et le `prefers-color-scheme` vu par les
boards. Réserve : GitHub ne suit ce signal que si le thème du compte est sur
« Sync with system » ; sinon GitHub garde le sien et seule la fenêtre change.

Tout est persisté dans `~/Library/Application Support/Boardwall/config.json` —
`boards`, `activeId`, `theme`, `bounds`. Une entrée dont l'URL sort de l'allowlist
est ignorée au chargement.

## Raccourcis

| | |
|---|---|
| `⌘N` | ajouter un board |
| `⌘,` | réglages |
| `⌘1`…`⌘9` | aller au n-ième board |
| `⌃Tab` / `⌃⇧Tab` | board suivant / précédent |
| `⌘R` | recharger le board actif |
| `⌘[` / `⌘]` | retour / suivant, dans l'allowlist |

## Limites connues

- **SAML/SSO** vers un IdP externe est bloqué par l'allowlist et s'ouvre dans le
  navigateur. À ajouter dans `src/allowlist.js` selon l'orga.
- **Signature ad-hoc** : l'app ne s'ouvrira pas telle quelle sur une autre machine
  (Gatekeeper). Il faut la construire localement, ou la signer et la notariser.
- **Apple Silicon uniquement** dans la config `electron-builder` fournie.
