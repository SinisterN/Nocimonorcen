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
  /** File location without the _<n>.mp3 ending, when it isn't sounds/era1/<id> (e.g. 'era2/build'). */
  src?: string;
}

export const SFX = {
  // towers
  arrow_shot: { variants: 1, volume: 0.45, cooldown: 60, detune: 150, maxVoices: 4 },
  arrow_hit: { variants: 1, volume: 0.35, cooldown: 50, detune: 200, maxVoices: 4 },
  boomstick_shot: { variants: 1, volume: 0.55, cooldown: 110, detune: 80, maxVoices: 3 },
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
  // start screen buttons: a soft tick on hover, a solid wooden knock on press (stored with the shared sounds)
  menu_hover: { variants: 1, volume: 0.25, cooldown: 60, detune: 80, src: 'ui/menu_hover' },
  menu_select: { variants: 1, volume: 0.45, cooldown: 120, detune: 40, src: 'ui/menu_select' },
  // ---------- era 2 ----------
  e2_gun_shot: { variants: 1, volume: 0.32, cooldown: 90, detune: 120, maxVoices: 4, src: 'era2/mg_turret_shot' },
  e2_rocket_launch: { variants: 2, volume: 0.5, cooldown: 120, detune: 100, maxVoices: 3, src: 'era2/rocket_launch' },
  e2_rocket_explosion: { variants: 1, volume: 0.55, cooldown: 80, detune: 150, maxVoices: 3, src: 'era2/rocket_explosion' },
  e2_railgun: { variants: 3, volume: 0.55, cooldown: 150, detune: 60, maxVoices: 2, src: 'era2/railgun_fire' },
  e2_build: { variants: 1, volume: 0.6, detune: 60, src: 'era2/build' },
  e2_repair: { variants: 1, volume: 0.55, src: 'era2/repair' },
  e2_structure_hit: { variants: 1, volume: 0.45, cooldown: 120, detune: 150, maxVoices: 3, src: 'era2/structure_hit' },
  e2_tower_destroyed: { variants: 2, volume: 0.65, src: 'era2/tower_destroyed' },
  e2_robot_gunfire: { variants: 2, volume: 0.35, cooldown: 300, detune: 120, maxVoices: 3, src: 'era2/robot_gunfire' },
  e2_robot_death: { variants: 1, volume: 0.45, cooldown: 60, detune: 200, maxVoices: 4, src: 'era2/robot_death' },
  e2_droid_beep: { variants: 1, volume: 0.4, cooldown: 200, detune: 100, maxVoices: 3, src: 'era2/droid_beep' },
  e2_droid_explode: { variants: 2, volume: 0.5, cooldown: 60, detune: 150, maxVoices: 3, src: 'era2/droid_explode' },
  e2_walker_stomp: { variants: 2, volume: 0.3, cooldown: 350, detune: 100, maxVoices: 2, src: 'era2/walker_stomp' },
  e2_walker_rocket: { variants: 1, volume: 0.5, cooldown: 200, detune: 100, maxVoices: 2, src: 'era2/walker_rocket' },
  e2_walker_death: { variants: 1, volume: 0.6, cooldown: 80, detune: 100, maxVoices: 2, src: 'era2/walker_death' },
  e2_factory_spawn: { variants: 1, volume: 0.55, src: 'era2/factory_spawn' },
  e2_base_hit: { variants: 1, volume: 0.65, cooldown: 250, detune: 100, src: 'era2/base_hit' },
  e2_wave_clear: { variants: 1, volume: 0.6, src: 'era2/wave_clear' },
  e2_victory: { variants: 1, volume: 0.7, src: 'era2/victory' },
  e2_defeat: { variants: 1, volume: 0.7, src: 'era2/defeat' },
  // ---------- era 3 (variants are set when the picked takes are installed: tools/era3/build_audio.py) ----------
  e3_rifle_shot: { variants: 1, volume: 0.35, cooldown: 90, detune: 120, maxVoices: 4, src: 'era3/rifle_shot' },
  e3_ballista_shot: { variants: 1, volume: 0.55, cooldown: 120, detune: 80, maxVoices: 3, src: 'era3/ballista_shot' },
  e3_bolt_hit: { variants: 1, volume: 0.4, cooldown: 60, detune: 150, maxVoices: 3, src: 'era3/bolt_hit' },
  e3_grapple_fire: { variants: 1, volume: 0.4, cooldown: 120, detune: 120, maxVoices: 3, src: 'era3/grapple_fire' },
  e3_swing_whoosh: { variants: 1, volume: 0.35, cooldown: 150, detune: 150, maxVoices: 3, src: 'era3/swing_whoosh' },
  e3_blade_slash: { variants: 1, volume: 0.45, cooldown: 80, detune: 150, maxVoices: 4, src: 'era3/blade_slash' },
  e3_swat_hit: { variants: 1, volume: 0.55, cooldown: 150, detune: 100, maxVoices: 2, src: 'era3/swat_hit' },
  e3_lance_fire: { variants: 1, volume: 0.55, cooldown: 200, detune: 80, maxVoices: 2, src: 'era3/lance_fire' },
  e3_lance_explosion: { variants: 1, volume: 0.6, cooldown: 100, detune: 120, maxVoices: 3, src: 'era3/lance_explosion' },
  e3_titan_groan: { variants: 1, volume: 0.35, cooldown: 1200, detune: 200, maxVoices: 2, src: 'era3/titan_groan' },
  e3_titan_footstep: { variants: 1, volume: 0.35, cooldown: 400, detune: 100, maxVoices: 2, src: 'era3/titan_footstep' },
  e3_titan_death: { variants: 1, volume: 0.55, cooldown: 80, detune: 120, maxVoices: 3, src: 'era3/titan_death' },
  e3_brawler_roar: { variants: 1, volume: 0.5, cooldown: 800, detune: 100, maxVoices: 2, src: 'era3/brawler_roar' },
  e3_rock_throw: { variants: 1, volume: 0.5, cooldown: 300, detune: 100, maxVoices: 2, src: 'era3/rock_throw' },
  e3_rock_impact: { variants: 1, volume: 0.55, cooldown: 150, detune: 100, maxVoices: 2, src: 'era3/rock_impact' },
  e3_charge_impact: { variants: 1, volume: 0.65, cooldown: 200, detune: 80, maxVoices: 2, src: 'era3/charge_impact' },
  e3_build: { variants: 1, volume: 0.6, detune: 80, src: 'era3/build' },
  e3_repair: { variants: 1, volume: 0.55, src: 'era3/repair' },
  e3_structure_hit: { variants: 1, volume: 0.45, cooldown: 120, detune: 150, maxVoices: 3, src: 'era3/structure_hit' },
  e3_tower_destroyed: { variants: 1, volume: 0.65, src: 'era3/tower_destroyed' },
  e3_base_hit: { variants: 1, volume: 0.65, cooldown: 250, detune: 100, src: 'era3/base_hit' },
  e3_wave_start: { variants: 1, volume: 0.6, src: 'era3/wave_start' },
  e3_boss_roar: { variants: 1, volume: 0.7, src: 'era3/boss_roar' },
  e3_steam_hiss: { variants: 1, volume: 0.4, cooldown: 200, detune: 150, maxVoices: 3, src: 'era3/steam_hiss' },
  e3_wave_clear: { variants: 1, volume: 0.6, src: 'era3/wave_clear' },
  e3_victory: { variants: 1, volume: 0.7, src: 'era3/victory' },
  e3_defeat: { variants: 1, volume: 0.7, src: 'era3/defeat' },
} satisfies Record<string, SoundDef>;

export type SfxId = keyof typeof SFX;

/** Music loops: one for the build phase between waves, one for the fighting. */
export const MUSIC = {
  music_build: { available: true, volume: 0.45 },
  music_wave: { available: true, volume: 0.45 },
  e2_music_build: { available: true, volume: 0.5, src: 'era2/music_build' },
  e2_music_wave: { available: true, volume: 0.45, src: 'era2/music_wave' },
  e3_music_build: { available: true, volume: 0.5, src: 'era3/music_build' },
  e3_music_wave: { available: true, volume: 0.45, src: 'era3/music_wave' },
} as Record<string, { available: boolean; volume: number; src?: string }>;
export type MusicId = 'music_build' | 'music_wave' | 'e2_music_build' | 'e2_music_wave' | 'e3_music_build' | 'e3_music_wave';

/**
 * Hero voice lines that have a recording, by line id (see hero.ts: "<event>_<n>", e.g. "kill_3").
 * Files: sounds/<era>/voice/<id>.mp3. Lines without a recording are shown as text only.
 */
/**
 * Hero voice recordings that exist, per era (ids as in hero.ts: "kill_1" in era 1, "e2_kill_1" in era 2...).
 * The file is sounds/<era>/voice/<id without the eN_ prefix>.mp3. A line without a recording still shows its bubble.
 */
const EVENTS_N: [string, number][] = [['towerBuilt', 4], ['kill', 5], ['baseHit', 4], ['waveStart', 3], ['waveCleared', 3], ['towerSold', 2]];
const allLines = (prefix: string) => EVENTS_N.flatMap(([e, n]) => Array.from({ length: n }, (_, i) => `${prefix}${e}_${i + 1}`));
export const VOICE_LINES: Record<string, string[]> = {
  era1: allLines(''),
  era2: ['e2_baseHit_1', 'e2_baseHit_2', 'e2_baseHit_3', 'e2_kill_1', 'e2_kill_2', 'e2_kill_3', 'e2_kill_4', 'e2_kill_5', 'e2_towerBuilt_1', 'e2_towerBuilt_2', 'e2_towerBuilt_3', 'e2_towerBuilt_4', 'e2_towerSold_1', 'e2_towerSold_2', 'e2_waveCleared_1', 'e2_waveCleared_2', 'e2_waveStart_1', 'e2_waveStart_2', 'e2_waveStart_3'],
  era3: ['e3_baseHit_2', 'e3_baseHit_3', 'e3_baseHit_4', 'e3_kill_1', 'e3_kill_3', 'e3_kill_4', 'e3_kill_5', 'e3_towerBuilt_1', 'e3_towerBuilt_3', 'e3_towerBuilt_4', 'e3_towerSold_1', 'e3_towerSold_2', 'e3_waveCleared_1', 'e3_waveCleared_2', 'e3_waveCleared_3', 'e3_waveStart_2', 'e3_waveStart_3'],
};
/** While the hero talks, music and effects drop to this share of their volume. */
const DUCK = 0.45;

const ERA = 'era1';
const key = (id: string, n: number) => `sfx_${id}_${n}`;
const file = (id: string, n: number, src?: string) => `sounds/${src ?? `${ERA}/${id}`}_${n}.mp3`;

/** Loads the sounds; an era's own sounds (src 'eraN/...') load only for that era when one is given. */
export function preloadAudio(scene: Phaser.Scene, era?: string) {
  // shared sounds (no src, or a src outside any era folder such as 'ui/...') load everywhere
  const mine = (src?: string) => !era || !src || !/^era\d/.test(src) || src.startsWith(`${era}/`);
  for (const [id, def] of Object.entries(SFX) as [string, SoundDef][]) {
    if (!mine(def.src)) continue;
    for (let n = 1; n <= def.variants; n++) scene.load.audio(key(id, n), file(id, n, def.src));
  }
  for (const [e, ids] of Object.entries(VOICE_LINES)) {
    if (era && e !== era) continue;
    for (const id of ids) scene.load.audio(`voice_${id}`, `sounds/${e}/voice/${id.replace(/^e\d_/, '')}.mp3`);
  }
  for (const [id, def] of Object.entries(MUSIC)) {
    if (def.available && mine(def.src)) scene.load.audio(`music_${id}`, `sounds/${def.src ?? `${ERA}/${id}`}.mp3`);
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
  /** Is there at least one file for this sound? */
  has(id: SfxId) { return SFX[id].variants > 0; }

  play(id: SfxId, opts: { x?: number; volume?: number; whenUnlocked?: boolean } = {}) {
    const scene = this.scene;
    const def: SoundDef = SFX[id];
    if (!scene || def.variants === 0 || this.settings.muted) return;
    // before the browser lets audio play (the very first click), a press is held until it does; hovers are dropped
    if (scene.sound.locked) { if (opts.whenUnlocked) scene.sound.once('unlocked', () => this.play(id, opts)); return; }
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
    return !!this.scene?.cache.audio.exists(`voice_${lineId}`);
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
