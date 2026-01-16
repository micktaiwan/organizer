# Agent / Tamagotchi / Pet

> **Synonymes** : "Agent", "Tamagotchi" et "Pet" désignent la même chose — la créature interactive de l'app.

Documentation principale : [`/server/agent/docs/agent.md`](../../../server/agent/docs/agent.md)

## Docs Android spécifiques

- [`sensors.md`](./sensors.md) — Capteurs (accéléromètre, gyroscope, rotation vector)

## Code Android

```
app/src/main/java/com/organizer/chat/ui/screens/tamagotchi/
├── TamagotchiScreen.kt      # Écran principal
├── TamagotchiState.kt       # État + animations
├── TamagotchiConfig.kt      # Constantes
├── components/
│   ├── CreatureRenderer.kt  # Dessin du pet
│   └── ThoughtBubble.kt     # Bulles de pensées
├── gestures/
│   └── TamagotchiGestures.kt
└── sensors/
    ├── RotationVectorSensor.kt  # Capteur fusionné (principal)
    ├── GyroscopeSensor.kt
    └── AccelerometerSensor.kt   # Legacy
```

## Statut Phase 0

✅ **Terminée** — MVP graphique sans LLM

Voir `/server/agent/docs/agent.md` pour la roadmap complète.
