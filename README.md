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
boards : `⌘L` charge la page de login avec un retour sur le board courant. La
session vit dans le profil de l'app, **indépendante de Safari et de Chrome** —
être connecté dans son navigateur n'y change rien, il faut se connecter ici.
**Identifiant + mot de passe** (+ TOTP) : c'est la voie sûre, et l'app le rappelle
d'un bandeau en arrivant sur la page de login.

« Continue with Google » ne peut pas aboutir : Google refuse l'OAuth depuis une
app embarquée et répond *« Ce navigateur ou cette application ne sont peut-être
pas sécurisés »*. Ce contrôle protège ton mot de passe Google d'une app qui
s'interposerait — le franchir demanderait de maquiller le client, ce que ce
dépôt ne fait pas. Le sort de « Continue with Apple » n'est pas vérifié.

Les passkeys ne fonctionnent pas non plus dans un webview.

L'app se présente à GitHub avec un user-agent Chrome standard : les jetons
`Boardwall/…` et `Electron/…` sont retirés d'`app.userAgentFallback`, pour ne pas
avoir à deviner ce qu'un site fait d'un client qu'il ne reconnaît pas.

## Ce qui est autorisé

`src/allowlist.js` est la seule source de vérité. Sur `github.com`, en HTTPS :

| Motif | Exemple |
|---|---|
| board d'orga, ses vues, panneaux et insights | `/orgs/<orga>/projects/12/views/1?pane=issue` |
| liste des projects d'une orga | `/orgs/<orga>/projects` |
| board perso | `/users/<login>/projects/3` |
| étapes d'authentification | `/login`, `/session`, `/sessions/two-factor`, `/orgs/<orga>/sso` |
| login social, le temps de l'aller-retour | `accounts.google.com`, `appleid.apple.com` |

Tout le reste est bloqué — `github.com/` compris.

Les deux hôtes d'identité sont le **seul trou volontaire** du kiosque. Il reste
étroit : ils ne sont atteignables que depuis la page de login, et depuis leurs
pages tout autre hôte est bloqué — `mail.google.com`, `myaccount.google.com` et
`icloud.com` sont couverts par les tests.

Ils restent autorisés bien que le flux Google n'aboutisse pas : c'est ce qui
permet de lire le refus du fournisseur au lieu d'un renvoi silencieux vers le
navigateur, et de laisser sa chance à Apple, non vérifié.

> Une note sur la méthode. J'ai d'abord affirmé sans mesure que Google bloquait ce
> flux. Puis je l'ai « réfuté » en cliquant le bouton depuis une WebContentsView :
> Google servait sa page de connexion normale, donc le flux passait. Faux aussi —
> le contrôle de Google tombe **après** la saisie de l'e-mail, et ma sonde
> s'arrêtait avant. « La page s'affiche » ne prouve pas « la connexion aboutit ».
> Un test qui ne va pas jusqu'au bout du parcours ne réfute rien.

## Les trois barrages

Une SPA quitte sa page de trois façons distinctes, et une seule déclenche
l'événement auquel on pense d'abord.

| Voie de sortie | Handler | Réaction |
|---|---|---|
| navigation classique (`location.href`, clic) | `will-navigate` | refusée, URL ouverte dans le navigateur |
| redirection serveur (retour de login, 302) | `will-redirect` | refusée, retour au board |
| navigation Turbo (`history.pushState`) | `did-navigate-in-page` | `goBack()`, sinon retour au board |
| chargement échoué, ou vue restée vide | `did-fail-load` / `did-stop-loading` | retour au board |
| `target="_blank"` | `setWindowOpenHandler` | popup refusée ; board → même fenêtre, reste → navigateur |

Le troisième est celui qu'on oublie : **GitHub navigue en Turbo**, donc un clic sur
un lien interne ne déclenche pas `will-navigate` mais un `pushState`. Sans ce
barrage, l'app fuit sur la moitié des liens tout en ayant l'air verrouillée.
`npm test` rejoue ces voies contre un vrai board.

Toutes les récupérations sont **différées d'un tick** : appeler `loadURL()` depuis
l'intérieur d'un événement de navigation est fragile. Et `⌘R` ne recharge pas la
page courante, il **recharge l'URL du board** — si une vue se retrouve coincée
ailleurs, le raccourci qu'on tape par réflexe la ramène au lieu de recharger
l'endroit où elle est bloquée.

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
| `⌘L` | se connecter à GitHub, retour sur le board courant |
| `⌘R` | revenir au board actif |
| `⌘⇧R` | recharger la page courante |
| `⌘[` / `⌘]` | retour / suivant, dans l'allowlist |

## Limites connues

- **SAML/SSO** vers un IdP externe est bloqué par l'allowlist et s'ouvre dans le
  navigateur. À ajouter dans `src/allowlist.js` selon l'orga.
- **Signature ad-hoc** : l'app ne s'ouvrira pas telle quelle sur une autre machine
  (Gatekeeper). Il faut la construire localement, ou la signer et la notariser.
- **Apple Silicon uniquement** dans la config `electron-builder` fournie.
