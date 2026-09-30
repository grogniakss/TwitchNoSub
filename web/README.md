# TwitchNoSub Web

Site auto-hébergé : collez le lien d'une VOD Twitch (même réservée aux abonnés) et récupérez
une playlist `m3u8` à ouvrir dans VLC, mpv ou n'importe quel lecteur HLS.

Même méthode que l'extension (`../src/patch_amazonworker.js`), exécutée côté serveur. Le serveur ne
génère que des playlists texte : la vidéo est téléchargée par le lecteur **directement depuis le CDN
Twitch**, sans consommer la bande passante du serveur.

Aucune dépendance npm, Node.js 20+ suffit.

## Lancer en local (Windows)

Double-cliquez sur `start-windows.cmd`, ou :

```bash
cd web
npm start
```

Puis ouvrez <http://localhost:3000>. Le port se change avec la variable `PORT`.

### Bouton « Ouvrir dans VLC » sur Windows

VLC n'enregistre pas les liens `vlc://` sur Windows. Lancez une fois
`tools\windows\install-vlc-protocol.cmd` (pas besoin d'être administrateur).
Pour annuler : `tools\windows\uninstall-vlc-protocol.cmd`.

Sur Android / iOS, l'app VLC gère `vlc://` nativement.

## Déployer sur un VPS (Docker)

```bash
git clone https://github.com/grogniakss/TwitchNoSub.git
cd TwitchNoSub/web
docker compose up -d --build
```

Derrière un reverse proxy (Nginx, Caddy…), définissez `PUBLIC_URL` dans `docker-compose.yml`
(ex. `https://vod.mondomaine.fr`) ou transmettez les en-têtes `X-Forwarded-Proto` / `X-Forwarded-Host`
pour que les liens générés pointent vers la bonne adresse.

Le site n'a pas d'authentification : toute personne qui connaît l'adresse peut l'utiliser.

## API

| Route | Description |
|---|---|
| `GET /api/resolve?input=<lien ou id>` | Infos de la VOD + qualités disponibles (JSON) |
| `GET /vod/<id>.m3u8` | Playlist « master » avec toutes les qualités |
| `GET /vod/<id>/<qualité>.m3u8` | Playlist d'une qualité (`chunked`, `1080p60`, `720p60`…) |

Ajoutez `?download=1` aux playlists pour les télécharger en fichier.

Exemple direct : `vlc http://localhost:3000/vod/2887271496.m3u8`

## Tests

```bash
npm test                          # tests unitaires
npm run check -- <lien ou id>     # test réel contre Twitch
```

## Limites

- Les VOD de type « upload » récentes ne fonctionnent pas (même limite que l'extension).
- La qualité « Source » est parfois en HEVC (H.265) : VLC et mpv la lisent, certains appareils non.
  Prenez 1080p60 / 720p60 dans ce cas.
- Les passages coupés pour droits d'auteur restent muets.
