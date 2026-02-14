# Specifications

Les specs sans préfixe s'appliquent aux deux clients (Android + Desktop).

## Messages

- Les liens HTTP/HTTPS dans les messages doivent être cliquables et ouvrir le navigateur
- Les sauts de ligne doivent être préservés à l'affichage
- Android: un tap sur un message texte ne déclenche aucune action
- Android: un long press sur un message ouvre une popup permettant de supprimer le message
- les messages ne doivent pas être envoyés OU affichés en double dans les rooms
- Les messages avec des réactions emoji ne sont pas groupés avec les messages suivants (les réactions restent visibles)

- Desktop: les emoticons textuelles (:) :-) ;) :D :P :( :/ :O :* <3 xD ^^ B) etc.) sont converties en emojis à l'affichage (pas à l'envoi)
- Desktop: les shortcodes emoji (:muscle :pray :fire :heart etc.) sont convertis en emojis à l'affichage (syntaxe avec ou sans colon fermant, base gemoji ~1800 emojis)
- Android: les emoticons textuelles (:) :-) ;) :D :P :( :/ :O :* <3 xD ^^ B) etc.) sont converties en emojis à l'affichage (pas à l'envoi)
- Android: les shortcodes emoji (:muscle :pray :fire :heart etc.) sont convertis en emojis à l'affichage (syntaxe avec ou sans colon fermant)
- Desktop: le placeholder du champ de message affiche le nom de l'utilisateur connecté

- L'indicateur de lecture (checkmark vert) doit s'afficher en temps réel quand le destinataire lit un message, sur Desktop et Android
- Dans un DM, le checkmark passe au vert dès que l'autre personne a lu le message
- Dans un groupe, le checkmark passe au vert quand TOUS les membres humains ont lu
- Si l'événement socket est manqué, l'indicateur doit se corriger au prochain chargement de la room (API = source de vérité)
- L'indicateur de lecture (checkmark vert) s'affiche aussi sur les messages système (annonces, appels)
- Desktop: les messages système affichent le bouton d'ajout de réaction (comme les messages normaux)

## Interface

- Desktop: barre de statut en bas affichant version, état de connexion, latence, utilisateurs en ligne, espace disque local et serveur
- Desktop: tooltips sur tous les éléments de la barre de statut
- Desktop: le compteur d'utilisateurs en ligne exclut les bots
- Desktop: bordure rouge sur le champ de message quand connecté en tant que bot
- Desktop: les membres en ligne (hors bots et soi-même) sont affichés sous forme de chips dans le header de la room

## Authentification

- La connexion accepte un nom d'utilisateur ou une adresse email

## Mises à jour

- Android: la popup de mise à jour peut être fermée sans annuler le téléchargement

## Partage

- Android: le système de partage natif permet de partager du contenu vers Organizer depuis d'autres applications (ex: partager un lien depuis X/Twitter)

## WebRTC

- Les appels WebRTC doivent marcher
- Desktop + Android: possibilité de recevoir un partage d'écran pendant un appel
- Desktop + Android: reconnexion automatique en cas de coupure réseau (ICE restart, timeout 10s)
- Android: bouton pour basculer entre caméra avant/arrière
- Android: l'écran reste allumé pendant un appel
- Android: mode paysage plein écran lors de la réception d'un partage d'écran
- Desktop: durée de l'appel affichée en temps réel
- Desktop: modale de confirmation avant de changer de serveur
- Android: mode Picture-in-Picture pendant les appels (la vidéo continue dans une fenêtre flottante quand on quitte l'app)
- Desktop + Android : décrocher un appel sur un appareil arrête la sonnerie sur les autres appareils
- Desktop : décompte de reconnexion visible (10s) pendant une coupure réseau
- Desktop : l'appel peut être minimisé en barre compacte avec contrôles (micro, raccrocher, agrandir)
- Desktop : indicateur visuel "Écran de [nom]" quand on reçoit un partage d'écran
- Desktop : placeholder visible quand la caméra locale est désactivée
- Desktop : la barre minimisée change de couleur (orange) pendant la reconnexion

## User Switcher

- Desktop: dropdown dans RoomHeader pour switcher rapidement entre comptes (stocke tokens, pas les mots de passe)

## Architecture: Sources de données utilisateur

Il existe deux sources de données utilisateur qui doivent rester synchronisées :

1. **API `/rooms`** (populate des membres) - données chargées au démarrage
   - Fichier: `server/src/routes/rooms.ts`
   - Champs: `username`, `displayName`, `isOnline`, `isBot`

2. **Socket `users:init` + `user:online`** - données temps réel pour réactivité
   - Fichier: `server/src/socket/index.ts`
   - Client: `src/contexts/UserStatusContext.tsx`
   - Champs: `username`, `displayName`, `status`, `statusMessage`, `statusExpiresAt`, `isMuted`, `isOnline`, `isBot`, `appVersion`

**Règle**: tout champ utilisateur ajouté à l'une des sources doit être ajouté à l'autre si nécessaire. Les commentaires `[USER_DATA_SYNC]` marquent les endroits concernés.

## Vidéos

- Desktop + Android : enregistrement de vidéos (écran ou webcam) avec preview avant envoi
- Desktop : choix de la qualité (Haute 1080p, Moyenne 720p, Basse 480p)
- Les vidéos s'affichent avec une miniature et badge de durée
- Un clic sur la miniature ouvre le lecteur plein écran
- Les miniatures sont générées côté serveur (async, non bloquant)
- Android : onglet "Vidéos" dans la galerie pour filtrer les vidéos
- Android : onglet "Audios" dans la galerie pour filtrer les fichiers audio, avec lecteur audio dédié
- Android : lecture plein écran avec ExoPlayer (contrôles natifs)
- Android : bouton toggle dans le lecteur vidéo pour basculer entre mode Zoom (remplit l'écran) et mode Fit (vidéo entière visible)
- Desktop : lecteur vidéo avec 3 modes d'affichage (original, fit, fill), barre espace pour play/pause, contrôles masquables

## Fichiers

- Desktop : glisser-déposer des fichiers directement dans le chat pour les partager (max 25MB)
- Desktop : les fichiers audio (.mp3, .wav, .ogg, .m4a, .aac, .flac) affichent un lecteur audio intégré au lieu d'un simple lien de téléchargement
- Desktop : onglet Gallery avec vue grille de tous les fichiers partagés (images, vidéos, audios, fichiers)
- Desktop : filtres par type (All, Images, Videos, Audios, Files) et tri par date ou taille dans la galerie
- Desktop : recherche par nom de fichier ou légende dans la galerie
- Desktop : overlay plein écran avec navigation flèches (clavier + boutons) dans la galerie
- Desktop : téléchargement et suppression de fichiers depuis la galerie (suppression réservée à l'expéditeur)
- Desktop + Server : les fichiers avec mimeType audio sont regroupés sous le filtre Audio (distinction voix / fichiers audio)

## Messages non lus

- Desktop + Android : séparateur visuel "Nouveaux messages" qui indique où commencent les messages non lus dans une conversation
- Desktop + Android : au retour dans une room, l'app scrolle automatiquement vers le premier message non lu

## Apparence

- Desktop : sélecteur de thème (Système / Clair / Sombre) dans les paramètres, appliqué sans flash au chargement

## Notifications

- Desktop : notification desktop quand un utilisateur (hors bots) se connecte
- Desktop : les notifications (messages et connexion) jouent un son système

