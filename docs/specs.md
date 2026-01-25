# Specifications

Les specs sans préfixe s'appliquent aux deux clients (Android + Desktop).

## Messages

- Les liens HTTP/HTTPS dans les messages doivent être cliquables et ouvrir le navigateur
- Les sauts de ligne doivent être préservés à l'affichage
- Android: un tap sur un message texte ne déclenche aucune action
- Android: un long press sur un message ouvre une popup permettant de supprimer le message
- les messages ne doivent pas être envoyés OU affichés en double dans les rooms

- Desktop: les emoticons textuelles (:) :-) ;) :D :P :( :/ :O :* <3 xD ^^ B) etc.) sont converties en emojis à l'affichage (pas à l'envoi)
- Desktop: les shortcodes emoji (:muscle :pray :fire :heart etc.) sont convertis en emojis à l'affichage (syntaxe sans colon fermant, base gemoji ~1800 emojis)
- Android: les emoticons textuelles (:) :-) ;) :D :P :( :/ :O :* <3 xD ^^ B) etc.) sont converties en emojis à l'affichage (pas à l'envoi)
- Android: les shortcodes emoji (:muscle :pray :fire :heart etc.) sont convertis en emojis à l'affichage (syntaxe sans colon fermant)
- Desktop: le placeholder du champ de message affiche le nom de l'utilisateur connecté

- L'indicateur de lecture (checkmark vert) doit s'afficher en temps réel quand le destinataire lit un message, sur Desktop et Android
- Dans un DM, le checkmark passe au vert dès que l'autre personne a lu le message
- Dans un groupe, le checkmark passe au vert quand TOUS les membres humains ont lu
- Si l'événement socket est manqué, l'indicateur doit se corriger au prochain chargement de la room (API = source de vérité)
- L'indicateur de lecture (checkmark vert) s'affiche aussi sur les messages système (annonces, appels)
- Desktop: les messages système affichent le bouton d'ajout de réaction (comme les messages normaux)

## Interface

- Desktop: barre de statut en bas affichant version, état de connexion, latence, utilisateurs en ligne, espace disque

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

## User Switcher

- Desktop: dropdown dans RoomHeader pour switcher rapidement entre comptes (stocke tokens, pas les mots de passe)

