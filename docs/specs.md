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

## Interface

- Desktop: barre de statut en bas affichant version, état de connexion, latence, utilisateurs en ligne, espace disque

## Partage

- Android: le système de partage natif permet de partager du contenu vers Organizer depuis d'autres applications (ex: partager un lien depuis X/Twitter)

## WebRTC

- Les appels WebRTC doivent marcher

## User Switcher

- Desktop: dropdown dans RoomHeader pour switcher rapidement entre comptes (stocke tokens, pas les mots de passe)

