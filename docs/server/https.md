# TODO: HTTPS sur le serveur

## État actuel

Le serveur prod (`51.210.150.25:3001`) utilise **HTTP** (non chiffré).

Pour que l'app desktop macOS puisse se connecter, une exception ATS (App Transport Security) est configurée dans `src-tauri/Info.plist` :

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
</dict>
```

## Impacts

- Données en transit non chiffrées (mots de passe, messages, tokens)
- Potentiel rejet sur l'App Store Apple
- Vulnérabilité aux attaques man-in-the-middle

## Plan de migration

### 1. Installer Certbot sur le VPS

```bash
ssh ubuntu@51.210.150.25
sudo apt update
sudo apt install certbot
```

### 2. Obtenir un certificat Let's Encrypt

Nécessite un nom de domaine pointant vers le serveur. Options :
- Acheter un domaine (ex: `organizer.app`)
- Utiliser un sous-domaine existant

```bash
sudo certbot certonly --standalone -d api.organizer.app
```

### 3. Configurer Nginx en reverse proxy

```nginx
server {
    listen 443 ssl;
    server_name api.organizer.app;

    ssl_certificate /etc/letsencrypt/live/api.organizer.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.organizer.app/privkey.pem;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

### 4. Mettre à jour les clients

- Desktop : changer l'URL du serveur dans `ServerConfigContext.tsx`
- Android : mettre à jour l'URL dans la config
- Retirer l'exception ATS de `Info.plist`

### 5. Renouvellement auto

```bash
sudo certbot renew --dry-run
# Ajouter au crontab si nécessaire
```
