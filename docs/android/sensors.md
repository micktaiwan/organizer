# Capteurs Android pour le Pet

## Axes de référence

Position de départ : téléphone tenu en main, en portrait, écran face à toi.

```
         Y+ (haut du tel)
          ↑
          |
          |
    ←-----+-----→ X+ (droite)
   X-     |
          |
          ↓
         Y- (bas du tel)

    Z+ = sort de l'écran (vers toi)
    Z- = derrière le téléphone
```

## Les 3 mouvements possibles

### Mouvement 1 : Incliner gauche/droite (Roll)

Axe de rotation : une ligne imaginaire qui part de ton nez vers l'écran.

```
    ╲        ╱
     ╲      ╱
      ╲    ╱
    gauche  droite
```

- Bord droit descend → **roll positif**
- Bord gauche descend → **roll négatif**

### Mouvement 2 : Face au soleil / face au sol (Pitch)

Axe de rotation : une ligne horizontale qui traverse le téléphone de gauche à droite.

- Haut du tel **loin de toi** → écran regarde le **soleil** → **pitch négatif**
- Haut du tel **vers toi** → écran regarde le **sol** → **pitch positif**

### Mouvement 3 : Montrer à quelqu'un (Azimuth / Yaw)

Axe de rotation : une ligne verticale qui traverse le téléphone de haut en bas.

Tu pivotes le téléphone comme pour le montrer à quelqu'un à côté de toi.

- **Non implémenté** - problème de couplage avec les autres axes (gimbal lock)

---

## Capteurs utilisés

### Rotation Vector (`TYPE_ROTATION_VECTOR`)

Capteur virtuel Android qui fusionne accéléromètre + gyroscope + magnétomètre.
Donne directement les angles d'orientation en degrés :

- **roll** : inclinaison gauche/droite (-180° à +180°)
- **pitch** : inclinaison avant/arrière (-90° à +90°)
- **azimuth** : orientation boussole (-180° à +180°) - non utilisé

### Gyroscope (`TYPE_GYROSCOPE`)

Mesure la vitesse de rotation en rad/s. Utilisé pour :
- Détection de secousse (via magnitude)

### Accéléromètre (`TYPE_ACCELEROMETER`)

Utilisé uniquement pour la détection de secousse (via RotationVectorSensor).

---

## Implémentation actuelle du Pet

### Fichiers

- `sensors/RotationVectorSensor.kt` - expose `roll`, `pitch`, `azimuth`, `isShaking`
- `sensors/GyroscopeSensor.kt` - expose `rotationX`, `rotationY`, `rotationZ`
- `sensors/AccelerometerSensor.kt` - (legacy, non utilisé directement)

### Comportement

| Mouvement | Valeur utilisée | Effet sur le pet |
|-----------|-----------------|------------------|
| Incliner gauche/droite | `roll` (degrés) | Pet glisse horizontalement + **tête pivote** pour rester droite |
| Face soleil/sol | `pitch` (degrés) | Pet glisse verticalement (monte/descend) |
| Montrer à quelqu'un | ❌ | Non implémenté (TODO) |
| Secousse | magnitude accéléromètre | Pet grossit + bouche ouverte |

### Formules

**Rotation de la tête** (pour rester droite) :
```kotlin
val targetRotation = -roll  // roll en degrés, inversé pour compenser
```

**Glissement horizontal** :
```kotlin
val targetTiltX = (roll * sensitivity / 9f).coerceIn(-maxOffset, maxOffset)
```

**Glissement vertical** :
```kotlin
val targetTiltY = (-pitch * sensitivity / 4f).coerceIn(-maxOffset, maxOffset)
```

**Détection de secousse** :
```kotlin
val magnitude = sqrt(x² + y² + z²)
isShaking = magnitude > 18f
```

---

## Configuration

Voir `TamagotchiConfig.kt` :

```kotlin
// Sensibilité des mouvements
val tiltSensitivity: Float = 15f      // Multiplicateur pour le glissement
val maxTiltOffset: Dp = 120.dp        // Distance max du centre

// Gyroscope (pour futur suivi des yeux)
val gyroEyeSensitivity: Float = 8f    // Multiplicateur pour le suivi des yeux
```

---

## TODO

- [ ] Implémenter le suivi des yeux sur mouvement 3 (pivot vertical)
  - Problème : l'azimuth est couplé au roll/pitch (gimbal lock)
  - Piste : utiliser le gyroscope Z avec accumulation et decay
