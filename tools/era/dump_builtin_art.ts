import { SPRITES, TOWER_SPRITES, GUN_MUZZLE } from '../../src/sprites';
const S: any = SPRITES;
const towers: any = {}, enemies: any = {};
for (const [k, names] of Object.entries(TOWER_SPRITES)) towers[k] = { levels: (names as string[]).map(n => ({ name: n, origin: S[n].origin, display: S[n].display })), muzzle: (GUN_MUZZLE as any)[k] ?? null };
for (const [n, m] of Object.entries(S)) if (n.startsWith('enemy_')) enemies[n.slice(6)] = { origin: (m as any).origin, display: (m as any).display, facesLeft: !!(m as any).facesLeft };
console.log(JSON.stringify({ towers, enemies }));
