# Authentification & Token Refresh

## Vue d'ensemble

L'auth utilise un système **access token + refresh token** :

- **Access token** (JWT, 1h) : utilisé pour chaque requête API et connexion socket
- **Refresh token** (opaque, 30j) : utilisé uniquement pour renouveler l'access token

Quand l'access token expire, le client le renouvelle automatiquement via le refresh token, sans intervention de l'utilisateur.

```
Client                          Server
  │                               │
  │──── login ───────────────────►│
  │◄─── token + refreshToken ─────│
  │                               │
  │──── GET /api (token) ────────►│  (pendant 1h)
  │◄─── 200 OK ──────────────────│
  │                               │
  │──── GET /api (token expiré) ─►│
  │◄─── 401 ─────────────────────│
  │                               │
  │──── POST /auth/refresh ──────►│  (auto, transparent)
  │◄─── newToken + newRefresh ────│  (rotation)
  │                               │
  │──── GET /api (newToken) ─────►│  (replay automatique)
  │◄─── 200 OK ──────────────────│
```

## Server

### Modele RefreshToken

`server/src/models/RefreshToken.ts`

| Champ | Type | Description |
|-------|------|-------------|
| `tokenHash` | string | SHA256 du token (jamais le token brut en DB) |
| `userId` | ObjectId | Ref vers User |
| `expiresAt` | Date | Expiration (30j), index TTL pour auto-cleanup |
| `revoked` | boolean | Marquage de revocation |

### Fonctions auth

`server/src/middleware/auth.ts`

| Fonction | Description |
|----------|-------------|
| `generateToken(userId, username)` | JWT signé, expire en 1h |
| `generateRefreshToken(userId)` | Token opaque (64 bytes hex), stocke le hash SHA256 en DB |
| `verifyRefreshToken(token)` | Verifie le hash en DB (non revoque, non expire) |
| `revokeRefreshToken(token)` | Marque le token comme revoque |

### Routes

`server/src/routes/auth.ts`

| Route | Description |
|-------|-------------|
| `POST /auth/login` | Retourne `{ token, refreshToken, user }` |
| `POST /auth/register` | Retourne `{ token, refreshToken, user }` |
| `POST /auth/refresh` | Recoit `{ refreshToken }`, rotation (revoque l'ancien, cree un nouveau), retourne `{ token, refreshToken }` |
| `POST /auth/logout` | Recoit `{ refreshToken }`, le revoque en DB |

La rotation du refresh token (chaque refresh genere un nouveau refresh token et revoque l'ancien) limite l'impact d'un token vole : il ne peut etre utilise qu'une seule fois.

## Desktop (Tauri)

### API Service (`src/services/api.ts`)

Le `request()` intercepte les reponses 401 :

1. Recoit 401 sur une requete
2. Appelle `POST /auth/refresh` avec le refresh token
3. Si succes : met a jour les tokens, rejoue la requete originale
4. Si echec : appelle `onAuthExpired` callback (logout)

Un **mutex** empeche les refreshs concurrents (si 3 requetes echouent en 401 simultanement, un seul refresh est fait).

### Socket Service (`src/services/socket.ts`)

- `updateAuth(token)` : met a jour `socket.auth` pour les reconnexions futures
- Emet `internal:auth-error` quand le serveur repond "Token invalide" ou "Token expire" sur la connexion socket

### AuthContext (`src/contexts/AuthContext.tsx`)

- Stocke le refresh token dans le Tauri store (cle `auth_refresh_token_{serverId}`)
- Login/register : sauvegarde les deux tokens
- `api.onTokenRefreshed` : persiste les nouveaux tokens, met a jour le socket
- `api.onAuthExpired` : logout automatique
- `internal:auth-error` du socket : tente un refresh, reconnecte le socket si succes, logout si echec
- `SavedAccount` inclut le `refreshToken` pour le user switcher

### Flux au demarrage

```
1. Charge savedToken + savedRefreshToken depuis le store
2. Configure api.setToken() + api.setRefreshToken()
3. Appelle GET /auth/me
   ├─ Token valide → OK, connecte le socket
   └─ Token expire (401) → api auto-refresh → OK, connecte le socket avec le nouveau token
                         └─ Refresh echec → clear tokens, affiche login
```

## Android - TODO

L'app Android **ignore actuellement** le champ `refreshToken` retourne par le serveur (Gson ne crash pas sur des champs inconnus). L'auth Android utilise toujours un seul JWT.

### A implementer

1. **Stocker le refresh token** : dans `SharedPreferences` ou `EncryptedSharedPreferences` au login

2. **Intercepteur OkHttp** : ajouter un `Authenticator` ou un intercepteur qui :
   - Detecte les reponses 401
   - Appelle `POST /auth/refresh`
   - Rejoue la requete avec le nouveau token
   - Mutex pour eviter les refreshs concurrents

3. **Socket reconnexion** : quand le socket recoit une erreur d'auth, tenter un refresh avant de reconnecter

4. **Logout** : appeler `POST /auth/logout` pour revoquer le refresh token

### Exemple d'intercepteur OkHttp

```kotlin
class TokenAuthenticator(
    private val tokenStore: TokenStore
) : Authenticator {
    private val mutex = Mutex()

    override fun authenticate(route: Route?, response: Response): Request? {
        // Eviter les boucles infinies
        if (response.request.header("X-Retry") != null) return null

        return runBlocking {
            mutex.withLock {
                val refreshToken = tokenStore.getRefreshToken() ?: return@runBlocking null
                val result = authApi.refresh(refreshToken)
                if (result.isSuccess) {
                    tokenStore.saveTokens(result.token, result.refreshToken)
                    response.request.newBuilder()
                        .header("Authorization", "Bearer ${result.token}")
                        .header("X-Retry", "true")
                        .build()
                } else {
                    tokenStore.clear()
                    null // Retourne au login
                }
            }
        }
    }
}
```

## Securite

- Le refresh token **n'est jamais stocke en clair** en DB (SHA256)
- **Rotation** a chaque refresh : un token vole ne peut etre utilise qu'une fois
- **TTL index** MongoDB : les tokens expires sont automatiquement supprimes
- L'access token court (1h) limite la fenetre d'exploitation en cas de vol
- Le logout **revoque** le refresh token cote serveur
