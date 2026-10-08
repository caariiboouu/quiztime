/**
 * Duck noises: quacks, startled quacks when bumped, and a big one on take-off,
 * from every duck, louder the nearer it is to yours and panned to its side,
 * so a crowd is a cacophony. They're real mallard quacks (public/sounds,
 * ~20 KB, CC BY-SA: see CREDITS.md there), picked at random and played a
 * touch faster or slower each time so no two sound quite alike; until
 * they've loaded (or if they can't), a synthesised quack stands in. Sound is decoration only; it's off if the
 * player mutes it, and browsers only allow it after they've pressed
 * something, which they will have to steer.
 */
const KEY = "quiztime.live.sound";
let ctx: AudioContext | null = null;

export function soundOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // not remembered; fine
  }
}

function audio(): AudioContext | null {
  if (!soundOn() || typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  preloadSounds();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

// --- recorded quacks ---------------------------------------------------------

/** A mallard's call, quack by quack: big, then each shorter and softer. */
const CLIPS = ["quack-1", "quack-2", "quack-3", "quack-4"];
let clips: (AudioBuffer | null)[] = [];
let loading = false;

/**
 * Fetch and decode the quacks (decoded off to the side, so this works before
 * the player has pressed anything and needs no audio permission).
 */
export function preloadSounds() {
  if (loading || typeof window === "undefined" || !soundOn()) return;
  const Offline = window.OfflineAudioContext;
  if (!Offline) return;
  loading = true;
  const decoder = new Offline(1, 1, 44100);
  void Promise.all(
    CLIPS.map(async (name) => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}sounds/${name}.mp3`);
        if (!res.ok) return null;
        return await decoder.decodeAudioData(await res.arrayBuffer());
      } catch {
        return null;
      }
    }),
  ).then((decoded) => {
    clips = decoded;
  });
}

/** Play recorded quack `i` if it's loaded; false means use the synth. */
function playClip(ac: AudioContext, dest: AudioNode, i: number, rate: number, volume: number): boolean {
  const buffer = clips[i];
  if (!buffer) return false;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate;
  const gain = ac.createGain();
  gain.gain.value = volume;
  src.connect(gain).connect(dest);
  src.start();
  voiceStarted(buffer.duration / rate);
  return true;
}

// --- synthesised quack (stand-in) ---------------------------------------------

type QuackVoice = {
  /** 1 = an ordinary duck; higher is a younger, squeakier one. */
  pitch?: number;
  /** Seconds. */
  length?: number;
  volume?: number;
};

let noise: AudioBuffer | null = null;
function noiseBuffer(ac: BaseAudioContext): AudioBuffer {
  if (noise && noise.sampleRate === ac.sampleRate) return noise;
  const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * 0.05), ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noise = buf;
  return buf;
}

/**
 * One "kwaak". A real quack is a buzzy, raspy voice whose vowel opens from
 * "w" to a nasal "aa": so a pair of detuned saws (with a growly sub an
 * octave down) at ~280 Hz, pitch rising then sagging, through three formant
 * band-passes sweeping from "w" (low, close together) to "aa" (wide apart)
 * plus a nasal edge, wobbled in volume at ~50 Hz for the rasp, with a tiny
 * click of breath at the start.
 */
export function quackVoice(
  ac: BaseAudioContext,
  dest: AudioNode,
  t: number,
  { pitch = 1, length = 0.2, volume = 0.16 }: QuackVoice = {},
) {
  const end = t + length;

  const env = ac.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(volume, t + 0.012);
  env.gain.setValueAtTime(volume, t + length * 0.5);
  env.gain.exponentialRampToValueAtTime(0.0001, end);
  env.connect(dest);

  // The rasp: a fast wobble in loudness.
  const rasp = ac.createGain();
  rasp.gain.value = 0.7;
  const lfo = ac.createOscillator();
  lfo.frequency.value = 52 * pitch;
  const depth = ac.createGain();
  depth.gain.value = 0.3;
  lfo.connect(depth).connect(rasp.gain);
  rasp.connect(env);

  // The vowel: formants opening from "w" to "aa", then easing back.
  const mix = ac.createGain();
  mix.gain.value = 1.3; // about as loud as the old honk
  mix.connect(rasp);
  const shift = Math.sqrt(pitch);
  const formants: [number, number, number, number, number][] = [
    // from, open, close, Q, level
    [420, 950, 760, 5, 1],
    [900, 1500, 1250, 7, 0.75],
    [2500, 2900, 2700, 9, 0.3], // the nasal edge
  ];
  const filters = formants.map(([from, open, close, q, level]) => {
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = q;
    bp.frequency.setValueAtTime(from * shift, t);
    bp.frequency.linearRampToValueAtTime(open * shift, t + Math.min(0.06, length * 0.3));
    bp.frequency.linearRampToValueAtTime(close * shift, end);
    const g = ac.createGain();
    g.gain.value = level;
    bp.connect(g).connect(mix);
    return bp;
  });

  // The voice: buzzy, a little rough, pitch up then sagging.
  const f0 = 280 * pitch;
  const voices: [OscillatorType, number, number, number][] = [
    // type, frequency multiple, detune (cents), level
    ["sawtooth", 1, -9, 0.6],
    ["sawtooth", 1, 12, 0.6],
    ["square", 0.5, 0, 0.22],
  ];
  const oscs = voices.map(([type, mult, detune, level]) => {
    const osc = ac.createOscillator();
    osc.type = type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(f0 * mult * 0.9, t);
    osc.frequency.linearRampToValueAtTime(f0 * mult * 1.08, t + length * 0.25);
    osc.frequency.exponentialRampToValueAtTime(f0 * mult * 0.8, end);
    const g = ac.createGain();
    g.gain.value = level;
    osc.connect(g);
    for (const f of filters) g.connect(f);
    return osc;
  });

  // A breathy "k" to start it.
  const click = ac.createBufferSource();
  click.buffer = noiseBuffer(ac);
  const hp = ac.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1800;
  const clickGain = ac.createGain();
  clickGain.gain.setValueAtTime(volume * 0.9, t);
  clickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
  click.connect(hp).connect(clickGain).connect(dest);

  for (const node of [lfo, ...oscs]) {
    node.start(t);
    node.stop(end + 0.02);
  }
  click.start(t);
  click.stop(t + 0.03);
}

// --- playing them -------------------------------------------------------------

/** No two quacks quite alike. */
const vary = (amount: number) => 1 + (Math.random() * 2 - 1) * amount;
const pick = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

/** Sounds playing right now: a big crush mustn't pile up hundreds. */
let voices = 0;
const MAX_VOICES = 14;
function voiceStarted(seconds: number) {
  voices++;
  setTimeout(() => voices--, seconds * 1000 + 50);
}

/** Half volume this far from your duck (world units; a duck is ~1.3 long). */
const HEARING = 3;
/** Quieter than this isn't worth playing. */
const INAUDIBLE = 0.04;

export type DuckSound = "quack" | "bump" | "takeoff";

/**
 * A duck made a noise. `dx`/`dz` is where, relative to your duck (+x to the
 * right, +z toward the camera); leave them out for your own duck.
 */
export function playDuckSound(kind: DuckSound, where: { dx?: number; dz?: number } = {}) {
  const dx = where.dx ?? 0;
  const d = Math.hypot(dx, where.dz ?? 0);
  const near = 1 / (1 + (d / HEARING) ** 2);
  if (near < INAUDIBLE) return;
  // When it's crowded, only the nearer ducks get a voice.
  if (voices >= MAX_VOICES && near < 0.5) return;
  const ac = audio();
  if (!ac) return;
  const pan = ac.createStereoPanner();
  pan.pan.value = Math.max(-0.8, Math.min(0.8, dx / 6));
  pan.connect(ac.destination);

  const { clip, rate, volume, synth } = {
    // One of three quacks.
    quack: { clip: pick([0, 1, 2]), rate: vary(0.06), volume: 0.16, synth: { pitch: 1, length: 0.21 } },
    // Startled: a short one, a bit higher.
    bump: { clip: pick([1, 2, 3]), rate: 1.12 * vary(0.06), volume: 0.18, synth: { pitch: 1.15, length: 0.17 } },
    // Launched over the crowd: the big one.
    takeoff: { clip: 0, rate: 1.06 * vary(0.05), volume: 0.24, synth: { pitch: 1.05, length: 0.3 } },
  }[kind];
  if (playClip(ac, pan, clip, rate, volume * near)) return;
  quackVoice(ac, pan, ac.currentTime, {
    pitch: synth.pitch * rate,
    length: synth.length,
    volume: volume * near,
  });
  voiceStarted(synth.length);
}
