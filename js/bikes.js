// Fahrradauswahl. Jedes Modell ist einer Kategorie zugeordnet; die Kategorie
// schlägt die passende Sitzposition vor. `integrated` = Lenker-Vorbau-Einheit
// (je nach Ausstattung), bei der sich der Vorbau nicht einzeln tauschen lässt.

export const CATEGORIES = {
  aero: { label: 'Aero-Rennrad', style: 'rennen' },
  allround: { label: 'Allround-Rennrad', style: 'sport' },
  endurance: { label: 'Endurance-Rennrad', style: 'komfort' },
  gravel: { label: 'Gravelbike', style: 'komfort' },
  tt: { label: 'Zeitfahr-/Triathlonrad', style: 'tt' },
};

const b = (model, cat, integrated = false) => ({ model, cat, integrated });

export const BRANDS = {
  Canyon: [b('Aeroad', 'aero', true), b('Ultimate', 'allround'), b('Endurace', 'endurance'), b('Grail', 'gravel'), b('Grizl', 'gravel'), b('Speedmax', 'tt')],
  'Cervélo': [b('S5', 'aero', true), b('Soloist', 'allround'), b('R5', 'allround'), b('Caledonia', 'endurance'), b('Áspero', 'gravel'), b('P5', 'tt')],
  Specialized: [b('Tarmac', 'allround'), b('Aethos', 'allround'), b('Roubaix', 'endurance'), b('Diverge', 'gravel'), b('Shiv', 'tt')],
  Trek: [b('Madone', 'aero', true), b('Émonda', 'allround'), b('Domane', 'endurance'), b('Checkpoint', 'gravel'), b('Speed Concept', 'tt')],
  Giant: [b('Propel', 'aero'), b('TCR', 'allround'), b('Defy', 'endurance'), b('Revolt', 'gravel')],
  Scott: [b('Foil', 'aero'), b('Addict RC', 'allround'), b('Addict', 'endurance'), b('Plasma', 'tt')],
  Cube: [b('Litening', 'aero'), b('Agree', 'allround'), b('Attain', 'endurance'), b('Nuroad', 'gravel')],
  Rose: [b('Xlite', 'allround'), b('Reveal', 'endurance'), b('Backroad', 'gravel')],
  BMC: [b('Teammachine', 'allround'), b('Roadmachine', 'endurance'), b('Timemachine', 'tt')],
  Pinarello: [b('Dogma F', 'aero'), b('Dogma X', 'endurance')],
};

/** Schlüssel "Marke|Modell" oder "other|<kategorie>" → Fahrrad-Objekt. */
export function findBike(key) {
  const [brand, rest] = String(key ?? '').split('|');
  if (brand === 'other' && CATEGORIES[rest]) {
    return { name: CATEGORIES[rest].label, cat: rest, integrated: false, generic: true };
  }
  const hit = BRANDS[brand]?.find((x) => x.model === rest);
  if (hit) return { name: `${brand} ${hit.model}`, cat: hit.cat, integrated: hit.integrated };
  return { name: CATEGORIES.allround.label, cat: 'allround', integrated: false, generic: true };
}
