/* HEARD capsule blind-box reveal. Vanilla JS, no dependencies.
   Usage: HeardCapsuleReveal.play(containerEl, { monster:"fluffern", assets:{...}, autoOpen:2400, background:true, onDone(){} })
   Container must be positioned (relative/absolute/fixed) and have a size. */
(function(){
const CSS=`
.hcr{position:absolute;inset:0;overflow:hidden;container-type:size;--u:min(1cqw,.5625cqh);--acc:#FFC83D;
 font-family:Nunito,system-ui,sans-serif;color:#FFF1C9;display:flex;flex-direction:column;align-items:center;justify-content:center;
 -webkit-tap-highlight-color:transparent;user-select:none}
.hcr *{box-sizing:border-box;margin:0}
.hcr-bg{position:absolute;inset:0;background:radial-gradient(120% 70% at 50% 42%,#1E63E0 0%,#123C9E 38%,#0A1747 70%,#06103A 100%)}
.hcr-bg i{position:absolute;width:calc(var(--u)*2.2);height:calc(var(--u)*2.2);background:#FFF1C9;
 clip-path:polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%);animation:hcr-tw 3s ease-in-out infinite}
@keyframes hcr-tw{0%,100%{opacity:.05;transform:scale(.6)}50%{opacity:.8;transform:scale(1)}}
.hcr-kicker{position:relative;font:700 calc(var(--u)*5.4) Fredoka,"Arial Rounded MT Bold",system-ui,sans-serif;color:#FFC83D;min-height:calc(var(--u)*8);
 --o:calc(var(--u)*.45);text-shadow:var(--o) 0 0 #0A1747,calc(var(--o)*-1) 0 0 #0A1747,0 var(--o) 0 #0A1747,0 calc(var(--o)*-1) 0 #0A1747,var(--o) var(--o) 0 #0A1747,calc(var(--o)*-1) var(--o) 0 #0A1747,var(--o) calc(var(--o)*-1) 0 #0A1747,calc(var(--o)*-1) calc(var(--o)*-1) 0 #0A1747,0 calc(var(--u)*.9) 0 #0A1747;transition:opacity .3s}
.hcr-spot{position:relative;width:calc(var(--u)*100);height:calc(var(--u)*100);display:grid;place-items:center;flex:none}
.hcr-rays{position:absolute;inset:-25%;border-radius:50%;opacity:0;transition:opacity .5s;
 background:repeating-conic-gradient(from 0deg,color-mix(in srgb,var(--acc) 24%,transparent) 0 9deg,transparent 9deg 22deg);
 -webkit-mask:radial-gradient(circle,#000 12%,transparent 62%);mask:radial-gradient(circle,#000 12%,transparent 62%);animation:hcr-spin 18s linear infinite}
@keyframes hcr-spin{to{transform:rotate(1turn)}}
.hcr-aura{position:absolute;width:70%;height:40%;border-radius:50%;background:radial-gradient(closest-side,rgba(64,230,220,.75),rgba(64,230,220,0));opacity:0}
.hcr-cap{position:absolute;inset:0;cursor:pointer;transform:translateY(-140%) rotate(-25deg);--j:10.4%}
.hcr-cap img{position:absolute;inset:0;width:100%;height:100%}
.hcr-cap .c0{transition:opacity .28s;filter:drop-shadow(0 calc(var(--u)*2) calc(var(--u)*3) rgba(0,0,0,.45))}
.hcr-cap .cL,.hcr-cap .cR{opacity:0}
.hcr-cap .cL{transform:translateX(var(--j))}.hcr-cap .cR{transform:translateX(calc(var(--j)*-1))}
.hcr.s-drop .hcr-cap{animation:hcr-drop .9s cubic-bezier(.3,1.45,.5,1) forwards}
@keyframes hcr-drop{to{transform:none}}
.hcr.s-rattle .hcr-cap{transform:none;animation:hcr-rattle 1.2s ease-in-out infinite}
@keyframes hcr-rattle{0%,40%,100%{transform:none}46%{transform:rotate(-7deg) translateX(-2%)}52%{transform:rotate(7deg) translateX(2%)}58%{transform:rotate(-6deg)}64%{transform:rotate(6deg)}70%{transform:rotate(-3deg) scale(1.04)}78%{transform:scale(1.06)}}
.hcr.s-rattle .hcr-aura{animation:hcr-aura 1.2s ease-in-out infinite}
@keyframes hcr-aura{0%,35%,100%{opacity:0;transform:scale(.7)}75%{opacity:1;transform:scale(1.15)}}
.hcr.p-crack .hcr-cap{transform:none;cursor:default}
.hcr.s-crack .hcr-cap{animation:hcr-jolt .5s ease-out}
@keyframes hcr-jolt{0%{transform:scale(1.06)}30%{transform:scale(.97) rotate(-1.5deg)}60%{transform:scale(1.02) rotate(1deg)}100%{transform:none}}
.hcr.p-crack .c0{opacity:0}
.hcr.p-crack .cL,.hcr.p-crack .cR{opacity:1;transition:transform .5s cubic-bezier(.3,.8,.4,1)}
.hcr.p-crack .cL{transform:translateX(8%)}.hcr.p-crack .cR{transform:translateX(-8%)}
.hcr.p-open .cL,.hcr.p-open .cR{transform:none;transition:transform .8s cubic-bezier(.25,1.2,.4,1)}
.hcr.p-emerge .cL{animation:hcr-rollL 1.25s cubic-bezier(.3,.5,.6,1) forwards}
.hcr.p-emerge .cR{animation:hcr-rollR 1.25s cubic-bezier(.3,.5,.6,1) forwards}
@keyframes hcr-rollL{0%{transform:none}30%{transform:translateX(-16%) rotate(-8deg)}100%{transform:translate(-110%,22%) rotate(-70deg)}}
@keyframes hcr-rollR{0%{transform:none}30%{transform:translateX(16%) rotate(8deg)}100%{transform:translate(110%,22%) rotate(70deg)}}
.hcr-gl{position:absolute;inset:0;width:100%;height:100%;opacity:0;transform:scale(.2);transition:opacity .45s,transform .5s ease-out}
.hcr.p-crack .hcr-gl{opacity:.85;transform:scale(.42)}
.hcr.p-open .hcr-gl{opacity:1;transform:scale(1);transition:opacity .5s,transform .8s cubic-bezier(.25,1.2,.4,1)}
.hcr.s-open .hcr-gl{animation:hcr-shim .8s .5s ease-in-out infinite alternate}
@keyframes hcr-shim{to{transform:scale(1.08) rotate(6deg)}}
.hcr.p-emerge .hcr-gl{opacity:0;transform:scale(2.1);transition:opacity 1.1s .35s,transform 1.4s ease-out}
.hcr.p-emerge .hcr-rays{opacity:.9;transition:opacity 1s .6s}
.hcr-mon{position:absolute;pointer-events:none;opacity:0;transform:translateY(3%) scale(.05);transform-origin:50% 55%;
 filter:drop-shadow(0 calc(var(--u)*2) calc(var(--u)*3) rgba(0,0,0,.4))}
.hcr-white{position:absolute;inset:0;background:#EFFFFF;-webkit-mask-size:100% 100%;mask-size:100% 100%;
 filter:drop-shadow(0 0 calc(var(--u)*2.5) #5CF2F2);opacity:1}
.hcr.s-emerge .hcr-mon{opacity:1;animation:hcr-emerge 1.3s cubic-bezier(.5,.05,.4,1) forwards}
@keyframes hcr-emerge{0%{opacity:0;transform:translateY(3%) scale(.05)}8%{opacity:1}62%{transform:translateY(-5%) scale(.96,1.04)}80%{transform:translateY(1%) scale(1.06,.95)}100%{opacity:1;transform:none}}
.hcr.s-emerge .hcr-white{animation:hcr-colour 1.3s ease-in forwards}
@keyframes hcr-colour{0%,30%{opacity:1}85%,100%{opacity:0}}
.hcr.s-out .hcr-white{opacity:0}
.hcr.s-out .hcr-mon{opacity:1;transform:none;transform-origin:50% 90%;animation:var(--idle) .25s ease-in-out infinite}
.hcr-mon img,.hcr-mon>svg.lids{position:absolute;inset:0;width:100%;height:100%;display:block}
@keyframes hcr-hop{0%,46%,100%{transform:none}8%{transform:scale(1.05,.93)}20%{transform:translateY(calc(var(--u)*-8)) scale(.96,1.05)}32%{transform:scale(1.06,.92)}40%{transform:scale(.99,1.02)}}
@keyframes hcr-rock{0%,100%{transform:rotate(-2.5deg)}50%{transform:rotate(2.5deg) scale(1.02,.985)}}
@keyframes hcr-soar{0%,100%{transform:translateY(calc(var(--u)*1.5)) rotate(-2deg)}50%{transform:translateY(calc(var(--u)*-4)) rotate(3deg)}}
.hcr-lid{transform:translateY(-101%);transform-box:fill-box}
.hcr.s-out .hcr-lid{animation:hcr-blink 3.2s 1s infinite}
@keyframes hcr-blink{0%,30%,42%,48%,58%,100%{transform:translateY(-101%)}35%,38%,52%,54%{transform:translateY(0)}}
.hcr.s-out .hcr-mv{animation:var(--an) var(--du) .8s infinite var(--dir,alternate) var(--ease,ease-in-out)}
@keyframes hcr-earshake{0%,38%,100%{transform:none}4%{transform:skewX(8deg)}9%{transform:skewX(-8deg)}14%{transform:skewX(8deg)}19%{transform:skewX(-8deg)}24%{transform:skewX(6deg)}29%{transform:skewX(-5deg)}34%{transform:skewX(2deg)}60%{transform:skewX(-4deg)}82%{transform:skewX(4deg)}}
@keyframes hcr-flapL{from{transform:skewY(-7deg)}to{transform:skewY(6deg)}}
@keyframes hcr-flapR{from{transform:skewY(7deg)}to{transform:skewY(-6deg)}}
@keyframes hcr-wag{from{transform:skewY(-5deg)}to{transform:skewY(7deg)}}
.hcr-fx{position:absolute;opacity:0;pointer-events:none}
.hcr-tick{font:700 calc(var(--u)*7) Fredoka,sans-serif;color:#FFC83D;text-shadow:0 calc(var(--u)*.4) 0 #6b3d00}
.hcr.s-out .hcr-tick{animation:hcr-tick 2.4s 1.2s ease-out infinite}
@keyframes hcr-tick{0%{opacity:0;transform:translateY(calc(var(--u)*2)) scale(.3)}15%{opacity:1;transform:scale(1.2)}25%{transform:scale(1)}70%{opacity:1}100%{opacity:0;transform:translateY(calc(var(--u)*-16))}}
.hcr-glow{width:calc(var(--u)*9);height:calc(var(--u)*9);margin:calc(var(--u)*-4.5);border-radius:50%;background:radial-gradient(circle,rgba(240,255,140,.9),rgba(200,255,90,0) 65%);mix-blend-mode:screen}
.hcr.s-out .hcr-glow{animation:hcr-glow 1.6s 1s ease-in-out infinite alternate}
@keyframes hcr-glow{from{opacity:.1;transform:scale(.7)}to{opacity:1;transform:scale(1.25)}}
.hcr-scroll .p{transform:scaleY(0);transform-origin:50% 0;transform-box:fill-box}
.hcr.s-out .hcr-scroll{opacity:1;transition:opacity .3s 1.6s}
.hcr.s-out .hcr-scroll .p{animation:hcr-unroll .9s 1.8s cubic-bezier(.3,1.3,.5,1) forwards}
@keyframes hcr-unroll{to{transform:scaleY(1)}}
.hcr-scroll .r2{transform:translateY(-62px)}
.hcr.s-out .hcr-scroll .r2{animation:hcr-rolld .9s 1.8s cubic-bezier(.3,1.3,.5,1) forwards}
@keyframes hcr-rolld{to{transform:none}}
.hcr-scroll .ln{stroke-dasharray:60;stroke-dashoffset:60}
.hcr.s-out .hcr-scroll .ln{animation:hcr-write .5s forwards}
@keyframes hcr-write{to{stroke-dashoffset:0}}
.hcr-conf{position:absolute;left:50%;top:50%;width:calc(var(--u)*2.4);height:calc(var(--u)*3.4);border-radius:calc(var(--u)*.6);pointer-events:none;animation:hcr-cf 1.4s ease-out forwards}
@keyframes hcr-cf{0%{transform:translate(-50%,-50%)}100%{transform:translate(var(--x),var(--y)) rotate(var(--r));opacity:0}}
.hcr-info{position:relative;display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*2.6);min-height:calc(var(--u)*34);
 opacity:0;transform:translateY(calc(var(--u)*4));transition:all .45s .7s;text-align:center}
.hcr.s-out .hcr-info{opacity:1;transform:none}
.hcr-info h2{font:700 calc(var(--u)*8.6)/1.08 Fredoka,"Arial Rounded MT Bold",system-ui,sans-serif;--o:calc(var(--u)*.45);text-shadow:var(--o) 0 0 #0A1747,calc(var(--o)*-1) 0 0 #0A1747,0 var(--o) 0 #0A1747,0 calc(var(--o)*-1) 0 #0A1747,var(--o) var(--o) 0 #0A1747,calc(var(--o)*-1) var(--o) 0 #0A1747,var(--o) calc(var(--o)*-1) 0 #0A1747,calc(var(--o)*-1) calc(var(--o)*-1) 0 #0A1747,0 calc(var(--u)*.9) 0 #0A1747}
.hcr-pill{padding:calc(var(--u)*1.4) calc(var(--u)*5);border-radius:calc(var(--u)*6);background:var(--acc);color:#06103A;font-weight:800;font-size:calc(var(--u)*4.2);border:calc(var(--u)*.7) solid #FFF1C9}
.hcr-info p{font-weight:800;color:#0A1747;background:rgba(255,255,255,.82);padding:calc(var(--u)*1.6) calc(var(--u)*3.2);border-radius:calc(var(--u)*3.5);font-size:calc(var(--u)*4.4);line-height:1.35;max-width:calc(var(--u)*80)}
@media (prefers-reduced-motion:reduce){.hcr-rays,.hcr-bg i,.hcr.s-rattle .hcr-cap,.hcr.s-out .hcr-mv,.hcr.s-out .hcr-lid{animation:none}.hcr-conf,.hcr-fx{display:none}
 .hcr.s-out .hcr-mon{animation:none;transform:none}}
`;
const tick=(l,t,d)=>`<span class="hcr-fx hcr-tick" style="left:${l}%;top:${t}%;animation-delay:${d}s">✓</span>`;
const MONSTERS={
 fluffern:{name:"Fluffern the Consistent",cat:"Building good habits",line:"Turns up every time you check in, snack and checklist packed.",acc:"#FFB627",
  w:579,h:640,idle:"hcr-hop 2.2s",lid:"#F6E9DA",lash:"#5A3A22",eyes:[[350,345,32,30],[459,322,24,30]],
  base:"inset(36.7% 0 0 0)",mv:[{clip:"inset(0 0 62.9% 0)",o:"50% 36.7%",an:"hcr-earshake",du:"3s",dir:"normal",ease:"linear"}],
  fx:tick(84,68,1.2)+tick(93,64,2)+tick(76,72,2.8)},
 murmurak:{name:"Murmurak the Steadfast",cat:"Resilience",line:"Steady on good days and hard days. Walks the whole way with you.",acc:"#3DBE7A",
  w:640,h:573,idle:"hcr-rock 2.8s",lid:"#EADFC6",lash:"#4A2E1A",eyes:[[198,207,30,34],[330,241,35,37]],
  base:"polygon(0 0,100% 0,100% 66%,73.4% 66%,73.4% 100%,0 100%)",mv:[{clip:"inset(65.6% 0 0 73%)",o:"73.4% 80%",an:"hcr-wag",du:".7s"}],
  fx:[[22,17],[54,7],[80,28],[23,52],[67,57],[71,72]].map((p,i)=>`<span class="hcr-fx hcr-glow" style="left:${p[0]}%;top:${p[1]}%;animation-delay:${1+i*.27}s"></span>`).join("")},
 cloudfinch:{name:"Cloudfinch the Brightmind",cat:"Competency & literacy",line:"Carries the scrolls. Helps IBD make sense, one page at a time.",acc:"#4CC3FF",
  w:640,h:557,idle:"hcr-soar 2.4s",lid:"#EAF2FC",lash:"#2A2F5A",eyes:[[423,198,19,20],[489,190,8,16]],
  base:"inset(0 21% 0 41%)",mv:[{clip:"inset(0 58.7% 0 0)",o:"41% 55%",an:"hcr-flapL",du:".45s"},{clip:"inset(0 0 0 78.7%)",o:"79% 45%",an:"hcr-flapR",du:".45s"}],
  fx:`<svg class="hcr-fx hcr-scroll" viewBox="0 0 100 90" style="left:34%;top:74%;width:30%"><g class="p"><rect x="12" y="8" width="76" height="66" fill="#FBEFD0" stroke="#B98A4A" stroke-width="2.5"/></g>${[[26,56,2.7],[40,50,3.1],[54,30,3.5]].map(l=>`<path class="ln" d="M22 ${l[0]}h${l[1]}" stroke="#2A2F5A" stroke-width="3.5" stroke-linecap="round" style="animation-delay:${l[2]}s"/>`).join("")}<rect x="6" y="2" width="88" height="12" rx="6" fill="#E9D3A0" stroke="#B98A4A" stroke-width="2.5"/><rect class="r2" x="6" y="68" width="88" height="12" rx="6" fill="#E9D3A0" stroke="#B98A4A" stroke-width="2.5"/></svg>`}
};
function injectCSS(){if(document.getElementById("hcr-css"))return;const s=document.createElement("style");s.id="hcr-css";s.textContent=CSS;document.head.append(s)}
function play(container,opt){
 opt=Object.assign({monster:"fluffern",autoOpen:2400,background:false,showInfo:true,holdMs:5500,assets:{}},opt||{});
 const m=typeof opt.monster==="string"?MONSTERS[opt.monster]:opt.monster,A=opt.assets,src=A[opt.monster]||m.src;
 injectCSS();
 const root=document.createElement("div");root.className="hcr";root.style.setProperty("--acc",m.acc);
 const big=84,mw=m.w>=m.h?big:big*m.w/m.h,mh=m.w>=m.h?big*m.h/m.w:big;
 const lids=m.eyes.map(([x,y,rx,ry],i)=>`<clipPath id="hcr-e${i}"><ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}"/></clipPath><g clip-path="url(#hcr-e${i})"><g class="hcr-lid"><rect x="${x-rx}" y="${y-ry}" width="${rx*2}" height="${ry*2}" fill="${m.lid}"/><path d="M${x-rx} ${y+ry*.35}Q${x} ${y+ry*1.05} ${x+rx} ${y+ry*.35}" fill="none" stroke="${m.lash}" stroke-width="${Math.max(3,rx*.22)}" stroke-linecap="round"/></g></g>`).join("");
 let stars="";if(opt.background)for(let i=0;i<22;i++)stars+=`<i style="left:${Math.random()*96}%;top:${Math.random()*96}%;animation-delay:${Math.random()*3}s"></i>`;
 root.innerHTML=(opt.background?`<div class="hcr-bg">${stars}</div>`:"")+
 `<div class="hcr-kicker" aria-live="polite"></div>
  <div class="hcr-spot"><div class="hcr-rays"></div><div class="hcr-aura"></div><img class="hcr-gl" src="${A.capsuleGlow}" alt="">
   <div class="hcr-cap" role="button" tabindex="0" aria-label="Open capsule">
    <img class="cL" src="${A.capsuleLeft}" alt=""><img class="cR" src="${A.capsuleRight}" alt=""><img class="c0" src="${A.capsuleClosed}" alt=""></div>
   <div class="hcr-mon" role="img" aria-label="${m.name}" style="width:calc(var(--u)*${mw});height:calc(var(--u)*${mh});--idle:${m.idle}">
    ${m.mv.map(v=>`<img class="hcr-mv" src="${src}" alt="" style="clip-path:${v.clip};transform-origin:${v.o};--an:${v.an};--du:${v.du};${v.dir?`--dir:${v.dir};`:""}${v.ease?`--ease:${v.ease};`:""}">`).join("")}
    <img src="${src}" alt="" style="clip-path:${m.base}"><svg class="lids" viewBox="0 0 ${m.w} ${m.h}">${lids}</svg>${m.fx||""}<div class="hcr-white" style="-webkit-mask-image:url(${src});mask-image:url(${src})"></div></div>
  </div>
  <div class="hcr-info">${opt.showInfo?`<h2>${m.name}</h2><div class="hcr-pill">${m.cat}</div><p>${m.line}</p>`:""}</div>`;
 container.append(root);
 const kick=root.querySelector(".hcr-kicker"),cap=root.querySelector(".hcr-cap");
 let alive=true,resolveTap=null;const timers=[];
 const wait=ms=>new Promise(r=>timers.push(setTimeout(r,ms)));
 const ORDER=["drop","rattle","crack","open","emerge","out"];
 const state=s=>{const i=ORDER.indexOf(s);root.className="hcr s-"+s+ORDER.slice(2,i+1).map(x=>" p-"+x).join("")};
 const open=()=>{resolveTap&&resolveTap()};
 cap.addEventListener("click",open);cap.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open()}});
 (async()=>{
  kick.textContent="You earned a capsule!";state("drop");await wait(1000);if(!alive)return;
  state("rattle");kick.textContent="Tap to open";
  await new Promise(r=>{resolveTap=r;if(opt.autoOpen!==false)timers.push(setTimeout(r,opt.autoOpen))});if(!alive)return;
  kick.style.opacity=0;state("crack");await wait(520);if(!alive)return;
  state("open");await wait(900);if(!alive)return;
  state("emerge");await wait(1300);if(!alive)return;
  state("out");kick.textContent="New pet!";kick.style.opacity=1;
  const spot=root.querySelector(".hcr-spot");
  for(let i=0;i<28;i++){const c=document.createElement("span"),a=Math.random()*6.28,d=28+Math.random()*40;c.className="hcr-conf";
   c.style.background=[m.acc,"#FFF1C9","#40E6DC"][i%3];c.style.setProperty("--x",`calc(var(--u)*${Math.cos(a)*d})`);c.style.setProperty("--y",`calc(var(--u)*${Math.sin(a)*d})`);
   c.style.setProperty("--r",(Math.random()*720-360)+"deg");spot.append(c);timers.push(setTimeout(()=>c.remove(),1500))}
  await wait(opt.holdMs);if(!alive)return;opt.onDone&&opt.onDone();
 })();
 return{open,destroy(){alive=false;timers.forEach(clearTimeout);root.remove()}};
}
window.HeardCapsuleReveal={play,MONSTERS};
})();
