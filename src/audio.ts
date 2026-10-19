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
  boomstick_pump: { variants: 1, volume: 0.4, cooldown: 80, detune: 80, maxVoices: 3 },
  shell_drop: { variants: 1, volume: 0.25, cooldown: 60, detune: 250, maxVoices: 3 },
  bombard_shot: { variants: 1, volume: 0.6, cooldown: 120, detune: 100, maxVoices: 3 },
  explosion: { variants: 1, volume: 0.6, cooldown: 80, detune: 150, maxVoices: 3 },
  hellfire: { variants: 1, volume: 0.35, cooldown: 400, detune: 100, maxVoices: 2 },
  // building
  build: { variants: 1, volume: 0.6, detune: 80 },
  upgrade: { variants: 1, volume: 0.6 },
  sell: { variants: 1, volume: 0.55 },
  // enemies
  zombie_groan: { variants: 1, volume: 0.35, cooldown: 900, detune: 250, maxVoices: 2 },
  zombie_death: { variants: 1, volume: 0.45, cooldown: 60, detune: 200, maxVoices: 4 },
  crawler_screech: { variants: 1, volume: 0.35, cooldown: 1200, detune: 200, maxVoices: 2 },
  crawler_death: { variants: 1, volume: 0.45, cooldown: 60, detune: 200, maxVoices: 3 },
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

/**
 * Hero voice lines that have a recording, by line id (see hero.ts: "<event>_<n>", e.g. "kill_3").
 * Files: sounds/<era>/voice/<id>.mp3. Lines without a recording are shown as text only.
 */
export const VOICE_LINES: string[] = [
  'towerBuilt_1',
  'towerBuilt_2',
  'towerBuilt_3',
  'towerBuilt_4',
  'kill_1',
  'kill_2',
  'kill_3',
  'kill_4',
  'kill_5',
  'baseHit_1',
  'baseHit_2',
  'baseHit_3',
  'baseHit_4',
  'waveStart_1',
  'waveStart_2',
  'waveStart_3',
  'waveCleared_1',
  'waveCleared_2',
  'waveCleared_3',
  'towerSold_1',
  'towerSold_2',
];
/** While the hero talks, music and effects drop to this share of their volume. */
const DUCK = 0.45;

const ERA = 'era1';
const key = (id: string, n: number) => `sfx_${id}_${n}`;
const file = (id: string, n: number) => `sounds/${ERA}/${id}_${n}.mp3`;

export function preloadAudio(scene: Phaser.Scene) {
  for (const [id, def] of Object.entries(SFX) as [string, SoundDef][]) {
    for (let n = 1; n <= def.variants; n++) scene.load.audio(key(id, n), file(id, n));
  }
  for (const id of VOICE_LINES) scene.load.audio(`voice_${id}`, `sounds/${ERA}/voice/${id}.mp3`);
  for (const [id, def] of Object.entries(MUSIC)) {
    if (def.available) scene.load.audio(`music_${id}`, `sounds/${ERA}/${id}.mp3`);
  }
}

// ---------- settings (remembered in this browser) ----------
interface AudioSettings { sfx: number; music: number; voice: number; muted: boolean }
const STORE = 'nocimonorcen.audio';
function loadSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) return { sfx: 0.8, music: 0.6, voice: 1, muted: false, ...JSON.parse(raw) };
  } catch { /* storage blocked: use defaults */ }
  return { sfx: 0.8, music: 0.6, voice: 1, muted: false };
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
  private voice: Phaser.Sound.BaseSound | null = null;
  /** 1 normally, DUCK while the hero is talking. */
  private duck = 1;

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
    const snd = scene.sound.add(key(id, n), { volume: def.volume * (opts.volume ?? 1) * this.settings.sfx * this.duck, detune });
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
    scene.tweens.add({ targets: m, volume: def.volume * this.settings.music * this.duck, duration: 1200 });
    this.music = m;
  }

  /** Sets the effects, music or voice volume (0..1). Music changes immediately; the others apply from the next sound. */
  setVolume(kind: 'sfx' | 'music' | 'voice', value: number) {
    this.settings[kind] = Phaser.Math.Clamp(value, 0, 1);
    if (kind === 'music') this.applyMusicVolume(0);
    this.save();
  }

  hasVoice(lineId: string) {
    return VOICE_LINES.includes(lineId) && !!this.scene?.cache.audio.exists(`voice_${lineId}`);
  }

  /**
   * Plays a hero voice line (cutting off the previous one) and ducks music and effects while it runs.
   * Returns the line's length in ms, or 0 when there is no recording.
   */
  playVoice(lineId: string): number {
    const scene = this.scene;
    if (!scene || this.settings.muted || !this.hasVoice(lineId)) return 0;
    this.voice?.stop();
    this.voice?.destroy();
    const v = scene.sound.add(`voice_${lineId}`, { volume: this.settings.voice });
    this.voice = v;
    this.setDuck(DUCK);
    v.once('complete', () => {
      if (this.voice === v) { this.voice = null; this.setDuck(1); }
      v.destroy();
    });
    v.play();
    return ((v as Phaser.Sound.WebAudioSound).duration || 2) * 1000;
  }

  private setDuck(level: number) {
    this.duck = level;
    this.applyMusicVolume(level < 1 ? 150 : 600);
  }

  private applyMusicVolume(fadeMs: number) {
    if (!this.music || !this.musicId || !this.scene) return;
    const target = MUSIC[this.musicId].volume * this.settings.music * this.duck;
    this.scene.tweens.killTweensOf(this.music);
    if (fadeMs > 0) this.scene.tweens.add({ targets: this.music, volume: target, duration: fadeMs });
    else (this.music as Phaser.Sound.WebAudioSound).setVolume(target);
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
