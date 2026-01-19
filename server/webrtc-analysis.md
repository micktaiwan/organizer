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

**Temps estimé pour correction:** Non fourni (voir CLAUDE.md)
