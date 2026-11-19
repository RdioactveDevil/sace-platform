import { useEffect, useRef } from 'react'

// Homepage pieces built around a drawn iPhone (no screenshots):
// - SpotStudy: "Study properly, wherever you are." with a Maths Methods question and its graph
//   on a phone lying at an angle.
// - SpotChem: "Structures, equations and graphs, not just words." with a Chemistry question
//   (an ester's structure and its equation), tilted the other way.
// - ResultsFigure: an upright phone showing a practice exam result, with cards floating round it.
// The phone screens use the app's Midnight palette in both themes; everything around them uses the
// page's tokens (.gfx). Styles are in SPOT_CSS.

export const SPOT_CSS = `
/* ── The phone ── */
.gfx .phone { --w: 290px; width: var(--w); aspect-ratio: 290 / 600; position: relative; flex-shrink: 0; }
.gfx .phone .ph-frame { position: absolute; inset: 0; border-radius: 48px; padding: 3px; background: linear-gradient(140deg, #6c707b 0%, #2a2c33 22%, #4c505a 48%, #1c1e24 74%, #5a5e68 100%); box-shadow: 0 50px 90px -30px rgba(8,10,30,.55), 0 20px 40px -20px rgba(8,10,30,.4); }
.gfx .phone .ph-bezel { width: 100%; height: 100%; border-radius: 45px; background: #050507; padding: 9px; position: relative; }
.gfx .phone .ph-screen { width: 100%; height: 100%; border-radius: 37px; overflow: hidden; position: relative; background: #080b1a; color: #eef1fa; text-align: left; }
.gfx .phone .ph-screen::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(115deg, rgba(255,255,255,.10) 0%, rgba(255,255,255,0) 32%); }
.gfx .phone .ph-island { position: absolute; top: 10px; left: 50%; width: 86px; height: 25px; margin-left: -43px; border-radius: 20px; background: #000; z-index: 3; }
.gfx .phone .ph-side { position: absolute; width: 3px; border-radius: 2px; background: #3a3d45; }
.gfx .phone .s1 { left: -2px; top: 120px; height: 26px; } .gfx .phone .s2 { left: -2px; top: 165px; height: 48px; } .gfx .phone .s3 { left: -2px; top: 222px; height: 48px; } .gfx .phone .s4 { right: -2px; top: 175px; height: 74px; }
.gfx .ph-sb { height: 44px; display: flex; align-items: center; justify-content: space-between; padding: 6px 26px 0 30px; font-size: 13px; font-weight: 700; }
.gfx .ph-sb svg { height: 11px; width: auto; fill: currentColor; }
.gfx .ph-sb .ic { display: flex; gap: 5px; align-items: center; }
/* Lying on a desk at an angle; it straightens a little as it passes through the screen. */
.gfx .tiltwrap { perspective: 2200px; display: flex; justify-content: center; }
.gfx .tilt { transform-style: preserve-3d; transform: rotateX(calc(50deg - var(--p, 0) * 6deg)) rotateZ(calc(-34deg + var(--p, 0) * 4deg)); }
.gfx .tilt .ph-frame { box-shadow: -2px 2px 0 #2a2c33, -4px 4px 0 #24262c, -6px 6px 0 #1f2126, -8px 8px 0 #1b1c21, -10px 10px 0 #16171b, -12px 12px 0 #111215, -30px 60px 70px -20px rgba(8,10,30,.55); }
.gfx .tilt.r { transform: rotateX(calc(50deg - var(--p, 0) * 6deg)) rotateZ(calc(34deg - var(--p, 0) * 4deg)); }
.gfx .tilt.r .ph-frame { box-shadow: 2px 2px 0 #2a2c33, 4px 4px 0 #24262c, 6px 6px 0 #1f2126, 8px 8px 0 #1b1c21, 10px 10px 0 #16171b, 12px 12px 0 #111215, 30px 60px 70px -20px rgba(8,10,30,.55); }

/* ── The app inside the phone ── */
.gfx .app { padding: 4px 16px 0; display: flex; flex-direction: column; gap: 10px; height: calc(100% - 44px); }
.gfx .app-top { display: flex; align-items: center; gap: 8px; }
.gfx .round { width: 28px; height: 28px; border-radius: 50%; background: #161c36; display: grid; place-items: center; flex-shrink: 0; }
.gfx .round svg { width: 13px; height: 13px; stroke: #c9cfe6; fill: none; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }
.gfx .app-subj { font-size: 11.5px; font-weight: 800; color: #f1be43; line-height: 1.3; }
.gfx .app-subj small { display: block; color: #8a93b8; font-weight: 600; font-size: 10px; }
.gfx .app-stars { margin-left: auto; color: #f1be43; font-size: 11px; letter-spacing: 1px; }
.gfx .app-stars i { color: #2c3460; font-style: normal; }
.gfx .app-prog { height: 4px; border-radius: 4px; background: #1d2442; overflow: hidden; }
.gfx .app-prog i { display: block; height: 100%; background: linear-gradient(90deg, #f1be43, #f9d87a); }
.gfx .app-qn { font-size: 10.5px; font-weight: 800; color: #8a93b8; letter-spacing: .06em; text-transform: uppercase; display: flex; justify-content: space-between; }
.gfx .app-qn b { color: #4fd29a; }
.gfx .app-stem { font-size: 13px; line-height: 1.45; font-weight: 600; color: #eef1fa; }
.gfx .app .am { font-family: 'KaTeX_Math', 'Times New Roman', serif; font-style: italic; font-weight: 400; font-size: 1.12em; }
.gfx .app .amr { font-family: 'KaTeX_Main', 'Times New Roman', serif; font-weight: 400; font-size: 1.1em; }
.gfx .app .ahl { background: rgba(241,190,67,.28); box-shadow: 0 0 0 2px rgba(241,190,67,.28); border-radius: 2px; color: #fff; }
.gfx .app-fig { background: #0d1124; border: 1px solid #1d2442; border-radius: 12px; padding: 6px; }
.gfx .app-fig svg { display: block; width: 100%; height: auto; }
.gfx .app-opts { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.gfx .app-opt { display: flex; align-items: center; gap: 7px; padding: 7px 8px; border-radius: 9px; border: 1px solid #232b4e; background: #10152b; font-size: 12px; }
.gfx .app-opt .k { width: 18px; height: 18px; border-radius: 5px; border: 1px solid #2f3866; display: grid; place-items: center; font-size: 9px; font-weight: 800; color: #8a93b8; font-style: normal; flex-shrink: 0; }
.gfx .app-opt.ok { border-color: #2f9e74; background: rgba(79,210,154,.12); } .gfx .app-opt.ok .k { border-color: #4fd29a; color: #4fd29a; }
.gfx .app-dock { margin-top: auto; display: flex; align-items: center; gap: 8px; padding: 10px 0 18px; }
.gfx .app-pad { flex: 1; height: 34px; border-radius: 999px; background: rgba(241,190,67,.16); color: #b9a36a; font-size: 11.5px; display: flex; align-items: center; padding: 0 14px; font-weight: 600; }
.gfx .app-chip { height: 34px; border-radius: 999px; background: #161c36; color: #c9cfe6; font-size: 11px; font-weight: 700; display: flex; align-items: center; gap: 5px; padding: 0 12px; white-space: nowrap; }
.gfx .app-chip.t { background: #f1be43; color: #0c1037; }

/* ── Spotlights: words on one side, the phone on the other ── */
.gfx .spot .in { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 40px; align-items: center; }
.gfx .spot.flip .copy { order: 2; }
.gfx .spot .copy { display: flex; flex-direction: column; align-items: flex-start; gap: 18px; max-width: 34em; }
.gfx .eyebrow { font-size: 12.5px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: var(--goldt); }
.gfx .spot h2 { margin: 0; font-size: clamp(32px, 4.2vw, 54px); font-weight: 800; line-height: 1.05; letter-spacing: -.035em; text-wrap: balance; }
.gfx .spot .lead { margin: 0; font-size: clamp(16.5px, 1.5vw, 19px); color: var(--ink2); line-height: 1.6; }
.gfx .ticks { list-style: none; padding: 0; margin: 4px 0 0; display: flex; flex-direction: column; gap: 10px; }
.gfx .ticks li { display: flex; gap: 10px; align-items: flex-start; color: var(--ink2); }
.gfx .ticks li::before { content: ""; width: 18px; height: 18px; flex-shrink: 0; margin-top: 3px; border-radius: 50%; background: var(--gold) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M6 12.5l4 4 8-9' fill='none' stroke='%230c1037' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / 12px no-repeat; }
.gfx .spot .spot-stage { position: relative; min-height: 520px; display: flex; align-items: center; justify-content: center; }
.gfx .spot .spot-note { position: absolute; z-index: 5; font-family: 'Caveat', 'Segoe Print', cursive; font-weight: 700; font-size: 25px; line-height: 1; color: var(--goldt); white-space: nowrap; }
.gfx .spot .spot-note svg { display: block; width: 64px; height: 44px; }
@media (max-width: 900px) { .gfx .spot .in { grid-template-columns: minmax(0, 1fr); } .gfx .spot.flip .copy { order: 0; } .gfx .spot .spot-stage { min-height: 460px; } }
@media (max-width: 560px) { .gfx .spot .spot-stage { zoom: .66; min-height: 520px; } }

/* ── The results figure: an upright phone with cards floating round it ── */
.gfx .rfig { position: relative; display: flex; justify-content: center; padding: 20px 0 30px; }
.gfx .rfig .persp { perspective: 1800px; }
.gfx .rfig .phone { --w: 286px; transform: rotateY(-8deg) rotateZ(2deg); }
.gfx .float { position: absolute; border-radius: 16px; background: rgba(16,21,43,.94); color: #eef1fa; border: 1px solid rgba(255,255,255,.08); box-shadow: 0 30px 60px -24px rgba(8,10,30,.6); padding: 12px 14px; font-size: 11.5px; z-index: 4; text-align: left; }
.gfx .float h4 { margin: 0 0 8px; font-size: 12px; font-weight: 800; }
.gfx .f-break { left: calc(50% - 300px); top: 46%; width: 240px; animation: gfx-bob 7s ease-in-out infinite; }
.gfx .f-graph { right: calc(50% - 300px); top: 14%; width: 200px; padding: 8px; animation: gfx-bob 8s ease-in-out -2s infinite; }
.gfx .f-plus { right: calc(50% - 250px); bottom: 12%; display: flex; align-items: center; gap: 8px; padding: 9px 14px; border-radius: 999px; background: #f1be43; color: #0c1037; font-weight: 800; font-size: 12.5px; border: 0; animation: gfx-bob 6.5s ease-in-out -1s infinite; }
@keyframes gfx-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
.gfx .f-row { display: grid; grid-template-columns: 96px 1fr 30px; gap: 8px; align-items: center; margin: 5px 0; }
.gfx .f-row span { color: #c9cfe6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gfx .f-row b { text-align: right; font-weight: 800; font-variant-numeric: tabular-nums; }
.gfx .f-bar { height: 6px; border-radius: 4px; background: #232b4e; position: relative; overflow: hidden; }
.gfx .f-bar i { position: absolute; inset: 0 auto 0 0; border-radius: 4px; background: linear-gradient(90deg, #f1be43, #f9d87a); }
.gfx .f-bar.lo i { background: #ff7b72; }
.gfx .rf-res { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 8px 0 0; }
.gfx .donut { width: 150px; height: 150px; position: relative; }
.gfx .donut svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.gfx .donut b { position: absolute; inset: 0; display: grid; place-items: center; font-size: 30px; font-weight: 800; }
.gfx .kv { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; width: 100%; }
.gfx .kv div { background: #10152b; border: 1px solid #1d2442; border-radius: 12px; padding: 9px 10px; }
.gfx .kv b { display: block; font-size: 18px; font-weight: 800; } .gfx .kv span { font-size: 10px; color: #8a93b8; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.gfx .kv .g b { color: #4fd29a; } .gfx .kv .r b { color: #f1be43; }
@media (max-width: 900px) { .gfx .f-break { left: 0; } .gfx .f-graph { right: 0; } .gfx .f-plus { right: 6%; } }
@media (max-width: 560px) { .gfx .rfig { zoom: .74; } }
@media (prefers-reduced-motion: reduce) { .gfx .float { animation: none; } .gfx .tilt { --p: 0 !important; } }
`

/** Sets --p on the tilted phone from 0 (just coming into view) to 1 (scrolled up past the middle). */
function useTilt() {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    let raf = 0
    const update = () => {
      raf = 0
      const r = el.getBoundingClientRect()
      const p = 1 - Math.min(1, Math.max(0, (r.top + r.height / 2) / window.innerHeight))
      el.style.setProperty('--p', p.toFixed(3))
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf) }
  }, [])
  return ref
}

const Back = <span className="round"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" /></svg></span>
const Battery = <svg viewBox="0 0 26 12"><rect x=".5" y=".5" width="22" height="11" rx="3" fill="none" stroke="currentColor" opacity=".5" /><rect x="2" y="2" width="15" height="8" rx="1.8" /></svg>
const M = ({ children }) => <span className="am">{children}</span>
const R = ({ children }) => <span className="amr">{children}</span>

/** A drawn iPhone; `children` is what's on its screen. */
function Phone({ label, children }) {
  return (
    <div className="phone" role="img" aria-label={label}>
      <div className="ph-frame"><div className="ph-bezel"><div className="ph-island" />
        <div className="ph-screen">
          <div className="ph-sb" aria-hidden="true"><span>9:41</span><span className="ic">{Battery}</span></div>
          {children}
        </div>
      </div></div>
      <span className="ph-side s1" /><span className="ph-side s2" /><span className="ph-side s3" /><span className="ph-side s4" />
    </div>
  )
}

const Arrow = ({ d }) => <svg viewBox="0 0 70 50" aria-hidden="true"><path d={d} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>

export function SpotStudy() {
  const tilt = useTilt()
  return (
    <section className="sec spot" aria-labelledby="gfx-spot1-h">
      <div className="in">
        <div className="copy">
          <span className="eyebrow">Ten minutes on the bus counts</span>
          <h2 id="gfx-spot1-h">Study properly, wherever you are.</h2>
          <p className="lead">Real exam-style questions with graphs, diagrams and full working, built for a phone screen. Pick up where you left off on any device.</p>
          <ul className="ticks"><li>Questions at your level, from one star to five</li><li>Rough work space beside every question</li><li>Ask Titan for a hint without being given the answer</li></ul>
        </div>
        <div className="spot-stage">
          <span className="spot-note" style={{ right: '2%', top: '6%' }} aria-hidden="true">tap for a hint<Arrow d="M60 6 C 46 22, 30 32, 10 40 M10 40 L 20 31 M10 40 L 22 46" /></span>
          <div className="tiltwrap"><div className="tilt" ref={tilt}>
            <Phone label="A Maths Methods question with a graph, on a phone">
              <div className="app" aria-hidden="true">
                <div className="app-top">{Back}<span className="app-subj">Maths Methods<small>Calculus · Stationary points</small></span><span className="app-stars">★★★<i>★★</i></span></div>
                <div className="app-prog"><i style={{ width: '42%' }} /></div>
                <div className="app-qn"><span>Question 4 of 10</span><b>3 correct</b></div>
                <div className="app-stem">The graph of <M>y</M><R> = </R><M>f</M><R>(</R><M>x</M><R>)</R> is shown. At which point is <span className="ahl"><M>f′</M><R>(</R><M>x</M><R>) = 0</R> and <M>f″</M><R>(</R><M>x</M><R>) &gt; 0</R></span>?</div>
                <div className="app-fig"><svg viewBox="0 0 240 130">
                  <g stroke="#1a2140" strokeWidth="1"><path d="M30 8V122M60 8V122M90 8V122M120 8V122M150 8V122M180 8V122M210 8V122M10 25H232M10 50H232M10 75H232M10 100H232" /></g>
                  <path d="M8 65H234M120 4V126" stroke="#5d6685" strokeWidth="1.3" />
                  <path d="M14 122 C 34 40, 60 18, 78 28 S 120 100, 150 104 S 196 60, 228 10" fill="none" stroke="#f1be43" strokeWidth="2.6" strokeLinecap="round" />
                  <g fontFamily="Times New Roman, serif" fontSize="12" fill="#eef1fa" fontWeight="700"><circle cx="69" cy="24" r="3.6" /><text x="62" y="15">A</text><circle cx="120" cy="80" r="3.6" /><text x="124" y="76">B</text><circle cx="150" cy="104" r="3.6" /><text x="146" y="121">C</text><circle cx="214" cy="31" r="3.6" /><text x="200" y="36">D</text></g>
                  <text x="226" y="60" fill="#8a93b8" fontSize="11" fontStyle="italic" fontFamily="Times New Roman, serif">x</text>
                </svg></div>
                <div className="app-opts"><div className="app-opt"><i className="k">A</i>Point A</div><div className="app-opt"><i className="k">B</i>Point B</div><div className="app-opt ok"><i className="k">C</i>Point C</div><div className="app-opt"><i className="k">D</i>Point D</div></div>
                <div className="app-dock"><span className="app-pad">Rough work</span><span className="app-chip">◷ 0:42</span><span className="app-chip t">Titan</span></div>
              </div>
            </Phone>
          </div></div>
        </div>
      </div>
    </section>
  )
}

export function SpotChem() {
  const tilt = useTilt()
  return (
    <section className="sec spot flip" aria-labelledby="gfx-spot2-h">
      <div className="in">
        <div className="copy">
          <span className="eyebrow">Chemistry, drawn properly</span>
          <h2 id="gfx-spot2-h">Structures, equations and graphs, not just words.</h2>
          <p className="lead">Organic structures, balanced equations with states, titration curves and data tables, drawn the way they appear in your exam, so the questions feel like the real thing.</p>
          <ul className="ticks"><li>Every question sits under a topic from your course</li><li>Full working for every answer</li><li>Report a question and it's checked and fixed</li></ul>
        </div>
        <div className="spot-stage">
          <span className="spot-note" style={{ left: 0, top: '4%' }} aria-hidden="true">comes back in 1 week<span style={{ display: 'block', marginLeft: 120 }}><Arrow d="M8 6 C 20 26, 36 34, 60 40 M60 40 L 50 32 M60 40 L 49 46" /></span></span>
          <div className="tiltwrap"><div className="tilt r" ref={tilt}>
            <Phone label="A Chemistry question with a structure and an equation, on a phone">
              <div className="app" aria-hidden="true">
                <div className="app-top">{Back}<span className="app-subj">Chemistry<small>Organic reactions · Esters</small></span><span className="app-stars">★★★★<i>★</i></span></div>
                <div className="app-prog"><i style={{ width: '64%' }} /></div>
                <div className="app-qn"><span>Question 7 of 10</span><b>5 correct</b></div>
                <div className="app-stem">Ethanoic acid is heated with ethanol and a few drops of <span className="ahl">concentrated H<sub>2</sub>SO<sub>4</sub></span>. Name the organic product shown.</div>
                <div className="app-fig"><svg viewBox="0 0 240 104" fontFamily="Plus Jakarta Sans, sans-serif" fontSize="12" fontWeight="700" fill="#eef1fa">
                  <g stroke="#c9cfe6" strokeWidth="1.8" strokeLinecap="round"><path d="M30 60H52" /><path d="M68 60H88" /><path d="M60 52V30" /><path d="M64 52V30" /><path d="M70 62L92 74" /><path d="M110 76H130" /><path d="M146 76H166" /></g>
                  <text x="12" y="64">H₃C</text><text x="56" y="64">C</text><text x="55" y="26">O</text><text x="94" y="80">O</text><text x="132" y="80">CH₂</text><text x="168" y="80">CH₃</text>
                  <text x="12" y="98" fontSize="10" fill="#8a93b8" fontWeight="600">ester group</text>
                  <path d="M50 18 A 30 30 0 0 1 110 70" fill="none" stroke="#f1be43" strokeWidth="1.4" strokeDasharray="3 3" />
                </svg></div>
                <div className="app-stem" style={{ fontSize: 11.5, fontWeight: 500, color: '#c9cfe6' }}>CH<sub>3</sub>COOH(l) + C<sub>2</sub>H<sub>5</sub>OH(l) ⇌ CH<sub>3</sub>COOC<sub>2</sub>H<sub>5</sub>(l) + H<sub>2</sub>O(l)</div>
                <div className="app-opts" style={{ gridTemplateColumns: '1fr' }}><div className="app-opt ok"><i className="k">A</i>Ethyl ethanoate</div><div className="app-opt"><i className="k">B</i>Methyl propanoate</div></div>
                <div className="app-dock"><span className="app-pad">Rough work</span><span className="app-chip">◷ 1:05</span><span className="app-chip t">Titan</span></div>
              </div>
            </Phone>
          </div></div>
        </div>
      </div>
    </section>
  )
}

/** A practice exam result on an upright phone, with a topic breakdown, a graph and "+10 questions" floating round it. */
export function ResultsFigure() {
  return (
    <div className="rfig">
      <div className="persp">
        <Phone label="A practice exam result on a phone">
          <div className="app" aria-hidden="true">
            <div className="app-top">{Back}<span className="app-subj">Practice exam<small>Mathematical Methods · Exam 2</small></span></div>
            <div className="rf-res">
              <div className="donut"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" fill="none" stroke="#1d2442" strokeWidth="14" /><circle cx="60" cy="60" r="50" fill="none" stroke="#f1be43" strokeWidth="14" strokeLinecap="round" strokeDasharray="232 314" /><circle cx="60" cy="60" r="50" fill="none" stroke="#ff7b72" strokeWidth="14" strokeDasharray="70 314" strokeDashoffset="-240" /></svg><b>74%</b></div>
              <div className="kv"><div className="g"><b>59</b><span>Marks</span></div><div className="r"><b>21</b><span>To review</span></div><div><b>1:52</b><span>Time</span></div><div><b>★★★★</b><span>Level</span></div></div>
              <div className="kv" style={{ gridTemplateColumns: '1fr' }}><div><span>Comes back tomorrow</span><b style={{ fontSize: 13, marginTop: 4 }}>Chain rule · Log laws · Integration by recognition</b></div></div>
            </div>
          </div>
        </Phone>
      </div>
      <div className="float f-break" aria-hidden="true">
        <h4>Topic breakdown</h4>
        <div className="f-row"><span>Differentiation</span><span className="f-bar"><i style={{ width: '86%' }} /></span><b>86%</b></div>
        <div className="f-row"><span>Probability</span><span className="f-bar"><i style={{ width: '71%' }} /></span><b>71%</b></div>
        <div className="f-row"><span>Log laws</span><span className="f-bar"><i style={{ width: '63%' }} /></span><b>63%</b></div>
        <div className="f-row"><span>Integration</span><span className="f-bar lo"><i style={{ width: '38%' }} /></span><b>38%</b></div>
      </div>
      <div className="float f-graph" aria-hidden="true">
        <svg viewBox="0 0 200 140">
          <g stroke="#232b4e" strokeWidth="1"><path d="M20 10V130M40 10V130M60 10V130M80 10V130M100 10V130M120 10V130M140 10V130M160 10V130M180 10V130" /><path d="M10 30H190M10 50H190M10 70H190M10 90H190M10 110H190" /></g>
          <path d="M10 70H192M100 6V134" stroke="#5d6685" strokeWidth="1.4" />
          <path d="M18 128 C 40 30, 70 22, 92 60 S 140 120, 160 80 S 180 20, 188 12" fill="none" stroke="#f1be43" strokeWidth="3" strokeLinecap="round" />
          <circle cx="64" cy="33" r="4.5" fill="#0d1124" stroke="#4fd29a" strokeWidth="2.5" /><circle cx="141" cy="104" r="4.5" fill="#0d1124" stroke="#4fd29a" strokeWidth="2.5" />
          <text x="70" y="24" fill="#c9cfe6" fontSize="11" fontStyle="italic" fontFamily="Times New Roman, serif">f′(x) = 0</text>
        </svg>
      </div>
      <div className="float f-plus" aria-hidden="true">+10 questions at ★★★</div>
    </div>
  )
}
