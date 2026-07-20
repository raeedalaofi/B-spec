// Builds the four production manifests (P0..P3) from the game's own data
// files, so every prompt matches a real car, track, part or achievement.
// Run: npx tsx scripts/art/buildManifests.ts
// Output: scripts/art/manifests/p{0..3}.json

import { mkdirSync, writeFileSync } from 'node:fs';
import { CARS } from '../../src/data/cars';
import { TRACK_DEFS } from '../../src/data/tracks';
import { ACHIEVEMENTS } from '../../src/state/achievements';
import { PARTS, PART_CATEGORIES } from '../../src/data/parts';
import { LICENSES } from '../../src/data/licenses';
import { AI_DRIVERS } from '../../src/data/aidrivers';

const STYLE =
  'professional game asset, classic 2000s racing game broadcast aesthetic, deep navy and gold palette';
const NEG =
  'text, watermark, logo, letters, numbers, signature, frame, border, cartoon, anime, low-poly, blurry, oversaturated, deformed, brand logo, manufacturer badge, sponsor logos, emblem of real brand';
const NEG_CAR = NEG + ', extra wheels';

interface Entry {
  id: string;
  out: string;
  modelSlot: 'photo' | 'transparent' | 'texture' | 'vector';
  width: number;
  height: number;
  alpha: 'native' | 'remove-bg' | 'opaque';
  prompt: string;
  negative?: string;
}

// ---------------------------------------------------------------- cars

const CAR_DESC: Record<string, string> = {
  kestrel: 'compact 2000s Japanese economy hatchback',
  vulpe: 'sporty 2000s European three-door hot hatch',
  taro: 'sleek 2000s Japanese sport compact coupe',
  falcon: '2000s Japanese turbocharged sports sedan with subtle rear wing',
  serval: 'lightweight 2000s Japanese two-seater roadster, soft top down',
  kite: '2000s Japanese AWD rally homologation turbo coupe with hood scoop',
  phantom: 'wide-body 2000s Japanese flagship super coupe race car, very low and aggressive stance',
  arrow: 'open-cockpit endurance racing prototype car with large rear wing and covered wheels',
};

const COLOR_NAME: Record<string, string> = {
  kestrel: 'medium steel blue',
  vulpe: 'bright rally red',
  taro: 'warm champagne gold',
  falcon: 'deep royal blue',
  serval: 'racing green',
  kite: 'vivid violet',
  phantom: 'gloss black',
  arrow: 'pearl white and silver',
};

function carEntries(): Entry[] {
  const out: Entry[] = [];
  for (const car of Object.values(CARS)) {
    const desc = `${CAR_DESC[car.id]}, ${COLOR_NAME[car.id]} ${car.color} paint, completely debadged with no manufacturer emblem and no license plate`;
    out.push({
      id: `car-studio-${car.id}`,
      out: `public/assets/cars/${car.id}-studio.png`,
      modelSlot: 'photo',
      width: 1408,
      height: 896,
      alpha: 'remove-bg',
      prompt: `${STYLE}, ${desc}, three-quarter front studio shot, soft key light with subtle gold rim light, plain light gray studio background, clean showroom quality`,
      negative: NEG_CAR,
    });
    out.push({
      id: `car-topdown-${car.id}`,
      out: `public/assets/cars/${car.id}-topdown.png`,
      modelSlot: 'photo',
      width: 512,
      height: 1024,
      alpha: 'remove-bg',
      prompt: `orthographic top-down view of a ${desc}, nose pointing up, full car visible and centered, even neutral overhead lighting, crisp silhouette, video game sprite, plain white background`,
      negative: NEG_CAR,
    });
  }
  return out;
}

// -------------------------------------------------------------- tracks

const BIOMES: Record<string, string> = {
  meadow: 'green countryside meadow grass with small wildflowers',
  'forest-mountain': 'alpine forest floor, pine needles and mossy rock',
  speedway: 'trimmed infield lawn with dry patches, american speedway',
  city: 'urban concrete and paving stones, city street surroundings',
  'classic-gp': 'manicured grand prix circuit lawn with white-painted edge zones',
  dirt: 'dry cracked dirt and sand, rally park terrain',
};

function tileEntries(): Entry[] {
  const out: Entry[] = [];
  for (const [biome, desc] of Object.entries(BIOMES)) {
    out.push({
      id: `tile-ground-${biome}`,
      out: `public/assets/tracks/tiles/${biome}-ground.png`,
      modelSlot: 'photo',
      width: 512,
      height: 512,
      alpha: 'opaque',
      prompt: `seamless tileable texture, ${desc}, top-down orthographic, even diffuse lighting, no vignette, photorealistic game texture`,
      negative: NEG,
    });
    out.push({
      id: `tile-asphalt-${biome}`,
      out: `public/assets/tracks/tiles/${biome}-asphalt.png`,
      modelSlot: 'photo',
      width: 512,
      height: 512,
      alpha: 'opaque',
      prompt: `seamless tileable texture, ${biome === 'dirt' ? 'compacted gravel rally road surface' : 'worn race track asphalt with fine aggregate and faint rubber lines'}, top-down orthographic, even diffuse lighting, no vignette, photorealistic game texture`,
      negative: NEG,
    });
  }
  for (const [id, desc] of [
    ['curb', 'red and white striped race track curb, repeating pattern, straight strip'],
    ['runoff', 'light gray runoff tarmac with drainage grooves'],
    ['dirt-road', 'loose brown gravel road surface'],
  ] as const) {
    out.push({
      id: `tile-${id}`,
      out: `public/assets/tracks/tiles/${id}.png`,
      modelSlot: 'photo',
      width: 512,
      height: 256,
      alpha: 'opaque',
      prompt: `seamless tileable texture, ${desc}, top-down orthographic, even diffuse lighting, no vignette, photorealistic game texture`,
      negative: NEG,
    });
  }
  return out;
}

const PROPS: Record<string, string[]> = {
  meadow: ['large oak tree', 'row of hay bales', 'small wooden spectator stand', 'white fence segment', 'red-roofed farm shed', 'cluster of bushes'],
  'forest-mountain': ['tall pine tree', 'granite boulder', 'alpine wooden chalet', 'rocky cliff outcrop', 'wooden safety barrier', 'mountain spruce cluster'],
  speedway: ['tall floodlight tower', 'large grandstand section', 'concrete wall segment with fence', 'infield care center building', 'row of parked service trucks', 'giant scoreboard tower seen from afar'],
  city: ['modern glass office tower', 'city apartment block', 'street lamp pair', 'concrete barrier with mesh fence', 'pedestrian bridge segment', 'row of street trees in planters'],
  'classic-gp': ['pit building with terrace', 'covered main grandstand', 'marshal post hut', 'stack of race tires painted white and red', 'gravel trap patch', 'trimmed hedge row'],
  dirt: ['weathered water tower', 'rusty corrugated shed', 'dead tree', 'pile of old tires', 'wooden spectator berm', 'dusty service truck'],
};

function propEntries(): Entry[] {
  const out: Entry[] = [];
  for (const [biome, props] of Object.entries(PROPS)) {
    props.forEach((prop, i) => {
      out.push({
        id: `prop-${biome}-${i + 1}`,
        out: `public/assets/tracks/props/${biome}-${i + 1}.png`,
        modelSlot: 'photo',
        width: 768,
        height: 768,
        alpha: 'remove-bg',
        prompt: `${STYLE}, ${prop}, viewed from high angle 60 degrees, game map object, consistent overcast daylight, isolated subject on plain light background`,
        negative: NEG,
      });
    });
  }
  const shared = ['race control tower with checkered pattern', 'start-finish overhead gantry', 'pit crew equipment cart', 'tire wall barrier white and blue', 'safety car parked', 'television broadcast camera crane', 'podium structure with three steps', 'paddock tent'];
  shared.forEach((prop, i) => {
    out.push({
      id: `prop-shared-${i + 1}`,
      out: `public/assets/tracks/props/shared-${i + 1}.png`,
      modelSlot: 'photo',
      width: 768,
      height: 768,
      alpha: 'remove-bg',
      prompt: `${STYLE}, ${prop}, viewed from high angle 60 degrees, game map object, consistent overcast daylight, isolated subject on plain light background`,
      negative: NEG,
    });
  });
  return out;
}

// -------------------------------------------------------------- people

const FACES = ['sharp-jawed', 'round-faced friendly', 'lean weathered', 'broad-shouldered stocky', 'youthful energetic', 'silver-templed distinguished', 'focused intense'];
const AGES_BY_TIER = ['in his early 20s', 'in his 30s', 'in his 40s'];
const TRIM = ['steel blue', 'silver', 'gold'];

function portraitEntries(): Entry[] {
  return AI_DRIVERS.map((drv, i) => {
    const tier = Math.floor(i / 7);
    return {
      id: `portrait-${drv.id}`,
      out: `public/assets/portraits/${drv.id}.png`,
      modelSlot: 'photo' as const,
      width: 512,
      height: 512,
      alpha: 'remove-bg' as const,
      prompt: `professional portrait of a ${FACES[i % FACES.length]} racing driver ${AGES_BY_TIER[tier]}, plain dark navy racing suit with ${TRIM[tier]} trim and no sponsor patches, confident expression, studio headshot chest-up, soft key light, plain light gray background, motorsport team photo style`,
      negative: NEG,
    };
  });
}

// ------------------------------------------------------------------ UI

const CORE_ICONS: Array<[string, string]> = [
  ['credits', 'stack of gold coins'], ['pp', 'circular performance gauge dial'],
  ['laps', 'circuit loop with checkered flag'], ['fuel', 'fuel pump nozzle'],
  ['fatigue', 'racing helmet with sweat drop'], ['morale', 'rising star'],
  ['pace', 'speedometer needle at redline'], ['overtake', 'two arrows overtaking'],
  ['pit', 'crossed wrench and tire'], ['speed', 'fast forward chevrons'],
  ['audio-on', 'speaker with sound waves'], ['audio-off', 'muted speaker with slash'],
  ['back', 'left-pointing chevron arrow'], ['settings', 'gear cog'],
  ['save', 'floppy disk'], ['lock', 'closed padlock'], ['check', 'bold checkmark'],
  ['warning', 'warning triangle'], ['info', 'information circle'],
  ['home', 'garage building facade'], ['garage', 'car under a roof'],
  ['dealership', 'car with price tag'], ['driver', 'classic racing helmet'],
  ['events', 'calendar page with flag'], ['freerace', 'steering wheel'],
  ['retire', 'exit door with flag'], ['trophy', 'race winner trophy cup'],
  ['calendar', 'calendar page'], ['stopwatch', 'chronograph stopwatch'],
];

function iconEntry(idPart: string, subject: string, folder = 'ui', prefix = 'icon-'): Entry {
  return {
    id: `${prefix}${idPart}`,
    out: `public/assets/${folder}/${prefix}${idPart}.png`,
    modelSlot: 'transparent',
    width: 512,
    height: 512,
    alpha: 'native',
    prompt: `flat minimal game UI icon of ${subject}, single weight geometric line-and-fill, dark metallic gold #C9A54A with heavier solid fill, subtle silver accent, premium motorsport broadcast style, centered, no text`,
    negative: NEG,
  };
}

function uiEntries(): Entry[] {
  const out: Entry[] = [];
  // brand (text allowed here — Ideogram excels at wordmarks)
  out.push({
    id: 'logo-main',
    out: 'public/assets/ui/logo-main.png',
    modelSlot: 'transparent',
    width: 1024,
    height: 512,
    alpha: 'native',
    prompt: `premium racing game logo, the wordmark "B-SPEC" in bold condensed metallic gold letters with thin silver outline, small subtitle "RACE DIRECTOR" beneath in silver capitals, subtle chevron emblem to the left, dark navy and gold palette, broadcast television aesthetic, on transparent background`,
    negative: 'watermark, blurry, cartoon, low quality',
  });
  out.push({
    id: 'logo-mark',
    out: 'public/assets/ui/logo-mark.png',
    modelSlot: 'transparent',
    width: 512,
    height: 512,
    alpha: 'native',
    prompt: `minimal emblem mark for a racing management game, two overlapping forward chevrons forming motion, metallic gold on transparent, thin silver accent line, premium broadcast style, no text`,
    negative: NEG,
  });
  for (const [id, subject] of CORE_ICONS) out.push(iconEntry(id, subject));
  return out;
}

function badgeEntries(): Entry[] {
  const out: Entry[] = [];
  const METAL: Record<string, string> = {
    b: 'brushed bronze', a: 'polished silver', ic: 'rich gold',
    ia: 'platinum with blue inlay', s: 'black and gold with laurel crown',
  };
  for (const lic of LICENSES) {
    out.push({
      id: `license-${lic.id}`,
      out: `public/assets/ui/license-${lic.id}.png`,
      modelSlot: 'transparent',
      width: 512,
      height: 512,
      alpha: 'native',
      prompt: `heraldic racing license badge, letter-free shield emblem in ${METAL[lic.id]}, laurel wreath detail, flat premium emblem style, deep navy accents, game UI asset, no text`,
      negative: NEG,
    });
  }
  for (const medal of ['gold', 'silver', 'bronze']) {
    out.push(iconEntry(`medal-${medal}`, `round ${medal} race medal with ribbon, ${medal} metal finish`, 'ui', ''));
  }
  for (const part of PARTS) {
    out.push(iconEntry(`part-${part.id}`, partIconSubject(part.id), 'ui'));
  }
  for (const cat of PART_CATEGORIES) {
    out.push(iconEntry(`partcat-${cat.id}`, catIconSubject(cat.id), 'ui'));
  }
  for (const [id, subject] of [
    ['flag-green', 'waving green racing flag on pole'],
    ['flag-checkered', 'waving checkered racing flag on pole'],
    ['flag-yellow', 'waving yellow caution flag on pole'],
    ['start-lights', 'race start light gantry with five lights'],
  ] as const) {
    out.push(iconEntry(id, subject, 'fx', ''));
  }
  return out;
}

function partIconSubject(id: string): string {
  const map: Record<string, string> = {
    'power-1': 'engine control unit chip', 'power-2': 'turbocharger snail housing',
    'power-3': 'full racing engine block', 'weight-1': 'feather over car panel',
    'weight-2': 'stripped roll cage', 'tires-1': 'sports tire with tread',
    'tires-2': 'racing slick tire', 'aero-1': 'rear wing spoiler',
    'gearbox-1': 'gear shift knob with gate',
  };
  return map[id] ?? 'car part';
}
function catIconSubject(id: string): string {
  const map: Record<string, string> = {
    power: 'engine block', weight: 'weight scale', tires: 'tire',
    aero: 'aerodynamic wing', gearbox: 'gear cog pair',
  };
  return map[id] ?? 'car part';
}

// ---------------------------------------------------------------- P2/P3

function achievementSubject(id: string): string {
  const map: Record<string, string> = {
    'first-steps': 'car key with tag', 'green-flag': 'green starting flag',
    'taste-of-victory': 'small victory cup', 'podium-regular': 'three-step podium',
    'serial-winner': 'stack of victory cups', 'sunday-best': 'sunrise over trophy',
    'clubman-hero': 'turbo trophy with wings', 'national-legend': 'national trophy with wreath',
    'clean-sweep': 'three trophies in a row', 'charger': 'arrow charging through field of dots',
    untouchable: 'perfect diamond', predator: 'hawk diving', 'century-of-passes': 'number-free milestone obelisk with arrows',
    strategist: 'chess knight on wrench', wealthy: 'overflowing coin vault',
    collector: 'four car silhouettes fanned', 'top-of-the-range': 'crowned car silhouette',
    tuner: 'wrench with sparkle', 'full-build': 'car blueprint fully lit',
    prodigy: 'rising comet', veteran: 'laurel wreath around helmet',
    mastery: 'glowing skill meter', marathon: 'winding endless road',
    'invitation-only': 'sealed golden envelope', 'first-license': 'license card with shield',
    'super-license': 'black and gold license card', 'trophy-hunter': 'trophy in crosshair sight',
  };
  return map[id] ?? 'trophy emblem';
}

function p2Entries(): Entry[] {
  const out: Entry[] = [];
  for (const a of ACHIEVEMENTS) out.push(iconEntry(`ach-${a.id}`, achievementSubject(a.id), 'ui'));
  for (const [id, subject] of [
    ['cat-trophy', 'single race trophy over circuit outline'],
    ['cat-reverse', 'circuit loop with reversed arrows'],
    ['cat-endurance', 'clock face merging into road'],
    ['cat-rally', 'car drifting on gravel spray'],
    ['cat-super', 'lightning bolt over prototype car silhouette'],
    ['cat-missions', 'target with checkered center'],
    ['cat-invitational', 'golden envelope with chevron seal'],
    ['cat-onemake', 'two identical car silhouettes'],
    ['cat-grandtour', 'globe with racing line around it'],
  ] as const) {
    out.push(iconEntry(id, subject, 'ui', ''));
  }
  for (const [id, subject] of [
    ['dust-1', 'soft round dust puff cloud, light beige'],
    ['dust-2', 'wispy dust cloud trail, light beige'],
    ['smoke-1', 'soft gray tire smoke puff'],
    ['smoke-2', 'billowing gray smoke cloud'],
    ['spark-1', 'burst of orange sparks'],
    ['confetti-1', 'burst of gold and navy confetti pieces'],
    ['confetti-2', 'falling gold confetti scatter'],
    ['skid', 'straight black tire skid mark strip, fading ends'],
  ] as const) {
    out.push({
      id: `fx-${id}`,
      out: `public/assets/fx/${id}.png`,
      modelSlot: 'transparent',
      width: 512,
      height: id === 'skid' ? 256 : 512,
      alpha: 'native',
      prompt: `game particle sprite, ${subject}, soft edges, isolated on transparent background, no text`,
      negative: NEG,
    });
  }
  for (const [id, subject, w, h] of [
    ['podium-back', 'racing podium ceremony background, crowd bokeh and navy banners, wide', 1408, 704],
    ['podium-mid', 'empty three-step racing podium with gold number-free plates, front view', 1024, 768],
    ['title-cup', 'majestic championship trophy cup on pedestal with light rays', 768, 1024],
    ['title-laurel', 'large golden laurel wreath, circular, ornate', 768, 768],
    ['intro-pitwall', 'race engineer pit wall station with monitors, from behind, dawn light', 1408, 704],
    ['license-pass', 'diploma-style certificate scroll with gold seal, no text', 768, 768],
  ] as const) {
    out.push({
      id: `cine-${id}`,
      out: `public/assets/cinematic/${id}.png`,
      modelSlot: 'photo',
      width: w,
      height: h,
      alpha: id === 'podium-back' || id === 'intro-pitwall' ? 'opaque' : 'remove-bg',
      prompt: `${STYLE}, ${subject}, cinematic lighting, premium broadcast quality`,
      negative: NEG,
    });
  }
  for (const car of Object.values(CARS)) {
    out.push({
      id: `car-side-${car.id}`,
      out: `public/assets/cars/${car.id}-side.png`,
      modelSlot: 'photo',
      width: 1408,
      height: 640,
      alpha: 'remove-bg',
      prompt: `${STYLE}, perfect side profile view of a ${CAR_DESC[car.id]}, ${COLOR_NAME[car.id]} ${car.color} paint, completely debadged, no license plate, studio lighting, plain light gray background`,
      negative: NEG_CAR,
    });
  }
  return out;
}

function p3Entries(): Entry[] {
  const out: Entry[] = [];
  for (const [biome, desc] of Object.entries(BIOMES)) {
    out.push({
      id: `backdrop-${biome}`,
      out: `public/assets/tracks/backdrops/${biome}.png`,
      modelSlot: 'photo',
      width: 1408,
      height: 512,
      alpha: 'opaque',
      prompt: `${STYLE}, soft distant horizon landscape for a race circuit, ${desc}, hazy atmospheric perspective, muted colors, wide panoramic`,
      negative: NEG,
    });
  }
  for (let n = 1; n <= 6; n++) {
    out.push({
      id: `avatar-${n}`,
      out: `public/assets/portraits/player-${n}.png`,
      modelSlot: 'photo',
      width: 512,
      height: 512,
      alpha: 'remove-bg',
      prompt: `professional portrait of a ${FACES[n % FACES.length]} race team director ${AGES_BY_TIER[n % 3]}, smart navy team polo shirt with gold collar trim, headset around neck, confident expression, studio headshot, plain light gray background`,
      negative: NEG,
    });
  }
  for (const car of Object.values(CARS)) {
    out.push({
      id: `car-damaged-${car.id}`,
      out: `public/assets/cars/${car.id}-damaged.png`,
      modelSlot: 'photo',
      width: 512,
      height: 1024,
      alpha: 'remove-bg',
      prompt: `orthographic top-down view of a ${CAR_DESC[car.id]}, ${COLOR_NAME[car.id]} ${car.color} paint covered in dust and light scuffs, completely debadged, nose pointing up, centered, even overhead lighting, video game sprite, plain white background`,
      negative: NEG_CAR,
    });
  }
  for (const [id, subject] of [
    ['rain-1', 'rain streak overlay particles'],
    ['night-vignette', 'soft dark blue night vignette glow'],
    ['heat-haze', 'subtle heat shimmer distortion band'],
    ['celebration-1', 'champagne spray burst golden droplets'],
  ] as const) {
    out.push({
      id: `fx-${id}`,
      out: `public/assets/fx/${id}.png`,
      modelSlot: 'transparent',
      width: 512,
      height: 512,
      alpha: 'native',
      prompt: `game particle sprite overlay, ${subject}, soft edges, isolated on transparent background, no text`,
      negative: NEG,
    });
  }
  return out;
}

// ------------------------------------------------------------------ main

mkdirSync('scripts/art/manifests', { recursive: true });
const p0 = [...carEntries(), ...tileEntries(), ...uiEntries()];
const p1 = [...propEntries(), ...portraitEntries(), ...badgeEntries()];
const p2 = p2Entries();
const p3 = p3Entries();

const est = (entries: Entry[]): number =>
  entries.reduce((sum, e) => sum + (e.modelSlot === 'transparent' ? 12 : e.alpha === 'remove-bg' ? 8 : 5), 0);

for (const [name, entries] of [['p0', p0], ['p1', p1], ['p2', p2], ['p3', p3]] as const) {
  writeFileSync(`scripts/art/manifests/${name}.json`, JSON.stringify({ entries }, null, 2));
  console.log(`${name}: ${entries.length} assets, ~${est(entries)} CU`);
}
console.log(`TOTAL: ${p0.length + p1.length + p2.length + p3.length} assets, ~${est(p0) + est(p1) + est(p2) + est(p3)} CU`);
