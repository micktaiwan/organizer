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

// Ringtone state
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

