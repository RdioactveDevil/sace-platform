// Generated from the approved homepage design (the Design canvas boards), scoped under .gfx.
// Colours come from the site theme (themeVars in SiteChrome.jsx) through the tokens on .gfx.
export const HOME_CSS = `
.gfx{--win:var(--lp-win);--page:var(--lp-page);--card:var(--lp-card);--subtle:var(--lp-subtle);--line:var(--lp-line);--line2:var(--lp-line-2);--ink:var(--lp-ink);--ink2:var(--lp-ink-2);--muted:var(--lp-muted);--faint:var(--lp-faint);--gold:var(--lp-gold);--goldt:var(--lp-gold-text);--ok:var(--lp-ok);--okbg:var(--lp-ok-bg);--bad:var(--lp-bad);--badbg:var(--lp-bad-bg);--sel:var(--lp-sel-row);--sq0:var(--lp-sq0);--sq2:var(--lp-sq2);--sq3:var(--lp-sq3);--faded:var(--lp-faded);--onbg:var(--lp-on-bg);--onfg:var(--lp-on-fg);--float:var(--lp-float);--logo:var(--lp-logo-g);--logof:var(--lp-logo-f);--city:rgba(12,16,55,.07);--ga:.30;--gb:.20;--wave:1}
.gfx.dark{--city:rgba(255,255,255,.05)}
.gfx a{color:inherit}
.gfx a:hover{color:inherit}
.gfx{min-height:100vh;background:var(--win);color:var(--ink);font-family:'Plus Jakarta Sans','Segoe UI',sans-serif;font-size:15px;line-height:1.6;overflow-x:clip;-webkit-font-smoothing:antialiased}
.gfx *,.gfx *::before,.gfx *::after{box-sizing:border-box}
:where(.gfx) h1,:where(.gfx) p{margin:0}
.gfx button{font-family:inherit;cursor:pointer}
.gfx :focus-visible{outline:2px solid var(--gold);outline-offset:2px}
.gfx .in{max-width:var(--lp-max,1376px);margin:0 auto;padding:0 var(--lp-gutter,28px)}
.gfx .m{font-family:'Cambria Math','STIX Two Math','Times New Roman',serif;font-size:1.08em}
.gfx .wm{display:inline-flex;align-items:baseline;font-family:'Sifonn Pro','Plus Jakarta Sans',sans-serif;font-size:28px;letter-spacing:.08em;line-height:1;white-space:nowrap;text-decoration:none;color:var(--lp-logo-g)}
.gfx .wm span{color:var(--lp-logo-f)}
.gfx .btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:42px;padding:0 18px;border-radius:10px;font-size:14px;font-weight:800;white-space:nowrap;border:1px solid var(--line);background:var(--card);color:var(--ink);text-decoration:none}
.gfx .btn:hover{border-color:var(--line2)}
.gfx .btn.gold{border:none;background:var(--gold);color:#0c1037}
.gfx .btn.sm{min-height:34px;padding:0 13px;font-size:13px;border-radius:9px}
.gfx .btn.lg{min-height:50px;padding:0 24px;font-size:16px;border-radius:12px}
.gfx .btn.cta{min-height:60px;padding:0 30px;font-size:18px;border-radius:14px;box-shadow:0 10px 28px -8px rgba(224,169,31,.75)}
.gfx .btn:disabled{opacity:.45;cursor:default}
.gfx .nav{border-bottom:1px solid var(--line)}
.gfx .nav .in{display:flex;align-items:center;gap:26px;height:62px}
.gfx .navl{display:flex;gap:22px}
.gfx .navl a{font-size:13.5px;font-weight:600;color:var(--muted);text-decoration:none}
.gfx .navr{margin-left:auto;display:flex;gap:10px}
.gfx .hero{position:relative;overflow:hidden;padding:72px 0 96px}
.gfx .glow{position:absolute;border-radius:50%;pointer-events:none}
.gfx .glow.a{width:1100px;height:1100px;right:-420px;top:-560px;background:radial-gradient(closest-side,rgba(241,190,67,.30),rgba(241,190,67,0))}
.gfx .glow.b{width:900px;height:900px;left:-460px;bottom:-560px;background:radial-gradient(closest-side,rgba(241,190,67,.18),rgba(241,190,67,0))}
.gfx .hg{position:relative;z-index:1;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,560px);gap:64px;align-items:center}
.gfx .h1{font-size:clamp(40px,4.4vw,64px);font-weight:800;line-height:1.02;letter-spacing:-.045em;text-wrap:balance}
.gfx .h1 .s{display:block}
.gfx p,.gfx b,.gfx h3{text-wrap:pretty}
.gfx.solo .hg{grid-template-columns:minmax(0,1fr);gap:52px}
.gfx.solo .hg > :first-child{text-align:center;max-width:1040px;margin:0 auto}
.gfx.solo .hg > :first-child .lead{margin-left:auto;margin-right:auto}
.gfx.solo .hg > :first-child .ctas{justify-content:center}
.gfx.solo .hg > :nth-child(2){width:100%;max-width:var(--vis,680px);margin:0 auto}
.gfx :where(.lp.solo) .h1{font-size:clamp(44px,5.2vw,72px)}
.gfx .lead{font-size:19px;color:var(--ink2);margin-top:22px;max-width:34em;line-height:1.55;text-wrap:pretty}
.gfx .ctas{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}
.gfx .card{background:var(--card);border:1px solid var(--line);border-radius:20px;box-shadow:var(--float)}
.gfx .sq{display:block;border-radius:6px;background:var(--sq0)}
@keyframes gfx-pop{from{transform:scale(0)}to{transform:scale(1)}}
@keyframes gfx-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@media (max-width:1000px){.gfx .hg{grid-template-columns:minmax(0,1fr)}
.gfx .navl{display:none}}
@media (max-width:760px){.gfx .hero{padding:44px 0 64px}
.gfx .lead{font-size:17px}}
@media (prefers-reduced-motion:reduce){.gfx *,.gfx *::before,.gfx *::after{animation:none !important;transition:none !important}}
@keyframes gfx-swap{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.gfx{--vis:940px}
.gfx .h1{font-size:clamp(42px,4.8vw,68px)}
.gfx .lead{text-wrap:balance}
.gfx .sw{position:relative;display:inline-grid;grid-template-columns:1fr 1fr;padding:4px;border-radius:999px;background:var(--card);border:1px solid var(--line);box-shadow:0 8px 20px -14px rgba(12,16,55,.35)}
.gfx .sw .thumb{position:absolute;top:4px;bottom:4px;left:4px;width:calc(50% - 4px);border-radius:999px;background:#0c1037;transition:transform .45s cubic-bezier(.65,0,.25,1),background .45s}
.gfx .sw.on .thumb{transform:translateX(100%);background:#f1be43}
.gfx .sw button{position:relative;z-index:1;min-height:44px;padding:0 22px;border:0;background:transparent;font-size:14.5px;font-weight:800;color:var(--ink2);white-space:nowrap;transition:color .35s}
.gfx .sw button[aria-pressed="true"]{color:#ffffff}
.gfx .sw.on button[aria-pressed="true"]{color:#0c1037}
.gfx .swr{display:flex;justify-content:center;margin-bottom:18px}
.gfx .stage{position:relative;height:470px}
.gfx .frame{position:absolute;inset:0;border-radius:20px;background:var(--card);border:1px solid var(--line);box-shadow:var(--float);opacity:0;transform:scale(.94);transition:opacity .5s ease .1s,transform .6s cubic-bezier(.2,.8,.2,1) .1s}
.gfx .frame .bar{display:flex;align-items:center;justify-content:space-between;height:48px;padding:0 20px;border-bottom:1px solid var(--line)}
.gfx .frame .bar .wm{font-size:18px}
.gfx .frame .bar small{font-size:12.5px;font-weight:700;color:var(--muted)}
.gfx .frame .adapt{position:absolute;left:0;right:0;bottom:0;padding:14px 20px;border-top:1px solid var(--line);background:var(--sel);border-radius:0 0 20px 20px;font-size:14px;color:var(--ink)}
.gfx .on .frame{opacity:1;transform:none}
.gfx .tile{position:absolute;width:23.5%;height:150px;border-radius:14px;border:1.5px dashed var(--line2);background:var(--card);overflow:hidden;transition:left .7s cubic-bezier(.65,0,.25,1),top .7s cubic-bezier(.65,0,.25,1),width .7s cubic-bezier(.65,0,.25,1),height .7s cubic-bezier(.65,0,.25,1),transform .7s cubic-bezier(.65,0,.25,1),border-color .4s,background .4s,box-shadow .4s}
.gfx .tile.t0{left:0;top:96px;transform:rotate(-3deg)}
.gfx .tile.t1{left:25.5%;top:70px;transform:rotate(2deg)}
.gfx .tile.t2{left:51%;top:112px;transform:rotate(-1.5deg)}
.gfx .tile.t3{left:76.5%;top:80px;transform:rotate(3deg)}
.gfx .tile.t1{transition-delay:.06s}
.gfx .tile.t2{transition-delay:.12s}
.gfx .tile.t3{transition-delay:.18s}
.gfx .on .tile{width:46.5%;height:150px;transform:none;border-style:solid;border-color:var(--line);background:var(--subtle)}
.gfx .on .tile.t0{left:2.5%;top:66px}
.gfx .on .tile.t1{left:51%;top:66px}
.gfx .on .tile.t2{left:2.5%;top:232px}
.gfx .on .tile.t3{left:51%;top:232px}
.gfx .tile .a,.gfx .tile .b{position:absolute;inset:0;padding:16px;transition:opacity .35s}
.gfx .tile .a b{display:block;font-size:15px;color:var(--ink2)}
.gfx .tile .a span{display:block;margin-top:6px;font-size:13px;color:var(--muted);line-height:1.45}
.gfx .tile .b{opacity:0;display:grid;grid-template-columns:120px minmax(0,1fr);gap:14px;align-items:center;padding:14px}
.gfx .on .tile .a{opacity:0}
.gfx .on .tile .b{opacity:1;transition-delay:.45s}
.gfx .tile .b .th{height:100%;border-radius:8px;overflow:hidden;border:1px solid var(--line);background:#ffffff}
.gfx .tile .b img{display:block;width:100%;height:100%;object-fit:cover;object-position:left top}
.gfx .tile .b strong{display:block;font-size:15.5px;color:var(--ink)}
.gfx .tile .b em{display:block;margin-top:4px;font-style:normal;font-size:13px;color:var(--ink2);line-height:1.45}
.gfx .hub{position:absolute;left:50%;top:224px;z-index:3;transform:translate(-50%,-50%) scale(.4);opacity:0;padding:9px 16px;border-radius:999px;background:#0c1037;color:#f1be43;font-size:13px;font-weight:800;white-space:nowrap;box-shadow:0 0 0 6px var(--card);transition:opacity .3s,transform .45s cubic-bezier(.2,1.6,.4,1)}
.gfx .on .hub{opacity:1;transform:translate(-50%,-50%) scale(1);transition-delay:.75s}
.gfx .cap{position:absolute;left:0;right:0;top:300px;text-align:center;font-size:16px;font-weight:700;color:var(--muted);transition:opacity .3s}
.gfx .on .cap{opacity:0}
.gfx .frame .adapt{text-align:center;font-size:16px;font-weight:700}
.gfx .frame .adapt .wm{font-size:16px}
.gfx .ctas2{display:flex;justify-content:center;flex-wrap:wrap;gap:14px;margin-top:30px}
.gfx .ctas2 .try{min-height:60px;padding:0 26px;font-size:17px;border-radius:999px;gap:8px}
.gfx .ar{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2.75;stroke-linecap:round;stroke-linejoin:round}
.gfx .link{border:none;background:none;padding:0;font-size:inherit;font-weight:700;color:var(--ink);text-decoration:underline;text-decoration-color:var(--gold);text-decoration-thickness:2px;text-underline-offset:3px}
.gfx .lab{font-size:13px;font-weight:700;color:var(--muted)}
.gfx .sq.s1{background:var(--card);box-shadow:inset 0 0 0 2px var(--ink);background-image:radial-gradient(circle,var(--ink) 0 18%,transparent 21%)}
.gfx .sq.s2{background:var(--sq2)}
.gfx .sq.s3{background:var(--sq3)}
.gfx .sec{position:relative;padding:var(--lp-section,96px) 0;border-top:1px solid var(--line);scroll-margin-top:20px}
.gfx .sec.pg{background:var(--page)}
.gfx .h2{font-size:clamp(32px,4.2vw,54px);font-weight:800;line-height:1.06;letter-spacing:-.035em;text-align:center;max-width:22ch;margin:0 auto;text-wrap:balance}
.gfx .shd{display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center}
.gfx .shd .link{font-size:15.5px}
.gfx .hgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;max-width:1060px;margin:44px auto 0}
.gfx .hc{display:flex;flex-direction:column;overflow:hidden;text-decoration:none;color:var(--ink);transition:transform .2s,box-shadow .2s,border-color .2s}
.gfx .hc:hover{color:var(--ink);transform:translateY(-3px);box-shadow:var(--float);border-color:var(--line2)}
.gfx .hv{position:relative;height:240px;background:var(--subtle);border-bottom:1px solid var(--line);overflow:hidden;display:flex;align-items:center;justify-content:center;padding:24px}
.gfx .hb{flex:1;padding:22px 24px 24px;display:flex;flex-direction:column;gap:8px}
.gfx .hb h3{font-size:21px;font-weight:800;letter-spacing:-.02em;line-height:1.25}
.gfx .hb p{font-size:15px;color:var(--muted);max-width:42ch}
.gfx .more{display:inline-flex;align-items:center;align-self:flex-start;margin-top:auto;padding-top:8px;font-size:14.5px;font-weight:700;color:var(--ink);text-decoration:underline;text-decoration-color:var(--gold);text-decoration-thickness:2px;text-underline-offset:3px}
.gfx .iqv .stars{color:var(--goldt);letter-spacing:.06em;margin-left:4px}
.gfx .iqs{display:flex;flex-wrap:wrap;gap:5px;margin:12px 0 12px}
.gfx .iqs .sq{width:20px;height:20px;border-radius:5px}
.gfx .iqs .nw{background:var(--sq3);animation:gfx-iqPop 6s cubic-bezier(.2,1.6,.4,1) infinite;animation-delay:calc(var(--i) * 60ms)}
@keyframes gfx-iqPop{0%,38%{transform:scale(0)}46%,92%{transform:scale(1)}100%{transform:scale(0)}}
.gfx .iqt{position:relative;height:22px;font-size:14px;font-weight:700;color:var(--ink)}
.gfx .iqt span{position:absolute;inset:0;white-space:nowrap}
.gfx .iqt .a{animation:gfx-iqA 6s infinite}
.gfx .iqt .b{animation:gfx-iqB 6s infinite}
@keyframes gfx-iqA{0%,36%{opacity:1}40%,100%{opacity:0}}
@keyframes gfx-iqB{0%,40%{opacity:0}44%,94%{opacity:1}100%{opacity:0}}
.gfx .lad{width:100%;max-width:420px;display:flex;flex-direction:column;gap:7px}
.gfx .lad div{display:flex;align-items:center;gap:14px;padding:9px 14px;border-radius:11px;border:1px solid var(--line);background:var(--card);font-size:14px;font-weight:700;animation:gfx-ladOn 7.5s infinite}
.gfx .lad .s{color:var(--goldt);letter-spacing:.08em;font-size:13px;min-width:80px}
.gfx .lad i{margin-left:auto;font-style:normal;font-size:12px;font-weight:800;padding:3px 10px;border-radius:999px;background:var(--onbg);color:var(--onfg);opacity:0;animation:gfx-ladYou 7.5s infinite}
.gfx .lad .r4,.gfx .lad .r4 i{animation-delay:5s}
.gfx .lad .r3,.gfx .lad .r3 i{animation-delay:2.5s}
@keyframes gfx-ladOn{0%,30%{background:var(--sel);border-color:var(--sq3)}34%,100%{background:var(--card);border-color:var(--line)}}
@keyframes gfx-ladYou{0%,30%{opacity:1}34%,100%{opacity:0}}
.gfx .hv.covers{display:block;padding:0}
.gfx .cv{position:absolute;margin:0;width:46%;top:28px;background:#ffffff;border-radius:4px;box-shadow:0 18px 36px -18px rgba(12,16,55,.5),0 2px 6px rgba(12,16,55,.12);transition:transform .3s ease}
.gfx .cv img{display:block;width:100%;height:auto;border-radius:4px}
.gfx .cv.sace{left:5%;transform:rotate(-3deg)}
.gfx .cv.vce{right:5%;top:36px;transform:rotate(2.5deg)}
.gfx .hc:hover .cv.sace{transform:rotate(-4deg) translateY(-6px)}
.gfx .hc:hover .cv.vce{transform:rotate(3.5deg) translateY(-6px)}
.gfx .cvt{position:absolute;top:-11px;left:12px;z-index:1;font-size:11.5px;font-weight:800;letter-spacing:.04em;line-height:1;padding:5px 10px;border-radius:999px;background:#0c1037;color:#f1be43}
.gfx .hv.shot{padding:22px 22px 0;align-items:flex-start}
.gfx .hv.shot img{display:block;width:100%;height:100%;object-fit:cover;object-position:left top;border-radius:10px 10px 0 0;border:1px solid var(--line);border-bottom:none;background:#ffffff;box-shadow:0 14px 30px -18px rgba(12,16,55,.45);transition:transform .3s ease}
.gfx .hc:hover .hv.shot img{transform:translateY(-4px)}
.gfx .hv-x{padding:0}
.gfx .msheet{position:absolute;left:50%;top:32px;width:340px;height:290px;margin-left:-170px;background:#ffffff;color:#11152f;border-radius:3px;box-shadow:0 24px 48px -26px rgba(12,16,55,.45),0 2px 6px rgba(12,16,55,.12);transition:transform .3s ease}
.gfx .msheet.b1{transform:rotate(-3deg) translate(-16px,10px);background:#f3f4f9}
.gfx .msheet.b2{transform:rotate(2deg) translate(16px,6px);background:#f9f9fc}
.gfx .msheet.main{padding:18px 22px}
.gfx .hc:hover .msheet.main{transform:translateY(-6px)}
.gfx .msheet .sh-top{padding-bottom:8px}
.gfx .msheet .sh-top .wm{font-size:12px}
.gfx .msheet .sh-top small{font-size:10.5px;margin-left:8px}
.gfx .msheet .sh-box{font-size:11px;padding:2px 8px}
.gfx .msheet .mt{font-size:16px;font-weight:800;margin-top:10px}
.gfx .msheet .secl{margin-top:10px;font-size:10.5px;padding:4px 8px}
.gfx .mq{display:flex;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid #e6e7ee;font-size:12.5px}
.gfx .mq .src{font-size:10.5px;padding:2px 7px}
.gfx .mm{width:100%;max-width:440px;padding:16px 18px;background:var(--card);border:1px solid var(--line);border-radius:12px;box-shadow:var(--float)}
.gfx .mm-h{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px}
.gfx .mm .tot{font-size:30px;font-weight:800;letter-spacing:-.03em;line-height:1}
.gfx .mm .tot small{font-size:16px;color:var(--muted)}
.gfx .mm-a{font-size:15px;line-height:1.8;color:var(--ink2)}
.gfx .mm .hl{animation:gfx-hlg 7s ease infinite}
.gfx .mm .hl.k2{animation-delay:.7s}
.gfx .mm .hl.k3{animation-name:gfx-hlr;animation-delay:1.4s}
@keyframes gfx-hlg{0%,8%{background:transparent;box-shadow:none}16%,86%{background:var(--okbg);box-shadow:0 0 0 3px var(--okbg),inset 0 -2px 0 var(--ok)}100%{background:transparent;box-shadow:none}}
@keyframes gfx-hlr{0%,8%{background:transparent;box-shadow:none}16%,86%{background:var(--badbg);box-shadow:0 0 0 3px var(--badbg),inset 0 -2px 0 var(--bad)}100%{background:transparent;box-shadow:none}}
.gfx .hv-r .grow{margin-top:0;justify-content:center;flex-wrap:nowrap;gap:8px}
.gfx .hv-r .grow > div{width:70px}
.gfx .hv-r .grow .sq{width:44px;height:44px}
.gfx .hv-t .board{width:100%;max-width:440px}
@media (max-width:860px){.gfx .hgrid{grid-template-columns:minmax(0,1fr)}}
@media (max-width:480px){.gfx .hv-r .grow > div{width:54px}
.gfx .hv-r .grow .sq{width:36px;height:36px}
.gfx .hv-r .grow span{display:none}}
.gfx .cmp{margin-top:40px;overflow-x:auto}
.gfx .cmp table{width:100%;border-collapse:collapse;min-width:860px;font-size:14.5px}
.gfx .cmp th,.gfx .cmp td{text-align:left;padding:13px 18px;border-bottom:1px solid var(--line);vertical-align:top}
.gfx .cmp thead th{font-size:13px;color:var(--muted);font-weight:700}
.gfx .cmp tbody tr:last-child th,.gfx .cmp tbody tr:last-child td{border-bottom:none}
.gfx .cmp tbody th{font-weight:700;color:var(--ink)}
.gfx .cmp td{color:var(--ink2)}
.gfx .cmp td.no{color:var(--faint)}
.gfx .cmp .gf{background:var(--sel);color:var(--ink);font-weight:700}
.gfx .subjs{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin-top:32px;align-items:start}
.gfx .subj{overflow:hidden}
.gfx .subj .hd{display:flex;align-items:baseline;gap:10px;padding:14px 18px;border-bottom:1px solid var(--line)}
.gfx .subj .hd b{font-size:17px}
.gfx .subj .hd span{font-size:13px;color:var(--muted)}
.gfx .subj a{display:flex;align-items:center;gap:12px;padding:13px 18px;border-bottom:1px solid var(--line);color:var(--ink);font-size:15px;font-weight:700;text-decoration:none}
.gfx .subj a:last-child{border-bottom:none}
.gfx .subj a:hover{background:var(--subtle);color:var(--ink)}
.gfx .subj a span{flex:1}
.gfx .subj a small{font-size:13px;font-weight:600;color:var(--muted)}
.gfx .ptab{margin:36px auto 0;max-width:820px;overflow-x:auto}
.gfx .ptab table{width:100%;border-collapse:collapse;font-size:15px;min-width:540px}
.gfx .ptab th,.gfx .ptab td{text-align:left;padding:13px 18px;border-bottom:1px solid var(--line)}
.gfx .ptab thead th{font-size:13px;color:var(--muted);font-weight:700}
.gfx .ptab tbody th{font-weight:700}
.gfx .ptab td{color:var(--ink2)}
.gfx .ptab td.no{color:var(--faint)}
.gfx .ptab .pd{background:var(--sel);color:var(--ink);font-weight:700}
.gfx .ptab tbody tr:last-child th,.gfx .ptab tbody tr:last-child td{border-bottom:none}
.gfx .pcta{display:flex;justify-content:center;gap:12px;flex-wrap:wrap;margin-top:24px}
.gfx .faq{margin:28px auto 0;border-top:1px solid var(--line);max-width:880px}
.gfx .faq details{border-bottom:1px solid var(--line)}
.gfx .faq summary{cursor:pointer;padding:17px 0;font-weight:800;font-size:16.5px;list-style:none;display:flex;justify-content:space-between;gap:12px}
.gfx .faq summary::-webkit-details-marker{display:none}
.gfx .faq summary::after{content:"+";font-weight:600;color:var(--muted)}
.gfx .faq details[open] summary::after{content:"−"}
.gfx .faq details p{padding:0 0 17px;color:var(--muted);max-width:70ch}
.gfx .end{position:relative;padding:96px 0 200px;text-align:center;overflow:hidden;border-top:1px solid var(--line)}
.gfx .end .in{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:22px}
.gfx .end h2{font-size:clamp(34px,4.6vw,58px);font-weight:800;letter-spacing:-.04em;line-height:1.05}
.gfx .city{position:absolute;left:0;right:0;bottom:0;height:200px;color:var(--city);z-index:0}
.gfx .city svg{display:block;width:100%;height:100%}
.gfx .foot{border-top:1px solid var(--line)}
.gfx .foot .in{display:flex;align-items:center;gap:20px;flex-wrap:wrap;padding-top:22px;padding-bottom:22px;font-size:12.5px;color:var(--muted)}
.gfx .foot nav{display:flex;gap:18px;flex-wrap:wrap}
.gfx .foot a{color:var(--muted);text-decoration:none}
.gfx .foot a:hover{color:var(--ink)}
.gfx .foot .cp{margin-left:auto}
.gfx .calm{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0}
.gfx .end h2{margin:0}
.gfx .sec#compare .h2{max-width:24ch}
@media (max-width:760px){
.gfx .foot .cp{margin-left:0}
.gfx .end{padding:56px 0 150px}
.gfx .nav .in{gap:10px}
.gfx .navr .btn:first-child{display:none}
.gfx .sw button{padding:0 14px;font-size:13.5px}
.gfx .stage{height:auto;display:flex;flex-direction:column;gap:10px;padding:0}
.gfx .frame{display:none}
.gfx .tile,.gfx .on .tile,.gfx .tile.t0,.gfx .tile.t1,.gfx .tile.t2,.gfx .tile.t3,.gfx .on .tile.t0,.gfx .on .tile.t1,.gfx .on .tile.t2,.gfx .on .tile.t3{position:relative;left:auto;top:auto;width:100%;height:auto;min-height:92px}
.gfx .tile.t0{transform:rotate(-1.2deg)}
.gfx .tile.t1{transform:rotate(1deg)}
.gfx .tile.t2{transform:rotate(-.8deg)}
.gfx .tile.t3{transform:rotate(1.2deg)}
.gfx .on .tile.t0,.gfx .on .tile.t1,.gfx .on .tile.t2,.gfx .on .tile.t3{transform:none}
.gfx .tile .a{position:relative;inset:auto}
.gfx .tile .b{position:absolute;grid-template-columns:84px minmax(0,1fr);gap:12px;padding:10px}
.gfx .on .tile .a{position:absolute;inset:0;visibility:hidden}
.gfx .on .tile .b{position:relative}
.gfx .tile .b .th{height:84px}
.gfx .hub{position:relative;left:auto;top:auto;transform:none;align-self:center;order:-1;display:none}
.gfx .on .hub{display:block;transform:none}
.gfx .cap{position:relative;top:auto;order:5;font-size:15px}
.gfx .on .cap{display:none}
.gfx .mob-adapt{display:none}
.gfx .on .mob-adapt{display:block;order:6;padding:14px 16px;border-radius:14px;background:var(--sel);border:1px solid var(--line);text-align:center;font-size:15px;font-weight:700}
.gfx .ctas2{flex-direction:column;align-items:stretch}
.gfx .ctas2 .btn{width:100%}
.gfx .cmp table{min-width:640px;font-size:13.5px}
.gfx .cmp th,.gfx .cmp td{padding:12px 12px}
.gfx .cmp .gf{position:sticky;right:0;z-index:1;width:132px;box-shadow:-10px 0 14px -10px rgba(12,16,55,.25)}
.gfx .cmp tbody th{position:sticky;left:0;z-index:1;background:var(--card);width:118px}
.gfx .ptab table{min-width:0;font-size:14px}
.gfx .ptab th,.gfx .ptab td{padding:12px 10px}
.gfx .ptab thead th:first-child{width:38%}}
@media (min-width:761px){.gfx .mob-adapt{display:none}}
.gfx .mth{font-weight:400;white-space:pre-wrap;letter-spacing:0}
.gfx .mth .n{font-family:'KaTeX_Main','Times New Roman',serif}
.gfx .mth .v{font-family:'KaTeX_Math','Times New Roman',serif;font-style:italic}
.gfx .mth .p{font-family:'KaTeX_Main','Times New Roman',serif;font-size:.7em;vertical-align:.55em;line-height:0}
@keyframes gfx-inA{from{opacity:0;transform:translateX(28px)}to{opacity:1;transform:none}}
@keyframes gfx-inB{from{opacity:0;transform:translateX(28px)}to{opacity:1;transform:none}}
@keyframes gfx-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes gfx-draw{from{stroke-dashoffset:40}to{stroke-dashoffset:0}}
@keyframes gfx-ring{from{transform:scale(.4);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes gfx-starPop{0%{transform:scale(.3)}60%{transform:scale(1.45)}100%{transform:scale(1)}}
@keyframes gfx-flyIn{from{opacity:0;transform:translateY(-120px) scale(1.6)}to{opacity:1;transform:none}}
@keyframes gfx-upPulse{0%{box-shadow:0 0 0 0 rgba(241,190,67,.55)}100%{box-shadow:0 0 0 12px rgba(241,190,67,0)}}
.gfx .tq{position:relative;max-width:640px;margin:32px auto 0;padding:22px;overflow:hidden}
.gfx .top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding-bottom:16px;border-bottom:1px solid var(--line)}
.gfx .prog{display:flex;align-items:center;gap:10px;font-size:13.5px;font-weight:800;color:var(--ink)}
.gfx .dots{display:flex;gap:6px}
.gfx .dots i{width:10px;height:10px;border-radius:50%;background:var(--sq0);transition:background .3s,box-shadow .3s}
.gfx .dots i.done{background:var(--gold)}
.gfx .dots i.cur{background:var(--card);box-shadow:inset 0 0 0 2.5px var(--ink)}
.gfx .cbp{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:#0c1037;color:#f1be43;font-size:12.5px;font-weight:800;animation:gfx-rise .3s ease both}
.gfx .diff{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:var(--muted)}
.gfx .diff .stars{display:flex;gap:2px}
.gfx .diff .star{display:inline-block;font-size:18px;line-height:1;color:var(--sq0)}
.gfx .diff .star.on{color:var(--sq3)}
.gfx .diff .star.new{animation:gfx-starPop .55s cubic-bezier(.2,1.6,.4,1) both}
.gfx .diff b{color:var(--ink);font-size:13.5px}
.gfx .qa{animation:gfx-inA .38s cubic-bezier(.2,.8,.2,1) both}
.gfx .qb{animation:gfx-inB .38s cubic-bezier(.2,.8,.2,1) both}
.gfx .topic{margin-top:18px;font-size:12.5px;font-weight:700;color:var(--muted)}
.gfx .stem{margin-top:20px;font-size:21px;font-weight:700;line-height:1.45;color:var(--ink);text-wrap:pretty}
.gfx .mx{font-size:1.25em;white-space:nowrap}
.gfx .opts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:18px}
.gfx .opt{display:flex;align-items:center;gap:12px;min-height:56px;padding:10px 14px;border-radius:12px;border:1.5px solid var(--line);background:var(--card);color:var(--ink);font-size:20px;font-weight:400;text-align:left;transition:transform .12s,border-color .2s,background .2s,opacity .25s}
.gfx .opt:hover:not(:disabled){border-color:var(--line2);background:var(--subtle)}
.gfx .opt:active:not(:disabled){transform:scale(.97)}
.gfx .opt:disabled{cursor:default}
.gfx .opt .k{width:26px;height:26px;flex-shrink:0;border-radius:7px;border:1.5px solid var(--line);display:grid;place-items:center;font-size:12px;font-weight:800;color:var(--muted)}
.gfx .opt.r{border-color:var(--ok);background:var(--okbg)}
.gfx .opt.r .k{border-color:var(--ok);color:var(--ok)}
.gfx .opt.w{border-color:var(--bad);background:var(--badbg)}
.gfx .opt.w .k{border-color:var(--bad);color:var(--bad)}
.gfx .opt.d{opacity:.4}
.gfx .res{margin-top:18px;animation:gfx-rise .35s ease both}
.gfx .res{text-align:center}
.gfx .rh{display:flex;flex-direction:column;align-items:center;gap:10px}
.gfx .ic{width:52px;height:52px;flex-shrink:0;border-radius:50%;display:grid;place-items:center;animation:gfx-ring .35s cubic-bezier(.2,1.6,.4,1) both}
.gfx .ic.ok{background:var(--okbg);color:var(--ok);box-shadow:inset 0 0 0 2px var(--ok)}
.gfx .ic.no{background:var(--badbg);color:var(--bad);box-shadow:inset 0 0 0 2px var(--bad)}
.gfx .ic svg{width:26px;height:26px;fill:none;stroke:currentColor;stroke-width:3.2;stroke-linecap:round;stroke-linejoin:round}
.gfx .ic path{stroke-dasharray:40;stroke-dashoffset:40;animation:gfx-draw .4s ease .15s forwards}
.gfx .rt b{display:block;font-size:22px;font-weight:800;letter-spacing:-.02em;color:var(--ink)}
.gfx .rt > span{display:block;font-size:16px;color:var(--ink2);margin-top:2px}
.gfx .up{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;margin-top:14px;padding:6px 12px;border-radius:999px;background:var(--sel);border:1px solid var(--sq2);font-size:13.5px;font-weight:800;color:var(--ink);animation:gfx-upPulse 1s ease .2s 1}
.gfx .up svg{width:15px;height:15px;fill:none;stroke:var(--goldt);stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
.gfx .why{display:flex;flex-direction:column;gap:10px;margin-top:16px}
.gfx .wr{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border-radius:12px;border:1px solid var(--line);background:var(--subtle);animation:gfx-rise .35s ease both}
.gfx .wr:nth-child(2){animation-delay:.12s}
.gfx .wr .wi{width:34px;height:34px;flex-shrink:0;border-radius:9px;display:grid;place-items:center;background:#0c1037;color:#f1be43}
.gfx .wr .wi svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.gfx .wr b{display:block;font-size:15px;color:var(--ink)}
.gfx .wr span{display:block;font-size:13.5px;color:var(--muted);margin-top:1px}
.gfx .ra{display:flex;flex-direction:column;align-items:center;gap:12px;margin-top:16px}
.gfx .ra .go{min-width:280px}
.gfx .nx{margin:16px auto 0;max-width:420px;padding:12px 16px;border-radius:12px;border:1.5px dashed var(--line2);background:var(--page);display:flex;flex-direction:column;align-items:center;gap:3px;animation:gfx-rise .35s ease .15s both}
.gfx .nx .nl{font-size:11.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--goldt)}
.gfx .nx b{font-size:16.5px;color:var(--ink)}
.gfx .nx .nm{display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;font-size:13.5px;font-weight:600;color:var(--muted)}
.gfx .nx .stars{display:flex;gap:2px}
.gfx .nx .star{font-size:15px;line-height:1;color:var(--sq0)}
.gfx .nx .star.on{color:var(--sq3)}
.gfx .skip{margin:14px 0 0;text-align:center}
.gfx .skip .wk{color:var(--muted);font-size:13.5px;text-decoration-color:var(--line2)}
.gfx .legend{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;max-width:860px;margin:16px auto 0}
.gfx .lgi{display:flex;gap:12px;align-items:flex-start;padding:14px;border-radius:14px;border:1.5px solid var(--line);background:var(--card);transition:border-color .3s,background .3s,transform .3s,box-shadow .3s}
.gfx .lgi .li{width:34px;height:34px;flex-shrink:0;border-radius:9px;display:grid;place-items:center;background:var(--sq0);color:var(--muted);transition:background .3s,color .3s}
.gfx .lgi .li svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2.3;stroke-linecap:round;stroke-linejoin:round}
.gfx .lgi b{display:block;font-size:14.5px;color:var(--ink)}
.gfx .lgi span{display:block;font-size:13px;color:var(--muted);line-height:1.45;margin-top:1px}
.gfx .lgi.lit{border-color:var(--gold);background:var(--sel);transform:translateY(-3px);box-shadow:0 10px 24px -14px rgba(224,169,31,.8)}
.gfx .lgi.lit .li{background:#0c1037;color:#f1be43}
.gfx .wk{border:0;background:none;padding:0;font-size:14px;font-weight:700;color:var(--ink);text-decoration:underline;text-decoration-color:var(--gold);text-decoration-thickness:2px;text-underline-offset:3px}
.gfx .work{margin-top:12px;padding:12px 14px;border-radius:10px;background:var(--subtle);font-size:15px;color:var(--ink2);animation:gfx-rise .25s ease both}
.gfx .go{gap:8px}
.gfx .tray{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:18px;padding-top:14px;border-top:1px solid var(--line)}
.gfx .tray .tl{font-size:12.5px;font-weight:700;color:var(--muted);margin-right:2px}
.gfx .chip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;background:var(--card);border:1px solid var(--line2);font-size:12.5px;font-weight:700;color:var(--ink)}
.gfx .chip svg{width:13px;height:13px;fill:none;stroke:var(--goldt);stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}
.gfx .chip.new{animation:gfx-flyIn .6s cubic-bezier(.2,.8,.2,1) both}
.gfx .fin{text-align:center;padding:0 0 4px}
@keyframes gfx-mqIn{from{opacity:0;transform:translateY(18px) scale(.7)}to{opacity:1;transform:none}}
@keyframes gfx-drift{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@keyframes gfx-driftR{from{transform:translateX(-50%)}to{transform:translateX(0)}}
.gfx .wall{position:relative;margin:-22px -22px 22px;padding:20px 0;display:flex;flex-direction:column;gap:12px;background:var(--subtle);border-bottom:1px solid var(--line);overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent);mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent)}
.gfx .lane{overflow:visible}
.gfx .track{display:flex;gap:12px;width:max-content;animation:gfx-drift 38s linear .9s infinite}
.gfx .lane.l2 .track{animation-name:gfx-driftR;animation-duration:44s}
.gfx .wq{flex-shrink:0;display:flex;flex-direction:column;align-items:flex-start;gap:4px;width:auto;min-width:180px;padding:12px 16px;border-radius:12px;border:1px solid var(--line);background:var(--card);box-shadow:0 8px 18px -14px rgba(12,16,55,.45);text-align:left;animation:gfx-mqIn .45s cubic-bezier(.2,1.4,.4,1) both}
.gfx .wq .ms{font-size:11.5px;font-weight:700;color:var(--muted)}
.gfx .wq .ms b{color:var(--sq3);letter-spacing:.04em;margin-right:6px}
.gfx .wq .mt{font-size:14px;font-weight:700;color:var(--ink);line-height:1.35;white-space:nowrap}
.gfx .wq .mth{font-size:1.12em;white-space:nowrap}
@keyframes gfx-fillIn{to{background:var(--sq3);transform:scale(1)}}
.gfx .adding{min-height:220px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;animation:gfx-rise .3s ease both}
.gfx .adding b{font-size:20px;font-weight:800;color:var(--ink)}
.gfx .tens{display:flex;gap:6px}
.gfx .tens i{width:16px;height:16px;border-radius:5px;background:var(--sq0);transform:scale(.8);animation:gfx-fillIn .2s ease forwards}
.gfx .tens i:nth-child(1){animation-delay:.2s}
.gfx .tens i:nth-child(2){animation-delay:.32s}
.gfx .tens i:nth-child(3){animation-delay:.44s}
.gfx .tens i:nth-child(4){animation-delay:.56s}
.gfx .tens i:nth-child(5){animation-delay:.68s}
.gfx .tens i:nth-child(6){animation-delay:.8s}
.gfx .tens i:nth-child(7){animation-delay:.92s}
.gfx .tens i:nth-child(8){animation-delay:1.04s}
.gfx .tens i:nth-child(9){animation-delay:1.16s}
.gfx .tens i:nth-child(10){animation-delay:1.28s}
.gfx .fin h3{animation:gfx-rise .45s ease .6s both}
.gfx .fin > p{animation:gfx-rise .45s ease .85s both}
.gfx .fin .frows,.gfx .fin .fbtn{animation:gfx-rise .45s ease 1s both}
.gfx .fin > p .wm{font-size:15.5px}
.gfx .fin h3{margin:0;font-size:28px;font-weight:800;letter-spacing:-.025em;line-height:1.15;text-wrap:balance}
.gfx .fin > p{margin:6px auto 0;max-width:30em;color:var(--ink2);font-size:15.5px}
.gfx .frows{display:flex;flex-direction:column;gap:10px;margin:20px 0 0;text-align:left}
.gfx .frow{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:12px 14px;border-radius:12px;border:1px solid var(--line);background:var(--subtle);animation:gfx-rise .35s ease both}
.gfx .frow:nth-child(2){animation-delay:.1s}
.gfx .frow:nth-child(3){animation-delay:.2s}
.gfx .frow span{font-size:13.5px;font-weight:700;color:var(--muted)}
.gfx .frow b{font-size:15px;color:var(--ink)}
.gfx .fst{display:flex;align-items:center;gap:8px}
.gfx .fst .stars{display:flex;gap:2px}
.gfx .fst .star{font-size:18px;line-height:1;color:var(--sq0)}
.gfx .fst .star.on{color:var(--sq3)}
.gfx .fbtn{display:flex;justify-content:center;gap:12px;flex-wrap:wrap;margin-top:22px}
@media (max-width:760px){.gfx .tq{padding:16px}
.gfx .opts{grid-template-columns:minmax(0,1fr)}
.gfx .stem{font-size:19px}
.gfx .ra .btn{width:100%}
.gfx .ra .go{min-width:0}
.gfx .legend{grid-template-columns:minmax(0,1fr);gap:8px}
.gfx .lgi{padding:12px}
.gfx .fbtn .btn{width:100%}
.gfx .wall{margin:-16px -16px 18px}
.gfx .wq{min-width:160px}}
`
