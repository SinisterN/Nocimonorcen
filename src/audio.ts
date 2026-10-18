// Sound effects and music.
// Every sound is a named event with one or more variant files: sounds/<era>/<id>_<n>.mp3 (n = 1..variants).
// A sound with variants: 0 has no files yet and plays nothing, so the game runs silent until files are added.
import Phaser from 'phaser';

export interface SoundDef {
  /** How many variant files exist (picked at random each time). 0 = not generated yet. */
  variants: number;
  /** Base volume, 0..1. */
  volume: number;
  /** Minimum time between two plays of this sound, in ms (keeps rapid fire from stacking into noise). */
  cooldown?: number;
  /** Random pitch spread in cents (100 = a semitone), so repeats don't sound identical. */
  detune?: number;
  /** Most copies of this sound allowed to play at once. */
  maxVoices?: number;
}

export const SFX = {
  // towers
  arrow_shot: { variants: 1, volume: 0.45, cooldown: 60, detune: 150, maxVoices: 4 },
  arrow_hit: { variants: 1, volume: 0.35, cooldown: 50, detune: 200, maxVoices: 4 },
  boomstick_shot: { variants: 1, volume: 0.4, cooldown: 110, detune: 120, maxVoices: 3 },
  bombard_shot: { variants: 1, volume: 0.6, cooldown: 120, detune: 100, maxVoices: 3 },
  explosion: { variants: 1, volume: 0.6, cooldown: 80, detune: 150, maxVoices: 3 },
  hellfire: { variants: 1, volume: 0.35, cooldown: 400, detune: 100, maxVoices: 2 },
  // building
  build: { variants: 1, volume: 0.6, detune: 80 },
  upgrade: { variants: 0, volume: 0.6 },
  sell: { variants: 1, volume: 0.55 },
  // enemies
  zombie_groan: { variants: 1, volume: 0.35, cooldown: 900, detune: 250, maxVoices: 2 },
  zombie_death: { variants: 1, volume: 0.45, cooldown: 60, detune: 200, maxVoices: 4 },
  crawler_screech: { variants: 1, volume: 0.35, cooldown: 1200, detune: 200, maxVoices: 2 },
  crawler_death: { variants: 0, volume: 0.45, cooldown: 60, detune: 200, maxVoices: 3 },
  knight_death: { variants: 1, volume: 0.55, cooldown: 80, detune: 120, maxVoices: 3 },
  coin: { variants: 1, volume: 0.25, cooldown: 70, detune: 300, maxVoices: 3 },
  // the cabin and the flow of a map
  base_hit: { variants: 1, volume: 0.65, cooldown: 250, detune: 100 },
  wave_start: { variants: 1, volume: 0.6 },
  wave_clear: { variants: 1, volume: 0.6 },
  victory: { variants: 1, volume: 0.7 },
  defeat: { variants: 1, volume: 0.7 },
  // interface
  click: { variants: 1, volume: 0.4, cooldown: 40, detune: 60 },
  denied: { variants: 1, volume: 0.45, cooldown: 300 },
} satisfies Record<string, SoundDef>;

export type SfxId = keyof typeof SFX;

/** Music loops: one for the build phase between waves, one for the fighting. */
export const MUSIC = {
  music_build: { available: true, volume: 0.45 },
  music_wave: { available: true, volume: 0.45 },
};
export type MusicId = keyof typeof MUSIC;

const ERA = 'era1';
const key = (id: string, n: number) => `sfx_${id}_${n}`;
const file = (id: string, n: number) => `sounds/${ERA}/${id}_${n}.mp3`;

export function preloadAudio(scene: Phaser.Scene) {
  for (const [id, def] of Object.entries(SFX) as [string, SoundDef][]) {
    for (let n = 1; n <= def.variants; n++) scene.load.audio(key(id, n), file(id, n));
  }
  for (const [id, def] of Object.entries(MUSIC)) {
    if (def.available) scene.load.audio(`music_${id}`, `sounds/${ERA}/${id}.mp3`);
  }
}

// ---------- settings (remembered in this browser) ----------
interface AudioSettings { sfx: number; music: number; muted: boolean }
const STORE = 'nocimonorcen.audio';
function loadSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) return { sfx: 0.8, music: 0.6, muted: false, ...JSON.parse(raw) };
  } catch { /* storage blocked: use defaults */ }
  return { sfx: 0.8, music: 0.6, muted: false };
}

/**
 * One shared player for the whole game (lives across map restarts so the music keeps going).
 * Call `audio.attach(scene)` from each scene's create().
 */
class AudioPlayer {
  settings = loadSettings();
  private scene: Phaser.Scene | null = null;
  private lastPlayed = new Map<string, number>();
  private voices = new Map<string, Phaser.Sound.BaseSound[]>();
  private music: Phaser.Sound.BaseSound | null = null;
  private musicId: MusicId | null = null;

  attach(scene: Phaser.Scene) {
    this.scene = scene;
    this.voices.clear();
    scene.sound.mute = this.settings.muted;
  }

  /**
   * Plays a sound effect. `x` is the screen position it comes from, used for a gentle left/right pan.
   * Silently does nothing when the sound has no files yet.
   */
  play(id: SfxId, opts: { x?: number; volume?: number } = {}) {
    const scene = this.scene;
    const def: SoundDef = SFX[id];
    if (!scene || def.variants === 0 || this.settings.muted) return;
    const now = scene.time.now;
    if (def.cooldown && now - (this.lastPlayed.get(id) ?? -1e9) < def.cooldown) return;
    const playing = (this.voices.get(id) ?? []).filter(s => s.isPlaying);
    if (def.maxVoices && playing.length >= def.maxVoices) return;
    const n = 1 + Math.floor(Math.random() * def.variants);
    if (!scene.cache.audio.exists(key(id, n))) return;
    this.lastPlayed.set(id, now);
    const pan = opts.x === undefined ? 0 : Phaser.Math.Clamp((opts.x / scene.scale.width) * 2 - 1, -1, 1) * 0.6;
    const detune = def.detune ? (Math.random() * 2 - 1) * def.detune : 0;
    const snd = scene.sound.add(key(id, n), { volume: def.volume * (opts.volume ?? 1) * this.settings.sfx, detune });
    if ('setPan' in snd) (snd as Phaser.Sound.WebAudioSound).setPan(pan);
    snd.once('complete', () => snd.destroy());
    snd.play();
    playing.push(snd);
    this.voices.set(id, playing);
  }

  /** Switches to a music loop with a short crossfade. Does nothing if that loop is already playing. */
  playMusic(id: MusicId) {
    const scene = this.scene;
    if (!scene || this.musicId === id) return;
    const def = MUSIC[id];
    const k = `music_${id}`;
    const old = this.music;
    if (old) scene.tweens.add({ targets: old, volume: 0, duration: 1200, onComplete: () => old.destroy() });
    this.music = null;
    this.musicId = id;
    if (!def.available || !scene.cache.audio.exists(k)) return;
    const m = scene.sound.add(k, { loop: true, volume: 0 });
    m.play();
    scene.tweens.add({ targets: m, volume: def.volume * this.settings.music, duration: 1200 });
    this.music = m;
  }

  toggleMute() {
    this.settings.muted = !this.settings.muted;
    if (this.scene) this.scene.sound.mute = this.settings.muted;
    this.save();
    return this.settings.muted;
  }

  private save() {
    try { localStorage.setItem(STORE, JSON.stringify(this.settings)); } catch { /* not saved: fine */ }
  }
}

export const audio = new AudioPlayer();
