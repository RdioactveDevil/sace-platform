// A capital city's skyline as a flat silhouette, for the pricing page's
// background once they've picked their state: Melbourne for Victoria,
// Adelaide for South Australia, and so on. Drawn by hand from simple shapes
// in a 1440 × 240 box (ground at the bottom), each with a few landmarks over
// a row of generated buildings. Everything is currentColor, so the page sets
// the colour and how faint it is. Outside Australia there's no city.

const G = 240 // the ground line

/** A building `h` tall from the ground. */
const rect = (x, w, h) => `M${x} ${G}V${G - h}H${x + w}V${G}Z`
/** A block between heights h0 and h1 (a tower's bulge, a turret, a flag). */
const band = (x, w, h0, h1) => `M${x} ${G - h0}V${G - h1}H${x + w}V${G - h0}Z`
/** A spire: base width w at height h0, rising to a point at h1. */
const spire = (x, w, h0, h1) => `M${x} ${G - h0}L${x + w / 2} ${G - h1}L${x + w} ${G - h0}Z`
/** A shape through these [x, height] points, closed along the ground. */
const shape = (pts) => `M${pts[0][0]} ${G}${pts.map(([x, h]) => `L${x} ${G - h}`).join('')}L${pts[pts.length - 1][0]} ${G}Z`

/** A row of buildings from x0 to x1, the same every time for a given seed. */
function row(seed, x0, x1, minH, maxH, minW = 18, maxW = 38) {
  let s = seed >>> 0
  const rand = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const out = []
  for (let x = x0; x < x1;) {
    const w = Math.round(minW + rand() * (maxW - minW))
    // Taller in the middle of the row, like a city centre.
    const mid = 1 - Math.abs((x - x0) / (x1 - x0) * 2 - 1)
    const h = Math.round(minH + (maxH - minH) * (0.35 + 0.65 * mid) * (0.55 + 0.45 * rand()))
    out.push(rect(x, Math.min(w, x1 - x), h))
    x += w + Math.round(rand() * 6)
  }
  return out
}

/** An Opera House shell from sx to ex, h tall, on a base at height b. */
const shell = (sx, ex, h, b) => {
  const w = ex - sx, tip = sx + w * 0.3
  return `M${sx} ${G - b}Q${sx + w * 0.02} ${G - b - h * 0.7} ${tip} ${G - b - h}Q${ex - w * 0.2} ${G - b - h * 0.5} ${ex} ${G - b}Z`
}

/** A palm: a leaning trunk and fronds, as strokes. */
const palm = (x, h, lean = 14) => {
  const tx = x + lean, ty = G - h
  const fronds = [[-46, 18], [-34, -4], [-14, -16], [16, -14], [36, -2], [48, 20]]
    .map(([dx, dy]) => ({ d: `M${tx} ${ty}Q${tx + dx * 0.5} ${ty - 14} ${tx + dx} ${ty + dy}`, w: 3 }))
  return [{ d: `M${x} ${G}Q${x + 4} ${G - h * 0.5} ${tx} ${ty}`, w: 4 }, ...fronds]
}

/** The MCG's (or Adelaide Oval's) light towers: a pole with a tilted bank of lights. */
const lightTower = (x, h) => [rect(x, 4, h), `M${x - 10} ${G - h}V${G - h - 14}L${x + 14} ${G - h - 22}V${G - h - 8}Z`]

// Each city: `back` (hills, a mountain) drawn fainter behind, `fill` shapes,
// `stroke` lines ({ d, w }), `rings` (circles drawn as outlines) and `dots` (filled circles).
const CITIES = {
  VIC: () => ({
    fill: [
      ...row(1, 0, 1440, 12, 40),
      ...row(2, 380, 1010, 70, 160, 22, 40),
      rect(560, 26, 190), rect(588, 22, 172), // Rialto
      rect(698, 36, 222), band(692, 48, 150, 162), rect(706, 20, 230), // Australia 108
      rect(820, 30, 212), rect(826, 18, 226), // Eureka
      rect(930, 34, 40), spire(934, 26, 40, 206), rect(946, 2, 214), // Arts Centre spire
      rect(1040, 170, 42), `M1098 ${G - 42}A24 24 0 0 1 1146 ${G - 42}Z`, rect(1186, 12, 82), spire(1184, 16, 82, 98), // Flinders Street Station
      rect(1270, 150, 30), ...lightTower(1286, 150), ...lightTower(1338, 158), ...lightTower(1390, 150), // the MCG
    ],
  }),
  NSW: () => {
    // The Harbour Bridge's arch, with hangers down to the deck.
    const at = (t, a, c, b) => (1 - t) ** 2 * a + 2 * t * (1 - t) * c + t ** 2 * b
    const hangers = [0.18, 0.28, 0.38, 0.5, 0.62, 0.72, 0.82].map(t => ({ d: `M${at(t, 104, 285, 456)} ${at(t, G - 66, G - 218, G - 66)}V${G - 66}`, w: 2 }))
    return {
      fill: [
        ...row(3, 0, 1440, 10, 36),
        rect(60, 30, 100), rect(470, 30, 100), band(30, 500, 58, 66),
        `M90 ${G - 66}Q285 ${G - 250} 470 ${G - 66}L456 ${G - 66}Q285 ${G - 218} 104 ${G - 66}Z`,
        rect(590, 250, 16), shell(600, 700, 92, 16), shell(650, 742, 110, 16), shell(700, 782, 90, 16), shell(746, 816, 70, 16), shell(790, 836, 46, 16), // the Opera House
        ...row(4, 880, 1260, 80, 178, 22, 40),
        rect(1046, 8, 178), band(1034, 32, 178, 200), band(1040, 20, 200, 208), rect(1049, 2, 232), // Sydney Tower
      ],
      stroke: hangers,
    }
  },
  SA: () => ({
    back: [`M0 ${G}V${G - 52}Q180 ${G - 94} 360 ${G - 62}T720 ${G - 70}T1080 ${G - 56}T1440 ${G - 80}V${G}Z`], // the Adelaide Hills
    fill: [
      ...row(5, 0, 1440, 10, 32),
      rect(170, 290, 34), // Adelaide Oval: stands, roof canopies, light towers
      ...[0, 1, 2, 3, 4].map(i => `M${174 + i * 56} ${G - 34}Q${202 + i * 56} ${G - 80} ${230 + i * 56} ${G - 34}Z`),
      ...lightTower(150, 118), ...lightTower(470, 118),
      ...row(6, 540, 900, 50, 138, 22, 38),
      shape([[960, 30], [990, 62], [1015, 40], [1045, 78], [1080, 44], [1100, 30]]), // Festival Centre
      ...row(7, 1120, 1440, 20, 60),
    ],
  }),
  QLD: () => ({
    fill: [
      ...row(8, 0, 1440, 10, 34),
      rect(210, 14, 140), rect(380, 14, 140), band(40, 520, 50, 58), // the Story Bridge
      ...row(9, 640, 1110, 90, 196, 22, 40),
      rect(760, 32, 222), rect(770, 12, 232), // Skytower
      rect(880, 30, 204), spire(880, 30, 204, 224),
    ],
    stroke: [
      { d: `M40 ${G - 58}L217 ${G - 140}L300 ${G - 92}L387 ${G - 140}L560 ${G - 58}`, w: 6 },
      ...[[120, 217], [217, 260], [300, 340], [387, 470]].map(([a, b]) => ({ d: `M${a} ${G - 58}L${b} ${G - (b === 217 || b === 387 ? 140 : 100)}`, w: 2 })),
      { d: `M1250 ${G - 90}L1218 ${G}M1250 ${G - 90}L1282 ${G}`, w: 5 }, // the Wheel's legs
      ...Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return { d: `M1250 ${G - 90}L${1250 + Math.cos(a) * 62} ${G - 90 + Math.sin(a) * 62}`, w: 1.5 } }),
    ],
    rings: [{ cx: 1250, cy: G - 90, r: 62, w: 5 }],
    dots: [{ cx: 1250, cy: G - 90, r: 6 }, ...Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return { cx: 1250 + Math.cos(a) * 62, cy: G - 90 + Math.sin(a) * 62, r: 5 } })],
  }),
  WA: () => ({
    fill: [
      ...row(10, 0, 1440, 10, 30),
      ...row(11, 600, 1020, 80, 186, 22, 40),
      rect(760, 40, 214), rect(768, 24, 226), rect(779, 2, 238), // Central Park
      shape([[1150, 24], [1160, 90], [1173, 150], [1180, 160], [1187, 150], [1196, 90], [1206, 24]]), // the Bell Tower
    ],
    stroke: [{ d: `M1250 ${G - 10}Q1300 ${G - 90} 1350 ${G - 10}M1290 ${G - 10}Q1340 ${G - 80} 1390 ${G - 10}`, w: 5 }], // Elizabeth Quay Bridge
    dots: [[40, 30], [84, 26], [126, 34], [172, 28], [214, 32], [258, 24], [300, 30]].map(([cx, r]) => ({ cx, cy: G - r * 0.8, r })), // Kings Park
  }),
  TAS: () => {
    const deckY = (x) => { const t = (x - 940) / 490; return (1 - t) ** 2 * (G - 32) + 2 * t * (1 - t) * (G - 70) + t ** 2 * (G - 32) }
    return {
      back: [`M0 ${G}V${G - 60}C150 ${G - 90} 280 ${G - 205} 380 ${G - 210}C470 ${G - 214} 560 ${G - 150} 700 ${G - 120}C820 ${G - 95} 900 ${G - 80} 1000 ${G - 70}L1440 ${G - 50}V${G}Z`], // kunanyi / Mt Wellington
      fill: [
        band(379, 3, 208, 236),
        ...row(12, 380, 960, 14, 70, 18, 36),
        `M940 ${G - 40}Q1185 ${G - 78} 1430 ${G - 40}L1430 ${G - 32}Q1185 ${G - 70} 940 ${G - 32}Z`, // the Tasman Bridge
        ...Array.from({ length: 10 }, (_, i) => 962 + i * 50).map(x => rect(x, 6, G - deckY(x))),
        rect(866, 46, 8), rect(884, 2, 64), shape([[887, 12], [887, 60], [908, 12]]), // a yacht
      ],
    }
  },
  ACT: () => ({
    back: [`M0 ${G}V${G - 28}C120 ${G - 36} 220 ${G - 92} 300 ${G - 94}C380 ${G - 92} 480 ${G - 36} 640 ${G - 22}V${G}Z`], // Black Mountain
    fill: [
      band(296, 9, 92, 206), band(283, 35, 148, 170), band(290, 21, 170, 182), band(299, 3, 206, 236), // the Telstra Tower
      ...row(13, 600, 1440, 10, 38),
      rect(820, 420, 26), `M820 ${G - 26}Q900 ${G - 48} 980 ${G - 26}Z`, `M1080 ${G - 26}Q1160 ${G - 48} 1240 ${G - 26}Z`, // Parliament House
      band(1031, 26, 184, 198), // the flag
    ],
    stroke: [{ d: `M980 ${G - 26}L1030 ${G - 150}L1080 ${G - 26}`, w: 4 }, { d: `M1030 ${G - 150}V${G - 200}`, w: 3 }],
  }),
  NT: () => ({
    fill: [
      ...row(14, 0, 1440, 8, 28),
      ...row(15, 520, 900, 40, 112, 22, 40),
      rect(920, 180, 28),
    ],
    stroke: [120, 200, 300, 1150, 1240, 1330, 1400].flatMap((x, i) => palm(x, 92 + (i % 3) * 14, i % 2 ? -14 : 14)),
  }),
}

export const hasSkyline = (state) => !!CITIES[state]

export default function CitySkyline({ state, className }) {
  const city = CITIES[state]?.()
  if (!city) return null
  return (
    <div className={className} aria-hidden="true">
      <svg viewBox="0 0 1440 240" preserveAspectRatio="xMidYMax slice" focusable="false">
        {city.back && <path d={city.back.join('')} fill="currentColor" opacity="0.55" />}
        <path d={city.fill.join('')} fill="currentColor" />
        {(city.stroke || []).map((s, i) => <path key={i} d={s.d} fill="none" stroke="currentColor" strokeWidth={s.w} strokeLinecap="round" />)}
        {(city.rings || []).map((c, i) => <circle key={`r${i}`} cx={c.cx} cy={c.cy} r={c.r} fill="none" stroke="currentColor" strokeWidth={c.w} />)}
        {(city.dots || []).map((c, i) => <circle key={`d${i}`} cx={c.cx} cy={c.cy} r={c.r} fill="currentColor" />)}
      </svg>
    </div>
  )
}
