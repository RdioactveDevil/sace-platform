// Generated from the approved homepage design (the Design canvas boards), scoped under .gfx.
// Colours come from the site theme (themeVars in SiteChrome.jsx) through the tokens on .gfx.
export const FEATURES_CSS = `
.gfx{--win:var(--lp-win);--page:var(--lp-page);--card:var(--lp-card);--subtle:var(--lp-subtle);--line:var(--lp-line);--line2:var(--lp-line-2);--ink:var(--lp-ink);--ink2:var(--lp-ink-2);--muted:var(--lp-muted);--faint:var(--lp-faint);--gold:var(--lp-gold);--goldt:var(--lp-gold-text);--ok:var(--lp-ok);--okbg:var(--lp-ok-bg);--bad:var(--lp-bad);--badbg:var(--lp-bad-bg);--sel:var(--lp-sel-row);--sq0:var(--lp-sq0);--sq2:var(--lp-sq2);--sq3:var(--lp-sq3);--faded:var(--lp-faded);--onbg:var(--lp-on-bg);--onfg:var(--lp-on-fg);--float:var(--lp-float);--logo:var(--lp-logo-g);--logof:var(--lp-logo-f);--city:rgba(12,16,55,.07);--ga:.30;--gb:.20;--wave:1}
.gfx.dark{--city:rgba(255,255,255,.05)}
.gfx a{color:inherit}
.gfx a:hover{color:inherit}
.gfx{min-height:100vh;background:var(--win);color:var(--ink);font-family:'Plus Jakarta Sans','Segoe UI',sans-serif;font-size:15px;line-height:1.6;overflow-x:clip;-webkit-font-smoothing:antialiased;transition:background-color .3s,color .3s}
.gfx *,.gfx *::before,.gfx *::after{box-sizing:border-box}
.gfx h1,.gfx h2,.gfx h3,.gfx h4,.gfx p,.gfx ul,.gfx ol,.gfx dl,.gfx dd{margin:0}
.gfx ul,.gfx ol{padding:0;list-style:none}
.gfx h1,.gfx h2,.gfx h3{letter-spacing:-.02em;text-wrap:balance}
.gfx button{font-family:inherit;cursor:pointer}
.gfx button:disabled{cursor:default}
.gfx :focus-visible{outline:2px solid var(--gold);outline-offset:2px}
.gfx .in{max-width:var(--lp-max,1160px);margin:0 auto;padding:0 var(--lp-gutter,28px)}
.gfx .m{font-family:'Cambria Math','STIX Two Math','Latin Modern Math','Times New Roman',serif;font-size:1.08em;letter-spacing:0}
.gfx .btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:42px;padding:0 18px;border-radius:10px;font-size:14px;font-weight:800;white-space:nowrap;border:1px solid var(--line);background:var(--card);color:var(--ink);text-decoration:none}
.gfx .btn:hover{border-color:var(--line2);color:var(--ink)}
.gfx .btn.gold{border:none;background:var(--gold);color:#0c1037}
.gfx .btn.gold:hover{filter:brightness(1.04);color:#0c1037}
.gfx .btn.sm{min-height:34px;padding:0 13px;font-size:13px;border-radius:9px}
.gfx .btn.lg{min-height:50px;padding:0 26px;font-size:16px;border-radius:12px}
.gfx .btn.cta{position:relative;min-height:60px;padding:0 28px 0 32px;gap:10px;font-size:18px;border-radius:14px;letter-spacing:-.01em;box-shadow:0 10px 28px -8px rgba(224,169,31,.75),0 2px 0 rgba(12,16,55,.12);transition:transform .15s,box-shadow .15s}
.gfx .btn.cta:hover{transform:translateY(-2px);box-shadow:0 16px 34px -8px rgba(224,169,31,.85),0 2px 0 rgba(12,16,55,.12)}
.gfx .btn.cta::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;animation:gfx-ctaPulse 2.6s ease-out infinite}
@keyframes gfx-ctaPulse{0%{box-shadow:0 0 0 0 rgba(241,190,67,.55)}70%,100%{box-shadow:0 0 0 14px rgba(241,190,67,0)}}
.gfx .ar{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2.75;stroke-linecap:round;stroke-linejoin:round}
.gfx .i{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
.gfx .i.s{width:16px;height:16px}
.gfx .link{border:none;background:none;padding:0;font-size:inherit;font-weight:700;color:var(--ink);text-decoration:underline;text-decoration-color:var(--gold);text-decoration-thickness:2px;text-underline-offset:3px}
.gfx .card{background:var(--card);border:1px solid var(--line);border-radius:14px}
.gfx .wm{display:inline-flex;align-items:baseline;font-family:'Sifonn Pro','Plus Jakarta Sans',sans-serif;font-size:28px;letter-spacing:.08em;line-height:1;white-space:nowrap;text-decoration:none;color:var(--logo)}
.gfx .wm:hover{color:var(--logo)}
.gfx .wm span{color:var(--logof)}
.gfx .icon-btn{width:34px;height:34px;border-radius:9px;border:1px solid var(--line);background:var(--card);color:var(--muted);display:grid;place-items:center;flex-shrink:0}
.gfx .lab{font-size:13px;font-weight:700;color:var(--muted)}
.gfx .sq{display:block;border-radius:9px;flex-shrink:0;background:var(--sq0)}
.gfx .sq.s1{background:var(--card);box-shadow:inset 0 0 0 2px var(--ink);background-image:radial-gradient(circle,var(--ink) 0 18%,transparent 21%)}
.gfx .sq.s2{background:var(--sq2)}
.gfx .sq.s3{background:var(--sq3)}
@keyframes gfx-qinA{from{opacity:.3;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes gfx-qinB{from{opacity:.3;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes gfx-flow{to{stroke-dashoffset:-9}}
.gfx .nav{position:sticky;top:0;z-index:50;background:var(--win);border-bottom:1px solid var(--line);transition:background-color .3s}
.gfx .nav .in{display:flex;align-items:center;gap:26px;height:62px}
.gfx .navl{display:flex;gap:22px}
.gfx .navl a{font-size:13.5px;font-weight:600;color:var(--muted);text-decoration:none}
.gfx .navl a:hover{color:var(--ink)}
.gfx .navr{margin-left:auto;display:flex;align-items:center;gap:10px}
.gfx .calm{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0}
.gfx .glow{position:absolute;border-radius:50%}
.gfx .glow.a{width:1100px;height:1100px;right:-420px;top:-560px;background:radial-gradient(closest-side,rgba(241,190,67,var(--ga)),rgba(241,190,67,0));animation:gfx-driftA 19s ease-in-out infinite alternate}
.gfx .glow.b{width:900px;height:900px;left:-460px;bottom:-560px;background:radial-gradient(closest-side,rgba(241,190,67,var(--gb)),rgba(241,190,67,0));animation:gfx-driftB 23s ease-in-out infinite alternate}
@keyframes gfx-driftA{to{transform:translate(-150px,130px)}}
@keyframes gfx-driftB{to{transform:translate(130px,-90px)}}
.gfx .waves{position:absolute;left:0;bottom:-30px;width:200%;height:300px;opacity:var(--wave);animation:gfx-waves 70s linear infinite}
@keyframes gfx-waves{to{transform:translateX(-50%)}}
.gfx .waves use{fill:none;stroke:#f1be43;stroke-linecap:round}
.gfx .waves .w1{stroke-width:150;stroke-opacity:.035}
.gfx .waves .w2{stroke-width:80;stroke-opacity:.04}
.gfx .waves .w3{stroke-width:26;stroke-opacity:.05}
.gfx .grain{position:absolute;inset:0;width:100%;height:100%}
.gfx .hero{position:relative;padding:80px 0 112px;overflow:hidden}
.gfx .hero .in{position:relative;z-index:1;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,520px);gap:56px;align-items:center}
.gfx .h1{font-size:clamp(44px,5.4vw,74px);font-weight:800;line-height:1.02;letter-spacing:-.045em}
.gfx .lead{font-size:18.5px;color:var(--ink2);max-width:33em;margin-top:22px;line-height:1.55}
.gfx .ctas{display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin-top:32px}
.gfx .live{position:relative;display:flex;flex-direction:column;gap:12px}
.gfx .hint{position:absolute;right:26px;top:-50px;font-family:'Caveat','Segoe Print',cursive;font-weight:700;font-size:36px;line-height:1;color:var(--goldt);transform:rotate(-3deg);white-space:nowrap;z-index:3}
.gfx .hint svg{position:absolute;right:-26px;top:20px;width:60px;height:90px;overflow:visible}
.gfx .hint path{fill:none;stroke:var(--goldt);stroke-width:3.5;stroke-linecap:round}
.gfx .hint .flow{stroke-dasharray:1 8;animation:gfx-flow .9s linear infinite}
.gfx .qcard{padding:18px;display:flex;flex-direction:column;gap:9px;box-shadow:var(--float)}
.gfx .qcard.qa{animation:gfx-qinA .4s ease}
.gfx .qcard.qb{animation:gfx-qinB .4s ease}
.gfx .qt{display:flex;justify-content:space-between;gap:10px;font-size:12.5px;color:var(--muted)}
.gfx .qt b{color:var(--ink)}
.gfx .qt .st{color:var(--goldt);letter-spacing:.06em}
.gfx .stem{font-size:17px;font-weight:700;margin:2px 0 4px;min-height:2.8em}
.gfx .opt{display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--ink);font-size:15px;font-weight:600;transition:border-color .2s,background .2s}
.gfx .opt:hover:not(:disabled){border-color:var(--line2)}
.gfx .opt .k{width:24px;height:24px;border-radius:6px;border:1px solid var(--line);display:grid;place-items:center;font-size:11.5px;font-weight:800;color:var(--muted);flex-shrink:0}
.gfx .opt .tg{margin-left:auto;font-size:12px;font-weight:700}
.gfx .opt.sel{border-color:var(--ink);box-shadow:0 0 0 1px var(--ink)}
.gfx .opt.r{border-color:var(--ok);background:var(--okbg)}
.gfx .opt.r .k,.gfx .opt.r .tg{color:var(--ok);border-color:var(--ok)}
.gfx .opt.w{border-color:var(--bad);background:var(--badbg)}
.gfx .opt.w .k,.gfx .opt.w .tg{color:var(--bad);border-color:var(--bad)}
.gfx .opt.d{color:var(--faint)}
.gfx .sol{border-top:1px solid var(--line);padding-top:10px;font-size:14px;color:var(--ink2);min-height:54px}
.gfx .sol b{display:block;font-size:12.5px;color:var(--ink)}
.gfx .sol .nq{display:flex;justify-content:flex-end;margin-top:8px}
.gfx .fr .pc{font-size:12.5px;font-weight:700;color:var(--ink2)}
.gfx .qbody{display:flex;flex-direction:column;gap:9px}
.gfx .qbody.qa{animation:gfx-qinA .4s ease}
.gfx .qbody.qb{animation:gfx-qinB .4s ease}
.gfx .feed{margin-top:2px;padding-top:14px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:10px}
.gfx .fr{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:13px;font-weight:700;color:var(--muted)}
.gfx .fr .lv{font-size:17px;color:var(--goldt);letter-spacing:.04em;margin-left:6px;font-weight:700}
.gfx .poolrow{display:flex;align-items:center;gap:12px}
.gfx .poolrow .sqs{flex:1;min-width:0;gap:3px}
.gfx .poolrow .sq{width:12px;height:12px;border-radius:3px;background:var(--sq2)}
.gfx .poolrow .pc{font-size:12.5px;font-weight:700;color:var(--ink2);white-space:nowrap}
.gfx .now{display:flex;align-items:center;gap:9px;font-size:14px;font-weight:700;color:var(--ink);min-height:21px;line-height:1.4}
.gfx .now i{width:8px;height:8px;border-radius:50%;background:var(--faint);flex-shrink:0}
.gfx .now i.on{background:var(--gold);animation:gfx-blink 1s ease-in-out infinite alternate}
.gfx .now.ta{animation:gfx-qinA .4s ease}
.gfx .now.tb{animation:gfx-qinB .4s ease}
.gfx .under{padding:16px 18px;display:flex;flex-direction:column;gap:12px}
.gfx .uh{display:flex;align-items:center;justify-content:space-between;gap:10px}
.gfx .state{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:700;color:var(--muted)}
.gfx .state i{width:8px;height:8px;border-radius:50%;background:var(--faint)}
.gfx .state.on{color:var(--goldt)}
.gfx .state.on i{background:var(--gold);animation:gfx-blink 1s ease-in-out infinite alternate}
@keyframes gfx-blink{from{box-shadow:0 0 0 0 rgba(241,190,67,0)}to{box-shadow:0 0 0 5px rgba(241,190,67,.25)}}
.gfx .lvrow{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:13px;font-weight:700;color:var(--muted)}
.gfx .lvrow .big{font-size:20px;color:var(--goldt);letter-spacing:.04em;margin-left:6px}
.gfx .l5{display:flex;align-items:center;gap:6px}
.gfx .l5 .sq{width:16px;height:16px;border-radius:5px}
.gfx .rows{display:flex;flex-direction:column;gap:6px}
.gfx .prow{display:grid;grid-template-columns:62px minmax(0,1fr) 34px;gap:10px;align-items:center;padding:5px 8px;border-radius:9px;transition:background .3s}
.gfx .prow.tgt{background:var(--sel)}
.gfx .prow .lb{font-size:12px;letter-spacing:.04em;color:var(--goldt)}
.gfx .prow .n{font-size:12.5px;font-weight:800;text-align:right;color:var(--ink2)}
.gfx .sqs{display:flex;gap:4px;align-items:center;min-height:14px;flex-wrap:wrap}
.gfx .sqs .sq{width:14px;height:14px;border-radius:4px}
.gfx .prow.tgt .sqs .sq{background:var(--sq2)}
.gfx .sqs .sq.nw{background:var(--sq3);animation:gfx-pop .6s cubic-bezier(.2,1.6,.4,1) both}
@keyframes gfx-pop{from{transform:scale(0)}to{transform:scale(1)}}
.gfx .sqs small{font-size:11.5px;font-weight:700;color:var(--muted)}
.gfx .sqs em{font-style:normal;font-size:11.5px;color:var(--faint)}
.gfx .thoughts{display:flex;flex-direction:column;gap:3px;min-height:72px;border-top:1px solid var(--line);padding-top:10px}
.gfx .thoughts p{font-size:14px;font-weight:700;line-height:1.4;transition:color .35s}
.gfx .thoughts p.old{color:var(--faded);font-weight:600}
.gfx .thoughts p.ta{animation:gfx-qinA .45s ease}
.gfx .thoughts p.tb{animation:gfx-qinB .45s ease}
.gfx .uf{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:12.5px;color:var(--muted)}
.gfx .sec{position:relative;padding:96px 0;border-top:1px solid var(--line);scroll-margin-top:62px}
.gfx .sec.pg{background:var(--page)}
.gfx .h2{font-size:clamp(32px,4.2vw,54px);font-weight:800;line-height:1.06;letter-spacing:-.035em;text-align:center;max-width:22ch;margin:0 auto}
.gfx .acc{max-width:1060px;margin:40px auto 0;border-top:1px solid var(--line)}
.gfx .acc-i{border-bottom:1px solid var(--line)}
.gfx .acc-h{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:20px;align-items:center;width:100%;padding:26px 4px;border:none;background:none;color:var(--ink);text-align:left}
.gfx .acc-h b{display:block;font-size:clamp(20px,2.2vw,26px);font-weight:800;letter-spacing:-.025em;line-height:1.2}
.gfx .acc-h .d{display:block;margin-top:4px;font-size:15.5px;color:var(--muted);font-weight:500}
.gfx .acc-h .pm{width:42px;height:42px;border-radius:50%;border:1px solid var(--line);background:var(--card);display:grid;place-items:center;color:var(--ink);transition:transform .3s ease,background .3s,color .3s,border-color .3s}
.gfx .acc-h:hover .pm{border-color:var(--line2)}
.gfx .acc-h[aria-expanded="true"] .pm{transform:rotate(45deg);background:var(--onbg);color:var(--onfg);border-color:var(--onbg)}
.gfx .acc-b{padding:2px 4px 36px;animation:gfx-accIn .45s ease}
@keyframes gfx-accIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
.gfx .split{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:40px;align-items:start}
.gfx .txt{display:flex;flex-direction:column;gap:12px;font-size:16px;color:var(--ink2);max-width:36em}
.gfx .txt li{display:grid;grid-template-columns:18px minmax(0,1fr);gap:10px}
.gfx .txt li::before{content:"";width:8px;height:8px;border-radius:2px;background:var(--sq3);margin-top:9px}
.gfx .ladder{padding:14px;display:flex;flex-direction:column;gap:8px;background:var(--subtle)}
.gfx .lrow{display:flex;align-items:center;gap:16px;padding:11px 16px;border-radius:12px;border:1px solid var(--line);background:var(--card);transition:background .35s,border-color .35s}
.gfx .lrow .s{color:var(--goldt);letter-spacing:.08em;font-size:14px;min-width:84px}
.gfx .lrow b{font-size:15px}
.gfx .lrow.on{background:var(--sel);border-color:var(--sq3)}
.gfx .you{margin-left:auto;font-size:12.5px;font-weight:800;padding:4px 10px;border-radius:999px;background:var(--onbg);color:var(--onfg);animation:gfx-qinA .35s ease}
.gfx .lctl{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:4px}
.gfx .lctl .l5{margin-left:auto;font-size:12.5px;font-weight:700;color:var(--muted)}
.gfx .remc{padding:20px;display:flex;flex-direction:column;gap:14px;box-shadow:var(--float)}
.gfx .chip2{display:block;font-size:13px;font-weight:700;padding:9px 11px;border-radius:9px;border:1px solid var(--line);background:var(--card);margin-top:6px}
.gfx .chip2.r{border-color:var(--ok);color:var(--ok);background:var(--okbg)}
.gfx .chip2.w{border-color:var(--bad);color:var(--bad);background:var(--badbg)}
.gfx .strip{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 14px;border-radius:10px;background:var(--card);border:1px solid var(--line);font-size:13px}
.gfx .strip.done{border-color:var(--ok)}
.gfx .strip b{color:var(--ink)}
.gfx .strip .msg{color:var(--muted);flex:1;min-width:0}
.gfx .dots3{display:flex;gap:5px}
.gfx .dots3 .sq{width:14px;height:14px;border-radius:4px}
.gfx .concept{padding:14px;border-radius:12px;border:1px dashed var(--sq3);background:var(--sel);font-size:14px;color:var(--ink2);animation:gfx-qinA .35s ease}
.gfx .concept b{color:var(--ink)}
.gfx .rb{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.gfx .curve{padding:16px 16px 12px;min-width:0}
.gfx .curve-h{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:6px}
.gfx .sw{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden}
.gfx .sw button{border:none;background:transparent;font-size:12px;font-weight:700;color:var(--muted);padding:5px 10px;min-height:30px}
.gfx .sw button + button{border-left:1px solid var(--line)}
.gfx .sw button[aria-pressed="true"]{background:var(--onbg);color:var(--onfg)}
.gfx .key{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;color:var(--muted)}
.gfx .key i{display:inline-block;width:22px;height:0;border-top:3px solid var(--sq3);margin-left:6px}
.gfx .key i.cram{border-top:3px dashed var(--faint)}
.gfx .curve svg{display:block;width:100%;height:auto}
.gfx .curve .lbl{font-size:12px;fill:var(--muted);font-family:'Plus Jakarta Sans',sans-serif}
.gfx .curve .lbl.strong{fill:var(--ink);font-weight:700}
.gfx .curve .gl{stroke:var(--line)}
.gfx .curve .gl.dash{stroke-dasharray:3 5}
.gfx .curve .gl2{stroke:var(--line2)}
.gfx .curve .cramp{fill:none;stroke:var(--faint);stroke-width:3;stroke-dasharray:7 6;stroke-linecap:round;transition:opacity .25s}
.gfx .curve .gfp{fill:none;stroke:var(--sq3);stroke-width:3.5;stroke-linejoin:round;transition:opacity .25s}
.gfx .curve .fade{transition:opacity .25s}
.gfx .curve .rvd{fill:var(--sq3);stroke:var(--card);stroke-width:2.5}
.gfx .grow{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;margin-top:8px}
.gfx .grow > div{display:flex;flex-direction:column;align-items:center;gap:6px;width:76px;text-align:center}
.gfx .grow .sq{width:46px;height:46px;border-radius:10px}
.gfx .grow b{font-size:12.5px}
.gfx .grow span{font-size:11.5px;color:var(--muted);line-height:1.3}
.gfx .grow .s2a{animation:gfx-fillg 7s ease-in-out infinite}
.gfx .grow > div:nth-child(3) .s2a{animation-delay:.6s}
.gfx .grow > div:nth-child(4) .s2a{animation-delay:1.2s}
.gfx .grow .s3a{animation:gfx-fillgold 7s ease-in-out 1.8s infinite}
@keyframes gfx-fillg{0%,8%{background:var(--sq0)}16%,88%{background:var(--sq2)}100%{background:var(--sq0)}}
@keyframes gfx-fillgold{0%,8%{background:var(--sq0);box-shadow:none}16%,88%{background:var(--sq3);box-shadow:0 0 22px rgba(224,169,31,.45)}100%{background:var(--sq0);box-shadow:none}}
.gfx .xb{display:grid;grid-template-columns:minmax(0,340px) minmax(0,1fr);gap:32px;align-items:start}
.gfx .bld{padding:20px;display:flex;flex-direction:column;gap:16px;box-shadow:var(--float)}
.gfx .fld{display:flex;flex-direction:column;gap:8px}
.gfx .seg{display:flex;border:1px solid var(--line);border-radius:10px;overflow:hidden}
.gfx .seg button{flex:1;min-height:42px;background:transparent;border:0;color:var(--ink2);font-weight:700;font-size:13px;padding:0 8px}
.gfx .seg button + button{border-left:1px solid var(--line)}
.gfx .seg button[aria-pressed="true"]{background:var(--onbg);color:var(--onfg)}
.gfx .chips{display:flex;flex-wrap:wrap;gap:8px}
.gfx .chip{min-height:38px;padding:0 13px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--ink2);font-weight:700;font-size:13px;display:inline-flex;align-items:center;gap:8px}
.gfx .chip .bx{width:14px;height:14px;border-radius:4px;border:1.5px solid var(--faint)}
.gfx .chip[aria-pressed="true"]{border-color:var(--sq3);background:var(--sel);color:var(--ink)}
.gfx .chip[aria-pressed="true"] .bx{background:var(--sq3);border-color:var(--sq3)}
.gfx .spec{display:grid;grid-template-columns:auto minmax(0,1fr);gap:7px 14px;font-size:13.5px;padding:14px;border-radius:12px;background:var(--subtle)}
.gfx .spec dt{color:var(--muted);font-weight:700}
.gfx .spec dd{font-weight:800;text-align:right}
.gfx .bb{display:flex;flex-wrap:wrap;gap:8px}
.gfx .bb .btn{flex:1}
.gfx .toast{font-size:13px;font-weight:700;color:#0c1037;background:#f1be43;padding:9px 12px;border-radius:9px;animation:gfx-qinA .3s ease}
.gfx .paperwrap{position:relative;padding:10px 14px 20px}
.gfx .sheet{background:#ffffff;color:#11152f;border-radius:3px;box-shadow:0 30px 60px -28px rgba(12,16,55,.45),0 2px 6px rgba(12,16,55,.12)}
.gfx .sheet.bk{position:absolute;inset:10px 14px 20px;z-index:0}
.gfx .sheet.b1{transform:rotate(-2deg) translate(-8px,10px);background:#f6f7fb}
.gfx .sheet.b2{transform:rotate(1.4deg) translate(10px,6px);background:#fbfbfd}
.gfx .sheet.main{position:relative;z-index:1;padding:32px 38px 26px}
.gfx .sh-top{display:flex;justify-content:space-between;align-items:center;gap:10px;padding-bottom:12px;border-bottom:2px solid #11152f}
.gfx .sh-top .wm{font-size:15px;color:#0c1037}
.gfx .sh-top .wm span{color:#c8920e}
.gfx .sh-top small{font-size:12px;font-weight:700;color:#5a607e;margin-left:10px;font-family:'Plus Jakarta Sans',sans-serif}
.gfx .sh-box{font-weight:800;font-size:12.5px;border:2px solid #11152f;padding:4px 10px}
.gfx .sh-title{font-size:23px;font-weight:800;margin-top:14px}
.gfx .sh-meta{font-size:13px;color:#4b5170;margin-top:3px}
.gfx .secl{margin-top:18px;padding:6px 10px;background:#11152f;color:#ffffff;font-size:12.5px;font-weight:800}
.gfx .pq{padding:12px 0;border-bottom:1px solid #e6e7ee}
.gfx .pq.fa{animation:gfx-flipA .45s ease}
.gfx .pq.fb{animation:gfx-flipB .45s ease}
@keyframes gfx-flipA{from{opacity:0;transform:translateX(14px)}to{opacity:1;transform:none}}
@keyframes gfx-flipB{from{opacity:0;transform:translateX(14px)}to{opacity:1;transform:none}}
.gfx .pq-h{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.gfx .pq-h b{font-size:14px}
.gfx .src{font-size:11.5px;font-weight:700;padding:3px 8px;border-radius:5px}
.gfx .src.past{background:#e7ebff;color:#26368a}
.gfx .src.trial{background:#fff0cc;color:#704b00}
.gfx .src.bank{background:#e2f5eb;color:#17613f}
.gfx .swap{margin-left:auto;width:34px;height:34px;border-radius:8px;border:1px solid #d9dbe6;background:#ffffff;color:#4b5170;display:grid;place-items:center}
.gfx .swap:hover{border-color:#11152f;color:#11152f}
.gfx .pq-s{font-size:15px;margin-top:6px;font-weight:600}
.gfx .pq-o{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3px 18px;margin-top:6px;font-size:14px;color:#2a3050}
.gfx .part{display:grid;grid-template-columns:22px minmax(0,1fr) auto;gap:8px;margin-top:10px;font-size:14px}
.gfx .part em{font-style:normal;font-size:12px;font-weight:800;color:#4b5170;white-space:nowrap}
.gfx .lines{height:54px;margin:4px 0 0 30px;background-image:repeating-linear-gradient(transparent 0 26px,#d5d7e2 26px 27px)}
.gfx .turn{text-align:right;font-weight:700;font-size:12.5px;margin-top:12px}
.gfx .flowrow{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:22px;font-size:14px;font-weight:700;color:var(--ink2)}
.gfx .flowrow span.st2{padding:8px 13px;border-radius:999px;border:1px solid var(--line);background:var(--card)}
.gfx .flowrow span.st2.last{background:var(--sel);border-color:var(--sq3)}
.gfx .flowrow i{font-style:normal;color:var(--faint)}
.gfx .xnote{margin-top:12px;font-size:15px;color:var(--muted)}
.gfx .xnote b{color:var(--ink)}
.gfx .mk{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(0,.92fr);gap:18px;align-items:start}
.gfx .pane{padding:22px}
.gfx .ph{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px}
.gfx .qtext{font-size:17px;font-weight:700;line-height:1.6}
.gfx .an{border-radius:4px;transition:box-shadow .3s,background .3s,text-decoration-color .3s;text-decoration:underline;text-decoration-color:transparent;text-decoration-thickness:2.5px;text-underline-offset:5px}
.gfx .adv-on .an.u{text-decoration-color:var(--sq3)}
.gfx .adv-on .an.c{box-shadow:0 0 0 2px var(--sq3);border-radius:999px;padding:0 6px}
.gfx .advn{margin-top:12px;padding:12px 14px;border-radius:12px;border:1px dashed var(--sq3);background:var(--sel);display:flex;flex-direction:column;gap:4px;animation:gfx-qinA .35s ease}
.gfx .note{font-family:'Caveat',cursive;font-size:23px;line-height:1.15;color:var(--goldt)}
.gfx .yl{margin-top:16px;font-size:13px;font-weight:700;color:var(--muted)}
.gfx .ans{margin-top:6px;padding:14px 16px;border-radius:12px;background:var(--subtle);border:1px solid var(--line);font-size:16px;line-height:1.75;color:var(--ink2)}
.gfx .hl{border-radius:5px;transition:background .25s,box-shadow .25s,color .25s}
.gfx .hl.on{background:var(--okbg);color:var(--ink);box-shadow:0 0 0 3px var(--okbg),inset 0 -2px 0 var(--ok)}
.gfx .hl.miss.on{background:var(--badbg);box-shadow:0 0 0 3px var(--badbg),inset 0 -2px 0 var(--bad)}
.gfx .total{font-size:44px;font-weight:800;letter-spacing:-.03em;line-height:1;color:var(--ink)}
.gfx .total small{font-size:22px;color:var(--muted)}
.gfx .mps{display:flex;flex-direction:column;gap:8px}
.gfx .mp{display:grid;grid-template-columns:30px minmax(0,1fr) auto;gap:12px;align-items:start;width:100%;text-align:left;padding:14px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--ink);transition:border-color .2s,background .2s}
.gfx .mp:hover{border-color:var(--line2)}
.gfx .mp[aria-pressed="true"]{border-color:var(--sq3);background:var(--sel)}
.gfx .tick{width:30px;height:30px;border-radius:8px;display:grid;place-items:center}
.gfx .tick.y{background:var(--okbg);color:var(--ok);border:1px solid var(--ok)}
.gfx .tick.n{background:var(--badbg);color:var(--bad);border:1px solid var(--bad)}
.gfx .mp b{display:block;font-size:14.5px;line-height:1.35}
.gfx .mp .qt2{display:block;margin-top:4px;font-size:13.5px;color:var(--muted);line-height:1.5}
.gfx .mp .pts2{font-size:13px;font-weight:800;color:var(--ink2)}
.gfx .tg{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:18px;align-items:start}
.gfx .ti-h{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--line);font-size:12.5px}
.gfx .ti-h b{font-size:13px}
.gfx .ti-m{padding:16px;display:flex;flex-direction:column;gap:12px;font-size:15px}
.gfx .me{align-self:flex-end;background:var(--subtle);border:1px solid var(--line);border-radius:12px 12px 4px 12px;padding:9px 13px;max-width:86%}
.gfx .re{color:var(--ink2);line-height:1.65}
.gfx .re b{display:block;font-size:12.5px;color:var(--ink)}
.gfx .tcs{display:flex;flex-direction:column;gap:12px}
.gfx .board{position:relative;border-radius:12px;padding:12px 14px 14px;color:#1b2a8f;background-color:#fbfbf7;background-image:linear-gradient(#e9e7dc 1px,transparent 1px),linear-gradient(90deg,#e9e7dc 1px,transparent 1px);background-size:18px 18px;min-height:150px;border:1px solid var(--line)}
.gfx .board .q{font-size:11.5px;font-weight:800;color:#11152f}
.gfx .hw{font-family:'Caveat',cursive;font-size:26px;line-height:1.2;white-space:nowrap}
.gfx .hw1{animation:gfx-hw1 9s linear infinite}
.gfx .hw2{animation:gfx-hw2 9s linear infinite}
@keyframes gfx-hw1{0%{clip-path:inset(0 100% 0 0)}12%,92%{clip-path:inset(0 0 0 0);opacity:1}100%{clip-path:inset(0 0 0 0);opacity:0}}
@keyframes gfx-hw2{0%,15%{clip-path:inset(0 100% 0 0)}30%,92%{clip-path:inset(0 0 0 0);opacity:1}100%{clip-path:inset(0 0 0 0);opacity:0}}
.gfx .tnote{margin-top:6px;font-size:12.5px;font-weight:700;color:#0c1037;background:#f1be43;border-radius:9px 9px 9px 3px;padding:7px 10px;animation:gfx-tnote 9s ease infinite;max-width:330px}
@keyframes gfx-tnote{0%,36%{opacity:0;transform:translateY(6px)}42%,92%{opacity:1;transform:none}100%{opacity:0}}
.gfx .tline{font-size:15px;color:var(--ink2)}
.gfx .tline b{color:var(--ink)}
.gfx .ftabs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
.gfx .ftabs button{min-height:40px;padding:0 15px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--ink2);font-size:13.5px;font-weight:700}
.gfx .ftabs button[aria-pressed="true"]{background:var(--onbg);color:var(--onfg);border-color:var(--onbg)}
.gfx .fq{padding:20px;display:flex;flex-direction:column;gap:10px;animation:gfx-qinA .35s ease;box-shadow:var(--float)}
.gfx .fq .meta{font-size:12px;font-weight:700;color:var(--muted)}
.gfx .fq p{font-size:15.5px;font-weight:700}
.gfx .fq svg{width:100%;max-width:420px;height:auto;display:block}
.gfx .fq svg .ax{stroke:var(--ink);stroke-width:1.5;fill:none}
.gfx .fq svg .cv{stroke:var(--ink);stroke-width:3;fill:none}
.gfx .fq svg .sh2{fill:var(--sq2)}
.gfx .fq svg .pt2{fill:var(--ink)}
.gfx .fq svg text{fill:var(--ink);font-size:12px;font-weight:700;font-family:'Plus Jakarta Sans',sans-serif}
.gfx .fq svg .tap{fill:none;stroke:var(--faint);stroke-width:2;stroke-dasharray:4 4}
.gfx .fq svg .tap.yes{fill:var(--okbg);stroke:var(--ok);stroke-dasharray:none}
.gfx .fopts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
.gfx .fopts span{padding:8px 11px;border-radius:9px;border:1px solid var(--line);font-size:13.5px;font-weight:700}
.gfx .fopts span.r{border-color:var(--ok);background:var(--okbg);color:var(--ok)}
.gfx .numbox{display:flex;align-items:center;gap:10px}
.gfx .numbox .v{min-width:110px;padding:9px 13px;border-radius:9px;border:2px solid var(--ink);font-weight:800;font-size:17px}
.gfx .numbox .u{font-weight:800;color:var(--muted)}
.gfx .ord{display:flex;flex-direction:column;gap:7px}
.gfx .ord span{display:flex;align-items:center;gap:12px;padding:9px 12px;border-radius:9px;border:1px solid var(--line);font-size:14px;font-weight:700}
.gfx .ord span i{font-style:normal;color:var(--faint)}
.gfx .passage{padding:12px 14px;border-left:3px solid var(--sq3);background:var(--subtle);border-radius:6px;font-size:14px;line-height:1.65;font-weight:500}
.gfx .four{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
.gfx .bx{padding:20px;display:flex;flex-direction:column;gap:10px;min-width:0}
.gfx .bx h3{font-size:16.5px;font-weight:800}
.gfx .bx p{font-size:13.5px;color:var(--muted)}
.gfx .rk{display:flex;flex-direction:column;gap:6px}
.gfx .rk div{display:grid;grid-template-columns:22px minmax(0,1fr) auto;gap:8px;align-items:center;font-size:13px;font-weight:700;padding:3px 0}
.gfx .rk .emb{width:14px;height:14px;transform:rotate(45deg);border-radius:3px;background:var(--c);margin:0 4px}
.gfx .rk small{font-size:12px;color:var(--goldt);font-weight:800}
.gfx .rk .me2{background:var(--sel);border-radius:8px}
.gfx .week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}
.gfx .wd{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:11px;font-weight:800;color:var(--muted)}
.gfx .wd .sq{width:100%;aspect-ratio:1;border-radius:7px;display:grid;place-items:center}
.gfx .wd .frz{background:var(--subtle);color:var(--ink2);box-shadow:inset 0 0 0 1.5px var(--line2)}
.gfx .wd .today{background:transparent;box-shadow:inset 0 0 0 2px var(--sq3)}
.gfx .lgr{display:grid;grid-template-columns:18px minmax(0,1fr) auto;gap:8px;align-items:center;padding:6px 8px;border-radius:8px;font-size:13px;font-weight:700;color:var(--ink2)}
.gfx .lgr.you2{background:var(--sel);color:var(--ink);box-shadow:inset 0 0 0 1px var(--sq3)}
.gfx .promo{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;color:var(--ok)}
.gfx .promo::before,.gfx .promo::after{content:"";flex:1;height:1px;background:var(--ok);opacity:.5}
.gfx .grade{display:flex;align-items:baseline;gap:10px}
.gfx .grade b{font-size:58px;font-weight:800;line-height:.9;letter-spacing:-.04em}
.gfx .grade span{font-size:13px;color:var(--muted)}
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
.gfx .end{position:relative;padding:120px 0 200px;text-align:center;overflow:hidden;border-top:1px solid var(--line)}
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
.gfx .navl a[aria-current="page"]{color:var(--ink);text-decoration:underline;text-decoration-color:var(--gold);text-decoration-thickness:2px;text-underline-offset:8px}
.gfx .fwrap{position:relative}
.gfx .in.wide{max-width:1380px}
.gfx .fhead{position:relative;z-index:1;padding:72px 0 40px}
.gfx .fh1{font-size:clamp(40px,4.8vw,64px);font-weight:800;line-height:1.04;letter-spacing:-.045em}
.gfx .fhead .lead{margin-top:14px}
.gfx .fx{position:relative;z-index:1;padding:4px 0 112px}
.gfx .fxg{display:flex;flex-wrap:wrap;gap:28px;align-items:flex-start}
.gfx .fl{flex:0 0 290px;display:flex;flex-direction:column;gap:4px;padding-top:6px}
.gfx .fli{display:flex;align-items:center;gap:12px;width:100%;min-height:48px;text-align:left;padding:11px 14px;border-radius:11px;border:1px solid transparent;background:transparent;color:var(--muted);font-size:15px;font-weight:700;line-height:1.3;transition:background .2s,color .2s,border-color .2s,box-shadow .2s}
.gfx .fli:hover{color:var(--ink)}
.gfx .fli[aria-current="true"]{color:var(--ink);background:var(--card);border-color:var(--line);box-shadow:0 8px 20px -12px rgba(12,16,55,.3)}
.gfx .fli .sq{width:12px;height:12px;border-radius:3px;transition:background .3s}
.gfx .fp{flex:999 1 560px;min-width:0;padding:34px 36px 22px;background:var(--page);box-shadow:var(--float)}
.gfx .fp .acc{max-width:none;margin:0;border-top:none}
.gfx .fp .acc-i{border-bottom:none}
.gfx .fp .acc-h{display:none}
.gfx .fp .acc-b{padding:0}
.gfx .fp-h{margin-bottom:26px}
.gfx .fp-t{font-size:clamp(26px,2.6vw,34px);font-weight:800;letter-spacing:-.03em;line-height:1.12}
.gfx .fp .fp-h{margin-bottom:12px}
.gfx .ex{font-size:17.5px;line-height:1.6;color:var(--ink2);max-width:64ch;margin-bottom:28px}
.gfx .how{display:flex;flex-direction:column;gap:14px;min-width:0}
.gfx .how-h{font-size:15.5px;font-weight:800;color:var(--ink);margin-bottom:14px}
.gfx .how .how-h{margin-bottom:0}
.gfx .rules{display:flex;flex-direction:column;gap:14px;counter-reset:r}
.gfx .rules li{position:relative;padding-left:36px;font-size:14.5px;line-height:1.55;color:var(--ink2)}
.gfx .rules li::before{counter-increment:r;content:counter(r);position:absolute;left:0;top:0;width:24px;height:24px;border-radius:7px;background:var(--sel);box-shadow:inset 0 0 0 1px var(--sq3);color:var(--goldt);font-size:12px;font-weight:800;display:grid;place-items:center}
.gfx .rules li b{display:block;color:var(--ink);font-size:15px;margin-bottom:2px}
.gfx .rules.row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px 26px;margin-bottom:30px}
.gfx .rules.row.r2{grid-template-columns:repeat(2,minmax(0,1fr))}
.gfx .sched{width:100%;border-collapse:collapse;font-size:14.5px}
.gfx .sched th,.gfx .sched td{padding:10px 14px;border-bottom:1px solid var(--line)}
.gfx .sched tr:last-child th,.gfx .sched tr:last-child td{border-bottom:none}
.gfx .sched th{text-align:left;font-weight:700;color:var(--ink2)}
.gfx .sched td{text-align:right;font-weight:800;color:var(--ink);white-space:nowrap}
.gfx .sched td small{font-size:12.5px;font-weight:600;color:var(--muted);margin-left:4px}
.gfx .hn{font-size:13.5px;line-height:1.55;color:var(--muted)}
.gfx .cbx{padding:22px 20px 18px;display:flex;flex-direction:column;gap:14px;min-width:0}
.gfx .cbl{font-size:12.5px;font-weight:700;color:var(--muted)}
.gfx .cbg{display:grid;grid-template-columns:44px 44px 44px minmax(24px,1fr) 44px 44px 44px;column-gap:8px;align-items:center;margin-bottom:26px}
.gfx .cq{width:44px;height:44px;border-radius:10px;display:grid;place-items:center;font-size:12px;font-weight:800;background:var(--sq0);color:var(--muted);transition:background .3s,color .3s,box-shadow .3s;animation:gfx-pop .45s cubic-bezier(.2,1.6,.4,1) both}
.gfx .cq.ok{background:var(--sq3);color:#0c1037}
.gfx .cq.x{background:var(--badbg);color:var(--bad);box-shadow:inset 0 0 0 2px var(--bad)}
.gfx .cq.cur{background:var(--card);color:var(--ink);outline:2px solid var(--ink);outline-offset:-2px;animation:gfx-blink 1s ease-in-out infinite alternate}
.gfx .pause{height:0;border-top:3px solid var(--line2);transition:border-color .3s}
.gfx .pause.paused{border-top-style:dashed;border-top-color:var(--faint)}
.gfx .loop{grid-column:3 / 6;grid-row:2;margin:0 21px;position:relative;border:2px solid var(--sq3);border-top:none;border-radius:0 0 20px 20px;padding:18px 10px 14px;display:flex;flex-wrap:wrap;justify-content:center;gap:6px;transition:opacity .35s,border-color .3s}
.gfx .loop::before,.gfx .loop::after{content:"";position:absolute;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent}
.gfx .loop::before{left:-7px;top:0;border-top:8px solid var(--sq3)}
.gfx .loop::after{right:-7px;top:-8px;border-bottom:8px solid var(--sq3)}
.gfx .loop.off{opacity:0}
.gfx .loop.done{border-color:var(--ok)}
.gfx .loop.done::before{border-top-color:var(--ok)}
.gfx .loop.done::after{border-bottom-color:var(--ok)}
.gfx .loop.plan{border-style:dashed;border-color:var(--faint)}
.gfx .loop.plan::before{border-top-color:var(--faint)}
.gfx .loop.plan::after{border-bottom-color:var(--faint)}
.gfx .loop .cq{width:38px;height:38px;font-size:11.5px}
.gfx .lcap{position:absolute;left:0;right:0;bottom:-24px;text-align:center;font-size:12.5px;font-weight:700;color:var(--goldt)}
.gfx .cbmsg{font-size:14.5px;font-weight:700;color:var(--ink);line-height:1.5;min-height:44px}
@media (max-width:900px){.gfx .rules.row,.gfx .rules.row.r2{grid-template-columns:minmax(0,1fr)}}
.gfx .fp-d{margin-top:8px;font-size:17px;color:var(--muted);max-width:52ch}
.gfx .fp .four{grid-template-columns:repeat(2,minmax(0,1fr))}
.gfx .fp .qcard,.gfx .fp .remc,.gfx .fp .bld,.gfx .fp .fq{box-shadow:0 10px 26px -16px rgba(12,16,55,.3)}
.gfx .fpf{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:30px;padding-top:16px;border-top:1px solid var(--line);font-size:13.5px;font-weight:700;color:var(--muted)}
.gfx .fpf .link{display:inline-flex;align-items:center;gap:6px;font-size:14.5px}
.gfx .fpf .ar{width:16px;height:16px}
@media (max-width:900px){.gfx .fl{flex:1 1 100%;flex-direction:row;overflow-x:auto;gap:6px;padding:2px 2px 6px}
.gfx .fli{width:auto;flex-shrink:0;white-space:nowrap}
.gfx .fp{padding:24px 20px 18px}
.gfx .fp .four{grid-template-columns:minmax(0,1fr)}}
@media (max-width:1000px){.gfx .hero .in,.gfx .split,.gfx .xb,.gfx .mk,.gfx .tg{grid-template-columns:minmax(0,1fr)}
.gfx .live{max-width:560px}
.gfx .four{grid-template-columns:repeat(2,minmax(0,1fr))}
.gfx .navl{display:none}}
@media (max-width:760px){.gfx .nav .in{gap:10px}
.gfx .nav-in{display:none}
.gfx .hero{padding:44px 0 72px}
.gfx .lead{font-size:17px}
.gfx .sec{padding:64px 0}
.gfx .acc-h{padding:20px 2px}
.gfx .four{grid-template-columns:minmax(0,1fr)}
.gfx .sheet.main{padding:22px 16px}
.gfx .pq-o{grid-template-columns:minmax(0,1fr)}
.gfx .foot .cp{margin-left:0}
.gfx .hint{right:6px;top:-44px;font-size:30px}
.gfx .end{padding:80px 0 160px}}
@media (prefers-reduced-motion:reduce){.gfx *,.gfx *::before,.gfx *::after{animation:none !important;transition:none !important}}
`
