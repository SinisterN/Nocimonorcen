// What each era looks and sounds like. Gameplay data (road, plots, towers, enemies, waves) lives in config.ts and
// is switched with setEra(); this file holds the matching art, sounds, music and atmosphere.
import { EraId, ERA_ID } from './config';
import type { MusicId, SfxId } from './audio';
import type { ATMOSPHERE } from './atmosphere';
import type { SpriteName } from './sprites';

export interface EraLook {
  map: SpriteName;
  /** Building the enemies come out of (at the first waypoint) and the one they attack (at the last). */
  start: SpriteName;
  end: SpriteName;
  /** Grid offset of the start building from the first waypoint (it sits just behind the road's start). */
  startOffset: [number, number];
  /** The end building puffs chimney smoke (the era 1 cabin). */
  endSmoke: boolean;
  plot: SpriteName;
  plotHigh: SpriteName;
  /** The map painting already shows the start and end buildings and the build plots: the game draws neither. */
  painted?: boolean;
  /** Scenery families the level editor offers. */
  editorPalette: SpriteName[];
  atmosphere: Partial<typeof ATMOSPHERE>;
  /** Name of what the player defends, for messages. */
  baseName: string;
  /** Defeat line when enemies reach the base. */
  lostLine: string;
  music: { build: MusicId; wave: MusicId };
  sfx: {
    build: SfxId; upgrade: SfxId; baseHit: SfxId; waveStart: SfxId; waveClear: SfxId; victory: SfxId; defeat: SfxId;
    explosion: SfxId;
    shot: Record<string, SfxId>;
    death: Record<string, SfxId>;
    /** Sound when an enemy of this kind appears (played sparingly). */
    spawn: Record<string, SfxId | undefined>;
  };
}

const ERA1: EraLook = {
  map: 'map_ground', start: 'crypt', end: 'cabin', startOffset: [0, -0.6], endSmoke: true,
  plot: 'plot', plotHigh: 'plot_high',
  editorPalette: ['tree_1', 'tree_2', 'tree_3', 'tree_4', 'bush_1', 'bush_2', 'bush_3', 'rock_1', 'rock_2'],
  atmosphere: { duskTint: 0xb3a6d6, duskAlpha: 0.55, fogColor: 0xc9c2ee, fogAlpha: 0.16, wispColors: [0xffa53a, 0x9dff7a, 0xffd36e], vignetteAlpha: 0.55 },
  baseName: 'cabin', lostLine: 'The deadites got to the cabin.',
  music: { build: 'music_build', wave: 'music_wave' },
  sfx: {
    build: 'build', upgrade: 'upgrade', baseHit: 'base_hit', waveStart: 'wave_start', waveClear: 'wave_clear',
    victory: 'victory', defeat: 'defeat', explosion: 'explosion',
    shot: { arrow: 'arrow_shot', mg: 'boomstick_shot', mortar: 'bombard_shot' },
    death: { grunt: 'zombie_death', fast: 'crawler_death', armored: 'knight_death', shaman: 'zombie_death', brute: 'knight_death' },
    spawn: { grunt: 'zombie_groan', fast: 'crawler_screech', armored: undefined, shaman: 'zombie_groan', brute: 'zombie_groan' },
  },
};

const ERA2: EraLook = {
  map: 'map_ground_e2', start: 'e2_factory', end: 'e2_police', startOffset: [0, -0.9], endSmoke: false,
  plot: 'e2_plot', plotHigh: 'e2_plot_high',
  editorPalette: ['e2_prop_skulls', 'e2_prop_searchlight', 'e2_prop_wreck', 'e2_prop_rubble', 'e2_prop_pit'],
  // cold night grade, grey smoke instead of mist, drifting embers instead of will-o'-wisps
  atmosphere: {
    duskTint: 0x9aa4c8, duskAlpha: 0.42, fogColor: 0x8c8c96, fogAlpha: 0.14, wispColors: [], vignetteAlpha: 0.6,
    wisps: 0, embers: 46,
    // the fires painted on the map: burning cars, barrels and debris
    emberSources: [[655, 118], [1042, 168], [1100, 465], [1030, 592], [250, 395], [415, 185], [490, 158], [975, 580]],
  },
  baseName: 'police station', lostLine: 'The machines overran the police station.',
  music: { build: 'e2_music_build', wave: 'e2_music_wave' },
  sfx: {
    build: 'e2_build', upgrade: 'e2_build', baseHit: 'e2_base_hit', waveStart: 'e2_factory_spawn', waveClear: 'e2_wave_clear',
    victory: 'e2_victory', defeat: 'e2_defeat', explosion: 'e2_rocket_explosion',
    shot: { gun: 'e2_gun_shot', rocket: 'e2_rocket_launch', rail: 'e2_railgun' },
    death: { robot: 'e2_robot_death', droid: 'e2_droid_explode', walker: 'e2_walker_death', shield: 'e2_robot_death', tank: 'e2_walker_death' },
    spawn: { robot: undefined, droid: 'e2_droid_beep', walker: 'e2_walker_stomp', shield: undefined, tank: 'e2_walker_stomp' },
  },
};

// Era 3 has no sounds of its own yet (audio is the last sign-off gate): it borrows Era 1 and 2 sounds until then.
const ERA3: EraLook = {
  map: 'map_ground_e3', start: 'crypt', end: 'cabin', startOffset: [0, 0], endSmoke: false, painted: true,
  plot: 'plot', plotHigh: 'plot_high',
  editorPalette: [],
  // a smoky dusk over the burning village: warm grade, drifting smoke, embers from the painted fires
  atmosphere: {
    duskTint: 0xd8b8a0, duskAlpha: 0.32, fogColor: 0x9a8f86, fogAlpha: 0.12, wispColors: [], vignetteAlpha: 0.5,
    wisps: 0, embers: 40,
    emberSources: [[327, 100], [520, 262], [864, 171], [133, 473], [997, 613], [1190, 245]],
  },
  baseName: 'chapel', lostLine: 'The titans reached the chapel.',
  music: { build: 'music_build', wave: 'e2_music_wave' },
  sfx: {
    build: 'build', upgrade: 'upgrade', baseHit: 'base_hit', waveStart: 'wave_start', waveClear: 'wave_clear',
    victory: 'victory', defeat: 'defeat', explosion: 'e2_rocket_explosion',
    shot: { rifle: 'e2_gun_shot', ballista: 'arrow_shot', killer: 'arrow_shot' },
    death: { titan_s: 'zombie_death', titan_m: 'zombie_death', brawler: 'knight_death', wallwalker: 'e2_walker_death', colossus: 'e2_walker_death' },
    spawn: { titan_s: 'zombie_groan', titan_m: 'zombie_groan', brawler: undefined, wallwalker: 'e2_walker_stomp', colossus: 'e2_walker_stomp' },
  },
};

const LOOKS: Record<EraId, EraLook> = { era1: ERA1, era2: ERA2, era3: ERA3 };

/** The look of the era set with setEra(). */
export function eraLook(): EraLook { return LOOKS[ERA_ID]; }
