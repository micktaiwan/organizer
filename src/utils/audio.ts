// Shared AudioContext for notification sounds (short-lived)
let notificationAudioContext: AudioContext | null = null;

export const playNotificationSound = () => {
  // Create or resume AudioContext
  if (!notificationAudioContext || notificationAudioContext.state === 'closed') {
    notificationAudioContext = new AudioContext();
  }
  if (notificationAudioContext.state === 'suspended') {
    notificationAudioContext.resume();
  }

  const oscillator = notificationAudioContext.createOscillator();
  const gainNode = notificationAudioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(notificationAudioContext.destination);

  oscillator.frequency.setValueAtTime(800, notificationAudioContext.currentTime);
  oscillator.frequency.setValueAtTime(600, notificationAudioContext.currentTime + 0.1);

  gainNode.gain.setValueAtTime(0.3, notificationAudioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, notificationAudioContext.currentTime + 0.2);

  oscillator.start(notificationAudioContext.currentTime);
  oscillator.stop(notificationAudioContext.currentTime + 0.2);
};

// Ringback tone state (outgoing calls - waiting for answer)
let ringbackInterval: ReturnType<typeof setInterval> | null = null;
let ringbackAudioContext: AudioContext | null = null;

export const playRingback = () => {
  stopRingback();

  ringbackAudioContext = new AudioContext();

  const playTone = () => {
    if (!ringbackAudioContext || ringbackAudioContext.state === 'closed') return;

    const oscillator = ringbackAudioContext.createOscillator();
    const gainNode = ringbackAudioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ringbackAudioContext.destination);

    // Classic phone ringback tone (425Hz in Europe, dual tone)
    oscillator.frequency.setValueAtTime(425, ringbackAudioContext.currentTime);
    gainNode.gain.setValueAtTime(0.2, ringbackAudioContext.currentTime);
    gainNode.gain.setValueAtTime(0.2, ringbackAudioContext.currentTime + 0.4);
    gainNode.gain.setValueAtTime(0, ringbackAudioContext.currentTime + 0.4);

    oscillator.start(ringbackAudioContext.currentTime);
    oscillator.stop(ringbackAudioContext.currentTime + 0.4);
  };

  playTone();
  // European pattern: 400ms on, 200ms off, 400ms on, 2000ms off
  let toggle = false;
  ringbackInterval = setInterval(() => {
    toggle = !toggle;
    if (toggle) {
      setTimeout(playTone, 200); // Second beep after 200ms pause
    } else {
      playTone(); // First beep
    }
  }, 1500);
};

export const stopRingback = () => {
  if (ringbackInterval) {
    clearInterval(ringbackInterval);
    ringbackInterval = null;
  }
  if (ringbackAudioContext) {
    ringbackAudioContext.close();
    ringbackAudioContext = null;
  }
};

// Ringtone state (incoming calls)
let ringtoneInterval: ReturnType<typeof setInterval> | null = null;
let ringtoneAudioContext: AudioContext | null = null;

export const playRingtone = () => {
  stopRingtone();

  // Create a dedicated AudioContext for ringtone
  ringtoneAudioContext = new AudioContext();

  const playTone = () => {
    if (!ringtoneAudioContext || ringtoneAudioContext.state === 'closed') return;

    const oscillator = ringtoneAudioContext.createOscillator();
    const gainNode = ringtoneAudioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ringtoneAudioContext.destination);
    oscillator.frequency.setValueAtTime(440, ringtoneAudioContext.currentTime);
    oscillator.frequency.setValueAtTime(480, ringtoneAudioContext.currentTime + 0.15);
    oscillator.frequency.setValueAtTime(440, ringtoneAudioContext.currentTime + 0.3);
    gainNode.gain.setValueAtTime(0.3, ringtoneAudioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ringtoneAudioContext.currentTime + 0.4);
    oscillator.start(ringtoneAudioContext.currentTime);
    oscillator.stop(ringtoneAudioContext.currentTime + 0.4);
  };

  playTone();
  ringtoneInterval = setInterval(playTone, 1500);
};

export const stopRingtone = () => {
  if (ringtoneInterval) {
    clearInterval(ringtoneInterval);
    ringtoneInterval = null;
  }
  if (ringtoneAudioContext) {
    ringtoneAudioContext.close();
    ringtoneAudioContext = null;
  }
};

export const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

