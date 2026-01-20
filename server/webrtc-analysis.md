# WebRTC Implementation Analysis

**Date:** 2026-01-19
**Status:** Non fonctionnel - Implémentation incomplète

---

## Résumé exécutif

L'implémentation WebRTC actuelle est **complètement non fonctionnelle**. Le code de signaling existe mais la partie cruciale - la création et gestion du `RTCPeerConnection` - est absente.

---

## Bugs critiques identifiés

### Bug #1: RTCPeerConnection jamais créé (BLOQUANT)

**Fichier:** `src/App.tsx:225`
**Sévérité:** CRITIQUE

```typescript
// Create empty pcRef for future calls implementation
const pcRef = useRef<RTCPeerConnection | null>(null);
```

Le `pcRef` est initialisé à `null` et **n'est jamais assigné à un vrai `RTCPeerConnection`**. Sans cette connexion, aucun appel ne peut fonctionner.

**Recherche effectuée:**
```bash
grep -r "new RTCPeerConnection" src/  # Aucun résultat
grep -r "pcRef.current =" src/        # Aucun résultat
```

**Impact:** Toutes les opérations WebRTC échouent silencieusement car `pcRef.current` est toujours `null`.

---

### Bug #2: Aucun handler pour les événements WebRTC entrants (BLOQUANT)

**Fichiers concernés:**
- `src/hooks/useWebRTCCall.ts` - N'écoute que les événements `call:*`
- `src/services/socket.ts` - Enregistre les événements mais personne ne les consomme

**Sévérité:** CRITIQUE

Le socket service enregistre les événements WebRTC:
```typescript
// src/services/socket.ts:59-62
'webrtc:offer',
'webrtc:answer',
'webrtc:ice-candidate',
'webrtc:close',
```

Mais **aucun composant n'écoute ces événements**:
```bash
grep -r "socketService.on.*webrtc" src/  # Aucun résultat
```

**Impact:**
- Quand l'appelant envoie une offre SDP, le destinataire ne la reçoit jamais
- Les réponses SDP ne sont jamais traitées
- Les candidats ICE ne sont jamais échangés

---

### Bug #3: Aucune configuration STUN/TURN (BLOQUANT en production)

**Sévérité:** HAUTE

**Recherche effectuée:**
```bash
grep -ri "iceServers\|stun:\|turn:" .  # Aucun résultat
```

Sans serveurs STUN/TURN configurés:
- Les appels entre utilisateurs sur le même réseau local peuvent fonctionner
- Les appels entre utilisateurs derrière des NAT différents échoueront **systématiquement**

**Configuration requise:**
```typescript
const config: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    // TURN server pour les cas où STUN échoue
    {
      urls: 'turn:your-turn-server.com:3478',
      username: 'user',
      credential: 'password'
    }
  ]
};
```

---

### Bug #4: addTracksAndRenegotiate opère sur un pcRef null

**Fichier:** `src/hooks/useWebRTCCall.ts:103-121`
**Sévérité:** CRITIQUE

```typescript
const addTracksAndRenegotiate = useCallback(async (stream: MediaStream, target: string) => {
  const pc = pcRef.current;
  if (!pc || !target) return;  // Retourne toujours car pc est null

  // Ce code n'est jamais exécuté
  stream.getTracks().forEach(track => {
    const sender = pc.addTrack(track, stream);
    sendersRef.current.push(sender);
  });
  // ...
}, []);
```

**Impact:** L'appel semble démarrer (état `calling`) mais:
- Aucune track audio/vidéo n'est ajoutée à la connexion
- Aucune offre SDP n'est créée
- L'appel reste bloqué à l'état "Appel en cours..."

---

### Bug #5: useEffect ontrack inutile

**Fichier:** `src/hooks/useWebRTCCall.ts:30-49`
**Sévérité:** MOYENNE

```typescript
useEffect(() => {
  const pc = pcRef.current;
  if (!pc) return;  // Toujours return car pc est null

  const handleTrack = (event: RTCTrackEvent) => {
    // Jamais exécuté
  };

  pc.addEventListener('track', handleTrack);
  // ...
}, [pcRef.current, callState]);
```

**Impact:** Même si un flux distant arrivait, il ne serait jamais attaché à la vidéo.

---

## Flux d'appel actuel (cassé)

```
Appelant                    Serveur                    Destinataire
   |                           |                            |
   |-- startCall() ----------->|                            |
   |   getUserMedia() OK       |                            |
   |   addTracksAndRenegotiate |                            |
   |   pc est null -> return   |                            |
   |                           |                            |
   |-- call:request ---------->|-- call:request ----------->|
   |                           |                            |
   |   (état: calling)         |                   (état: incoming)
   |                           |                   ringtone plays
   |                           |                            |
   |                           |<-- call:accept ------------|
   |<-- call:accept -----------|   acceptCall()             |
   |   (état: connected)       |   getUserMedia() OK        |
   |                           |   addTracksAndRenegotiate  |
   |                           |   pc est null -> return    |
   |                           |                            |
   |   Pas de SDP offer        |                            |
   |   Pas de ICE candidates   |                            |
   |   Pas de flux média       |                            |
   |                           |                            |
   +----- APPEL SILENCIEUX ----+                            |
```

---

## Code manquant pour une implémentation fonctionnelle

### 1. Création du RTCPeerConnection

```typescript
// À ajouter dans useWebRTCCall.ts ou un nouveau hook
const createPeerConnection = useCallback(() => {
  const config: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ]
  };

  const pc = new RTCPeerConnection(config);

  pc.onicecandidate = (event) => {
    if (event.candidate && targetUserId) {
      socketService.sendIceCandidate(targetUserId, event.candidate);
    }
  };

  pc.ontrack = (event) => {
    if (remoteVideoRef.current && event.streams[0]) {
      remoteVideoRef.current.srcObject = event.streams[0];
    }
  };

  pc.onconnectionstatechange = () => {
    console.log('Connection state:', pc.connectionState);
  };

  pcRef.current = pc;
  return pc;
}, [targetUserId]);
```

### 2. Handlers pour les événements WebRTC

```typescript
// À ajouter dans useWebRTCCall.ts
useEffect(() => {
  const handleOffer = async (data: { from: string; offer: RTCSessionDescriptionInit }) => {
    const pc = pcRef.current || createPeerConnection();
    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socketService.sendAnswer(data.from, answer);
  };

  const handleAnswer = async (data: { from: string; answer: RTCSessionDescriptionInit }) => {
    const pc = pcRef.current;
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
  };

  const handleIceCandidate = async (data: { from: string; candidate: RTCIceCandidateInit }) => {
    const pc = pcRef.current;
    if (pc && data.candidate) {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  };

  const unsubOffer = socketService.on('webrtc:offer', handleOffer);
  const unsubAnswer = socketService.on('webrtc:answer', handleAnswer);
  const unsubCandidate = socketService.on('webrtc:ice-candidate', handleIceCandidate);

  return () => {
    unsubOffer();
    unsubAnswer();
    unsubCandidate();
  };
}, [createPeerConnection]);
```

### 3. Flux d'appel corrigé

```typescript
const startCall = useCallback(async (targetUser: string, withCamera: boolean) => {
  setTargetUserId(targetUser);

  // 1. Créer le peer connection
  const pc = createPeerConnection();

  // 2. Obtenir le média local
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: withCamera,
  });
  localStreamRef.current = stream;

  // 3. Ajouter les tracks au peer connection
  stream.getTracks().forEach(track => {
    pc.addTrack(track, stream);
  });

  // 4. Créer et envoyer l'offre
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socketService.sendOffer(targetUser, offer);

  // 5. Envoyer la demande d'appel
  socketService.requestCall(targetUser, withCamera);
  setCallState('calling');
}, [createPeerConnection]);
```

---

## Problèmes secondaires

### UI: Pas d'indication de l'utilisateur appelé

**Fichier:** `src/App.tsx:737`

```typescript
<IncomingCallModal
  remoteUsername="Appel entrant"  // Toujours "Appel entrant"
  // ...
/>
```

Le username de l'appelant n'est pas passé au modal.

### Pas de timeout pour les appels sans réponse

Si le destinataire ne répond pas, l'appelant reste bloqué à l'état `calling` indéfiniment.

### Pas de gestion de la perte de connexion

Si le socket se déconnecte pendant un appel, aucune action n'est prise.

---

## Recommandations

1. **Court terme:** Désactiver les boutons d'appel jusqu'à correction
   ```typescript
   // Dans RoomMembers.tsx - masquer les boutons
   {/* TODO: WebRTC non implémenté
   <button className="call-button audio" ...>
   */}
   ```

2. **Moyen terme:** Implémenter le RTCPeerConnection et les handlers

3. **Long terme:**
   - Configurer un serveur TURN pour garantir les connexions
   - Ajouter des tests E2E pour les appels
   - Gérer les cas edge (perte connexion, multi-device, etc.)

---

## Fichiers concernés

| Fichier | Rôle | État |
|---------|------|------|
| `src/App.tsx` | Intégration WebRTC | pcRef null |
| `src/hooks/useWebRTCCall.ts` | Logique d'appel | Incomplet |
| `src/services/socket.ts` | Signaling client | OK (events enregistrés) |
| `server/src/socket/index.ts` | Signaling serveur | OK |
| `src/components/Call/CallOverlay.tsx` | UI appel connecté | OK |
| `src/components/Call/IncomingCallModal.tsx` | UI appel entrant | OK |

---

## Conclusion

L'implémentation WebRTC est à **~30% de complétion**:
- ✅ Signaling serveur fonctionnel
- ✅ Interface utilisateur présente
- ✅ Gestion du flux d'appel (request/accept/reject/end)
- ❌ RTCPeerConnection non créé
- ❌ Handlers WebRTC non implémentés
- ❌ Configuration ICE absente
- ❌ Échange SDP non fonctionnel
- ❌ Échange ICE candidates non fonctionnel

---

## Bugs additionnels (Iteration 2)

### Bug #6: Aucune implémentation Android

**Sévérité:** HAUTE

Aucun code WebRTC n'existe côté Android:
```bash
grep -ri "WebRTC\|RTCPeer" android/  # Aucun résultat
```

**Impact:** Les appels ne fonctionneront que sur desktop (Tauri), jamais sur mobile Android.

**Dépendance requise pour Android:**
```kotlin
// build.gradle.kts
implementation("io.getstream:stream-webrtc-android:1.1.1")
// ou
implementation("org.webrtc:google-webrtc:1.0.+")
```

---

### Bug #7: Fuite mémoire potentielle - RTCPeerConnection non fermé

**Fichier:** `src/hooks/useWebRTCCall.ts:86-100`
**Sévérité:** MOYENNE

La fonction `endCallInternal` ne ferme pas le `RTCPeerConnection`:

```typescript
const endCallInternal = useCallback(() => {
  stopRingtone();
  stopLocalStream();
  removeTracksFromPC();
  // ... reset states
  // MANQUANT: pcRef.current?.close(); pcRef.current = null;
}, [stopLocalStream, removeTracksFromPC]);
```

**Impact:** Si le RTCPeerConnection était créé, il resterait ouvert après la fin de l'appel, causant des fuites de ressources.

---

### Bug #8: Sécurité - Aucune vérification de relation (serveur)

**Fichier:** `server/src/socket/index.ts:230-259`
**Sévérité:** HAUTE (sécurité)

Les événements WebRTC sont relayés sans vérifier que les utilisateurs ont une relation (room commune, contacts):

```typescript
socket.on('webrtc:offer', (data: { to: string; offer: unknown }) => {
  io.to(`user:${data.to}`).emit('webrtc:offer', {  // Pas de vérification!
    from: userId,
    // ...
  });
});
```

**Impact:** N'importe quel utilisateur authentifié peut:
- Envoyer des demandes d'appel à n'importe qui
- Potentiellement harceler d'autres utilisateurs
- Découvrir si un utilisateur est en ligne

**Correction suggérée:**
```typescript
socket.on('webrtc:offer', async (data: { to: string; offer: unknown }) => {
  // Vérifier que les utilisateurs partagent une room
  const sharedRoom = await Room.findOne({
    'members.userId': { $all: [userId, data.to] }
  });

  if (!sharedRoom) {
    socket.emit('error', { message: 'Cannot call user outside shared rooms' });
    return;
  }

  io.to(`user:${data.to}`).emit('webrtc:offer', { ... });
});
```

---

### Bug #9: Pas de gestion d'erreur getUserMedia

**Fichier:** `src/hooks/useWebRTCCall.ts:134-151`
**Sévérité:** BASSE

L'erreur getUserMedia affiche une alerte mais ne reset pas l'état:

```typescript
} catch (err) {
  console.error('Failed to get local stream for call:', err);
  alert("Impossible d'accéder au micro ou à la caméra...");
  // MANQUANT: setCallState('idle'); cleanup();
}
```

**Impact:** L'UI peut rester dans un état incohérent après une erreur de permissions.

---

## Tableau récapitulatif complet

| # | Bug | Sévérité | Type |
|---|-----|----------|------|
| 1 | RTCPeerConnection jamais créé | CRITIQUE | Fonctionnel |
| 2 | Handlers WebRTC non implémentés | CRITIQUE | Fonctionnel |
| 3 | Pas de STUN/TURN | HAUTE | Config |
| 4 | addTracksAndRenegotiate sur null | CRITIQUE | Fonctionnel |
| 5 | ontrack useEffect inutile | MOYENNE | Fonctionnel |
| 6 | Pas d'implémentation Android | HAUTE | Plateforme |
| 7 | RTCPeerConnection jamais fermé | MOYENNE | Mémoire |
| 8 | Pas de vérification relation | HAUTE | Sécurité |
| 9 | Pas de cleanup sur erreur getUserMedia | BASSE | UX |

---

## Conclusion mise à jour

L'implémentation WebRTC est à **~25% de complétion** (révision à la baisse):

### Desktop (Tauri)
- ✅ Signaling serveur fonctionnel
- ✅ Interface utilisateur présente
- ✅ Gestion du flux d'appel (request/accept/reject/end)
- ❌ RTCPeerConnection non créé
- ❌ Handlers WebRTC non implémentés
- ❌ Configuration ICE absente
- ❌ Cleanup incomplet

### Android
- ❌ Aucune implémentation (0%)

### Sécurité
- ❌ Pas de vérification de relation entre utilisateurs

---

## Bugs additionnels (Iteration 3)

### Bug #10: Handler webrtc:close non implémenté

**Sévérité:** MOYENNE

Le serveur émet `webrtc:close` mais aucun handler n'existe côté client:
```bash
grep -r "on.*webrtc:close" src/  # Aucun résultat
```

**Impact:** Si un pair ferme sa connexion WebRTC, l'autre pair ne sera pas notifié proprement.

---

### Bug #11: Fuite AudioContext dans le ringtone

**Fichier:** `src/utils/audio.ts:23-35`
**Sévérité:** BASSE

Un nouveau `AudioContext` est créé toutes les 1.5 secondes pendant la sonnerie:

```typescript
const playTone = () => {
  const audioContext = new AudioContext();  // Nouveau contexte à chaque fois!
  // ...
};
ringtoneInterval = setInterval(playTone, 1500);
```

**Impact:**
- Accumulation d'AudioContexts non fermés
- Warning navigateur: "The AudioContext was not allowed to start"
- Potentielle dégradation de performance sur appels longs sans réponse

**Correction suggérée:**
```typescript
let audioContext: AudioContext | null = null;

export const playRingtone = () => {
  stopRingtone();
  audioContext = new AudioContext();  // Un seul contexte

  const playTone = () => {
    if (!audioContext) return;
    const oscillator = audioContext.createOscillator();
    // ...
  };
  // ...
};

export const stopRingtone = () => {
  if (ringtoneInterval) {
    clearInterval(ringtoneInterval);
    ringtoneInterval = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
};
```

---

### Bug #12: Ordre incorrect - call:request envoyé avant SDP

**Fichier:** `src/hooks/useWebRTCCall.ts:124-152`
**Sévérité:** HAUTE (si implémenté)

Dans le flux prévu, `socketService.requestCall()` est appelé APRÈS `addTracksAndRenegotiate()`:

```typescript
const startCall = useCallback(async (targetUser: string, withCamera: boolean) => {
  // ...
  await addTracksAndRenegotiate(stream, targetUser);  // Envoie l'offre SDP
  socketService.requestCall(targetUser, withCamera);   // Puis demande l'appel
  setCallState('calling');
}, []);
```

**Problème:** Le destinataire reçoit l'offre SDP AVANT la notification d'appel entrant. Il n'aura pas le temps de voir le modal d'appel entrant avant de recevoir l'offre.

**Flux correct:**
1. `call:request` → Destinataire voit le modal, ringtone joue
2. Destinataire accepte → `call:accept`
3. PUIS échange SDP (offer → answer → ICE)

---

## Tableau récapitulatif final

| # | Bug | Sévérité | Type |
|---|-----|----------|------|
| 1 | RTCPeerConnection jamais créé | CRITIQUE | Fonctionnel |
| 2 | Handlers WebRTC non implémentés | CRITIQUE | Fonctionnel |
| 3 | Pas de STUN/TURN | HAUTE | Config |
| 4 | addTracksAndRenegotiate sur null | CRITIQUE | Fonctionnel |
| 5 | ontrack useEffect inutile | MOYENNE | Fonctionnel |
| 6 | Pas d'implémentation Android | HAUTE | Plateforme |
| 7 | RTCPeerConnection jamais fermé | MOYENNE | Mémoire |
| 8 | Pas de vérification relation | HAUTE | Sécurité |
| 9 | Pas de cleanup sur erreur getUserMedia | BASSE | UX |
| 10 | Handler webrtc:close manquant | MOYENNE | Fonctionnel |
| 11 | Fuite AudioContext ringtone | BASSE | Mémoire |
| 12 | Ordre incorrect call:request vs SDP | HAUTE | Architecture |

---

## Statistiques finales

| Sévérité | Nombre |
|----------|--------|
| CRITIQUE | 3 |
| HAUTE | 5 |
| MOYENNE | 3 |
| BASSE | 2 |
| **Total** | **12** |

---

## Conclusion finale

**WebRTC: ~25% implémenté, 0% fonctionnel**

L'implémentation actuelle est une coquille vide:
- Le signaling serveur fonctionne (relais des événements)
- L'UI existe (boutons, modals, overlays)
- La logique de flux d'appel existe (états, handlers call:*)

Mais le cœur de WebRTC - le `RTCPeerConnection` - n'existe pas.

**Pour rendre WebRTC fonctionnel, il faut:**
1. Créer et gérer le RTCPeerConnection
2. Implémenter les handlers pour offer/answer/ice-candidate/close
3. Configurer les serveurs STUN (minimum) et TURN (recommandé)
4. Corriger l'ordre d'envoi (call:request avant SDP)
5. Ajouter le cleanup approprié

**Recommandation:** Désactiver les boutons d'appel en attendant une implémentation complète pour éviter la confusion utilisateur
