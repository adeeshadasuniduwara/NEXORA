/* NEXORA Pro Chart Workspace — local-only chart tools and a safe Pine-like subset. */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const key="nexora-pro-settings";
const defaults={autoSignal:true,showCrosshair:true,showScriptPlots:true,visibleCandles:120,alertSound:false,upColor:"#70e5bd",downColor:"#f17e8c",backgroundColor:"#0c1522",showGrid:true};
let prefs={...defaults};
try{prefs={...prefs,...JSON.parse(localStorage.getItem(key)||"{}")}}catch(e){}
let menu=null,modal=null,overlay=null,scriptSeries=[],scriptLines=[],lockedTime=null,lastSignalKey="",alerts=[];
try{alerts=JSON.parse(localStorage.getItem("nexora-price-alerts")||"[]")}catch(e){}
function savePrefs(){try{localStorage.setItem(key,JSON.stringify(prefs))}catch(e){}}
function applyChartPrefs(){window.NEXORA_CHART_UP=prefs.upColor;window.NEXORA_CHART_DOWN=prefs.downColor;window.NEXORA_SHOW_GRID=prefs.showGrid;const canvas=$("candleChart");if(canvas)canvas.style.backgroundColor=prefs.backgroundColor;drawChart()}
function el(tag,attrs={},text=""){const n=document.createElement(tag);Object.entries(attrs).forEach(([k,v])=>{if(k==="class")n.className=v;else if(k==="style")n.style.cssText=v;else n.setAttribute(k,v)});if(text)n.textContent=text;return n}
function ensureUi(){
 if($("nexoraProUi"))return;
 const root=el("div",{id:"nexoraProUi"});document.body.append(root);
 menu=el("div",{id:"nexoraContextMenu",class:"nx-context hidden"});root.append(menu);
 modal=el("div",{id:"nexoraModal",class:"nx-modal hidden"});root.append(modal);
 overlay=el("canvas",{id:"nexoraScriptOverlay",class:"nx-script-overlay","aria-hidden":"true"});
 const chartWrap=$("candleChart")?.parentElement;if(chartWrap){chartWrap.append(overlay);chartWrap.style.position="relative"}
 const toolbar=$("chart")?.querySelector(".chart-panel .panel-head .chart-controls");
 if(toolbar){const reset=el("button",{id:"nexoraResetChartBtn",class:"nx-toolbar-btn",type:"button",title:"Reset zoom and pan to the default chart view"},"↺ Reset");toolbar.append(reset);reset.addEventListener("click",resetView);const b=el("button",{id:"nexoraSettingsBtn",class:"nx-toolbar-btn",type:"button"},"⚙ Settings");toolbar.append(b);b.addEventListener("click",showSettings)}
 const row=$("chart")?.querySelector(".chart-panel .chart-tool-row .chart-actions");
 if(row){const b=el("button",{id:"nexoraPineBtn",type:"button"},"⌘ Pine Script");row.append(b);b.addEventListener("click",showScriptEditor)}
 const canvas=$("candleChart");
 if(canvas){canvas.addEventListener("contextmenu",openContextMenu);canvas.addEventListener("pointermove",drawCrosshair);canvas.addEventListener("pointerleave",()=>{if(overlay){const c=overlay.getContext("2d");c.clearRect(0,0,overlay.width,overlay.height);renderScriptOverlay()}})}
 document.addEventListener("pointerdown",e=>{if(menu&&!menu.contains(e.target))menu.classList.add("hidden")});
 document.addEventListener("keydown",e=>{if(e.key==="Escape"){menu?.classList.add("hidden");modal?.classList.add("hidden")}if(e.altKey&&e.key.toLowerCase()==="r"){e.preventDefault();resetView()}});
}
function openModal(title,body,actions=[]){
 modal.replaceChildren();const card=el("section",{class:"nx-modal-card"}),head=el("header",{class:"nx-modal-head"});head.append(el("h3",{},title));const close=el("button",{class:"nx-close",type:"button"},"×");close.onclick=()=>modal.classList.add("hidden");head.append(close);card.append(head);
 const content=el("div",{class:"nx-modal-body"});content.append(body);card.append(content);
 if(actions.length){const foot=el("footer",{class:"nx-modal-foot"});actions.forEach(a=>{const b=el("button",{class:a.primary?"nx-primary":"nx-button",type:"button"},a.label);b.onclick=a.onClick;foot.append(b)});card.append(foot)}
 modal.append(card);modal.classList.remove("hidden");
}
function resetView(){state.view.visible=prefs.visibleCandles||120;state.view.end=state.candles.length;state.view.follow=true;$("liveChartBtn")?.classList.add("tool-active");drawChart();menu?.classList.add("hidden")}
function copyPrice(price){navigator.clipboard?.writeText(String(price)).catch(()=>{});menu?.classList.add("hidden")}
function showSettings(){
 const body=el("div",{class:"nx-settings"});
 const field=(label,control)=>{const row=el("label",{class:"nx-setting-row"});row.append(el("span",{},label),control);body.append(row)};
 const checkbox=(v,fn)=>{const i=el("input",{type:"checkbox"});i.checked=v;i.onchange=()=>fn(i.checked);return i};
 field("Automatically draw SMC signal position",checkbox(prefs.autoSignal,v=>{prefs.autoSignal=v;savePrefs()}));
 field("Show script plots",checkbox(prefs.showScriptPlots,v=>{prefs.showScriptPlots=v;savePrefs();drawChart()}));
 field("Show crosshair",checkbox(prefs.showCrosshair,v=>{prefs.showCrosshair=v;savePrefs();drawChart()}));
 const count=el("select");[60,90,120,150,200,300].forEach(n=>{const o=el("option",{value:String(n)},n+" candles");if(n===prefs.visibleCandles)o.selected=true;count.append(o)});count.onchange=()=>{prefs.visibleCandles=Number(count.value);state.view.visible=prefs.visibleCandles;drawChart();savePrefs()};field("Default visible candles",count);
 const alertSound=checkbox(prefs.alertSound,v=>{prefs.alertSound=v;savePrefs()});field("Alert sound (browser)",alertSound);
 const color=(value,fn)=>{const i=el("input",{type:"color",value});i.oninput=()=>{fn(i.value);savePrefs();applyChartPrefs()};return i};
 field("Bullish candle",color(prefs.upColor,v=>prefs.upColor=v));field("Bearish candle",color(prefs.downColor,v=>prefs.downColor=v));field("Chart background",color(prefs.backgroundColor,v=>prefs.backgroundColor=v));
 field("Chart grid",checkbox(prefs.showGrid,v=>{prefs.showGrid=v;savePrefs();applyChartPrefs()}));
 const note=el("p",{class:"nx-note"},"Settings and chart objects are stored in this browser only. NEXORA does not send exchange orders.");body.append(note);
 openModal("Chart settings",body,[{label:"Reset chart view",onClick:resetView},{label:"Done",primary:true,onClick:()=>modal.classList.add("hidden")}]);
}
function showTable(){
 const body=el("div",{class:"nx-table-wrap"}),table=el("table",{class:"nx-data-table"}),thead=el("thead"),tr=el("tr");
 ["Time","Open","High","Low","Close","Volume"].forEach(v=>tr.append(el("th",{},v)));thead.append(tr);table.append(thead);const tb=el("tbody");
 state.candles.slice(-100).reverse().forEach(c=>{const r=el("tr");[new Date(Number(c.open_time)).toLocaleString(),c.open,c.high,c.low,c.close,c.volume].forEach(v=>r.append(el("td",{},String(v??""))));tb.append(r)});table.append(tb);body.append(table);openModal("Candle table · latest 100",body);
}
function showObjects(){
 const body=el("div",{class:"nx-object-list"});
 const add=(label,detail,remove)=>{const row=el("div",{class:"nx-object-row"});row.append(el("span",{},label+" · "+detail));const b=el("button",{class:"nx-button",type:"button"},"Remove");b.onclick=remove;row.append(b);body.append(row)};
 state.drawings.forEach((d,i)=>add("Drawing "+(i+1),d.type,()=>{state.drawings.splice(i,1);saveWorkspaceMarks();drawChart();showObjects()}));
 Object.entries(state.indicators).forEach(([k,v])=>{if(v)add("Indicator",k,()=>{state.indicators[k]=false;const input=document.querySelector('[data-indicator="'+k+'"]');if(input)input.checked=false;drawChart();showObjects()})});
 if(state.position)add("Position",state.position.direction+" "+state.position.symbol,()=>{state.position=null;saveWorkspaceMarks();renderTradeDesk();drawChart();showObjects()});
 if(!body.children.length)body.append(el("p",{class:"nx-note"},"No chart objects are currently active."));
 openModal("Object tree",body);
}
function saveTemplate(){
 const template={indicators:state.indicators,confirmations:state.confirmations,visible:state.view.visible,drawings:state.drawings,chartPrefs:prefs};
 try{localStorage.setItem("nexora-chart-template-default",JSON.stringify(template));menu.classList.add("hidden");openModal("Chart template saved",el("p",{class:"nx-note"},"Saved this chart layout, indicators, SMC visibility and drawings in this browser."))}catch(e){openModal("Template error",el("p",{},String(e)))}
}
function loadTemplate(){
 try{const t=JSON.parse(localStorage.getItem("nexora-chart-template-default")||"null");if(!t)throw Error("No saved template found.");state.indicators={...state.indicators,...t.indicators};state.confirmations={...state.confirmations,...t.confirmations};state.drawings=Array.isArray(t.drawings)?t.drawings:[];state.view.visible=Number(t.visible)||120;if(t.chartPrefs){prefs={...prefs,...t.chartPrefs};savePrefs();applyChartPrefs()}document.querySelectorAll("[data-indicator]").forEach(i=>i.checked=!!state.indicators[i.dataset.indicator]);document.querySelectorAll("[data-confirm]").forEach(i=>i.checked=!!state.confirmations[i.dataset.confirm]);saveWorkspaceMarks();drawChart();menu.classList.add("hidden")}catch(e){openModal("Chart template",el("p",{class:"nx-note"},e.message))}
}
function addPriceAlert(price){
 const value=Number(price);if(!Number.isFinite(value)||value<=0)return false;
 alerts.push({id:Date.now(),symbol:state.symbol,price:value,createdAt:Date.now(),triggered:false});try{localStorage.setItem("nexora-price-alerts",JSON.stringify(alerts))}catch(e){}return true;
}
function showAlertDialog(price){const body=el("div",{class:"nx-settings"}),input=el("input",{type:"number",step:"any",value:String(price),class:"nx-input"});body.append(el("p",{class:"nx-note"},"Create a local browser alert for "+state.symbol+"."),input);openModal("Add price alert",body,[{label:"Create alert",primary:true,onClick:()=>{const ok=addPriceAlert(input.value);modal.classList.add("hidden");if(ok)openModal("Price alert created",el("p",{class:"nx-note"},state.symbol+" alert set at "+input.value+". It will trigger while this browser workspace is running."))}},{label:"Cancel",onClick:()=>modal.classList.add("hidden")}])}
function openContextMenu(event){
 event.preventDefault();const rect=$("candleChart").getBoundingClientRect(),price=priceAt(event.clientY);
 const items=[
 ["↶","Reset chart view","Alt + R",resetView],
 ["▣","Copy price "+Number(price).toPrecision(10),"",()=>copyPrice(price)],
 ["⧉","Copy latest drawing","",()=>{const d=state.drawings.at(-1);if(d){try{sessionStorage.setItem("nexora-drawing-clipboard",JSON.stringify(d))}catch(e){}}menu.classList.add("hidden")}],
 ["＋","Paste drawing","Ctrl + V",()=>{try{const d=JSON.parse(sessionStorage.getItem("nexora-drawing-clipboard")||"null");if(d){state.drawings.push(JSON.parse(JSON.stringify(d)));saveWorkspaceMarks();drawChart()}}catch(e){}menu.classList.add("hidden")}],
 ["◷","Add alert at "+Number(price).toPrecision(9),"Alt + A",()=>{menu.classList.add("hidden");showAlertDialog(price)}],
 ["│","Lock vertical cursor line by time","",()=>{lockedTime=state.candles[chartIndexAt(event.clientX)]?.open_time??null;menu.classList.add("hidden")}],
 ["▤","Table view","",showTable],["☷","Object tree","",showObjects],
 ["▧","Save chart template","",saveTemplate],["↻","Load chart template","",loadTemplate],
 ["⌫","Remove drawings","",()=>{state.drawings=[];saveWorkspaceMarks();drawChart();menu.classList.add("hidden")}],
 ["×","Remove indicators","",()=>{Object.keys(state.indicators).forEach(k=>state.indicators[k]=false);document.querySelectorAll("[data-indicator]").forEach(i=>i.checked=false);drawChart();menu.classList.add("hidden")}],
 ["⚙","Settings…","",()=>{menu.classList.add("hidden");showSettings()}]
 ];
 menu.replaceChildren();items.forEach(([icon,label,shortcut,fn],i)=>{if(i===1||i===4||i===7||i===9)menu.append(el("div",{class:"nx-menu-sep"}));const b=el("button",{class:"nx-menu-item",type:"button"});b.append(el("span",{class:"nx-menu-icon"},icon),el("span",{class:"nx-menu-label"},label),el("small",{},shortcut));b.onclick=fn;menu.append(b)});
 const x=Math.min(event.clientX,innerWidth-310),y=Math.min(event.clientY,innerHeight-500);menu.style.left=Math.max(6,x)+"px";menu.style.top=Math.max(6,y)+"px";menu.classList.remove("hidden");
}
function drawCrosshair(event){
 if(!overlay||!prefs.showCrosshair)return;
 renderScriptOverlay();const rect=overlay.getBoundingClientRect(),dpr=devicePixelRatio||1;let x=(event.clientX-rect.left)*dpr;const y=(event.clientY-rect.top)*dpr,ctx=overlay.getContext("2d");
 if(lockedTime!==null){const idx=state.candles.findIndex(c=>Number(c.open_time)===Number(lockedTime));if(idx>=0){const end=Math.min(state.candles.length,state.view.end||state.candles.length),begin=Math.max(0,end-state.view.visible),step=(rect.width-92)/state.view.visible;x=(10+(idx-begin+.5)*step)*dpr}}ctx.save();ctx.strokeStyle="#9eb3ca88";ctx.setLineDash([3*dpr,4*dpr]);ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,overlay.height);ctx.moveTo(0,y);ctx.lineTo(overlay.width,y);ctx.stroke();ctx.restore();
}
function renderScriptOverlay(){
 if(!overlay)return;const rect=overlay.getBoundingClientRect(),dpr=devicePixelRatio||1;overlay.width=Math.max(1,Math.floor(rect.width*dpr));overlay.height=Math.max(1,Math.floor(rect.height*dpr));const ctx=overlay.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,rect.width,rect.height);
 if(!prefs.showScriptPlots||!scriptSeries.length||!state.candles.length)return;
 const end=Math.min(state.candles.length,state.view.end||state.candles.length),begin=Math.max(0,end-state.view.visible),data=state.candles.slice(begin,end);if(!data.length)return;
 let lo=Math.min(...data.map(c=>+c.low)),hi=Math.max(...data.map(c=>+c.high));if(state.position&&state.position.symbol===state.symbol)[state.position.entry,state.position.stop,state.position.tp1,state.position.tp2,state.position.tp3].forEach(v=>{lo=Math.min(lo,+v);hi=Math.max(hi,+v)});
 state.drawings.forEach(d=>[d.price,d.p1?.price,d.p2?.price].filter(Number.isFinite).forEach(v=>{lo=Math.min(lo,v);hi=Math.max(hi,v)}));const span=(hi-lo)||1;lo-=span*.06;hi+=span*.06;
 const pad={left:10,right:82,top:12,bottom:22},chartH=rect.height-(state.indicators.rsi?88:0)-pad.top-pad.bottom,chartW=rect.width-pad.left-pad.right,step=chartW/state.view.visible,y=v=>pad.top+(hi-v)/(hi-lo)*chartH,x=i=>pad.left+(i-begin+.5)*step;
 scriptSeries.forEach((series,s)=>{ctx.strokeStyle=series.color||["#f4d35e","#a78bfa","#67d7ef"][s%3];ctx.lineWidth=1.7;ctx.beginPath();let start=false;series.values.slice(begin,end).forEach((v,i)=>{if(!Number.isFinite(v))return;const px=x(begin+i),py=y(v);if(!start){ctx.moveTo(px,py);start=true}else ctx.lineTo(px,py)});ctx.stroke()});
}
const arrays=()=>({open:state.candles.map(c=>+c.open),high:state.candles.map(c=>+c.high),low:state.candles.map(c=>+c.low),close:state.candles.map(c=>+c.close),volume:state.candles.map(c=>+c.volume)});
function sma(values,n){return values.map((_,i)=>i+1<n?NaN:values.slice(i-n+1,i+1).reduce((a,b)=>a+b,0)/n)}
function ema(values,n){const out=Array(values.length).fill(NaN);if(values.length<n)return out;let v=values.slice(0,n).reduce((a,b)=>a+b,0)/n,k=2/(n+1);out[n-1]=v;for(let i=n;i<values.length;i++){v=values[i]*k+v*(1-k);out[i]=v}return out}
function rsi(values,n){const out=Array(values.length).fill(NaN);if(values.length<=n)return out;let g=0,l=0;for(let i=1;i<=n;i++){const d=values[i]-values[i-1];if(d>0)g+=d;else l-=d}g/=n;l/=n;out[n]=l===0?100:100-100/(1+g/l);for(let i=n+1;i<values.length;i++){const d=values[i]-values[i-1];g=(g*(n-1)+Math.max(d,0))/n;l=(l*(n-1)+Math.max(-d,0))/n;out[i]=l===0?100:100-100/(1+g/l)}return out}
/* Deliberately limited Pine-inspired parser: no eval, loops, imports or network access. */
function compileScript(source){
 const a=arrays(),lines=source.split(/\r?\n/),plots=[],errors=[];
 lines.forEach((line,index)=>{const s=line.trim();if(!s||s.startsWith("//")||s.startsWith("indicator(")||s.startsWith("study("))return;
 let m=s.match(/^plot\s*\(\s*(close|open|high|low)\s*(?:,\s*title\s*=\s*"([^"]+)")?\s*\)\s*$/);
 if(m){plots.push({name:m[2]||m[1],values:a[m[1]]});return}
 m=s.match(/^plot\s*\(\s*ta\.(ema|sma)\s*\(\s*(close|open|high|low)\s*,\s*(\d{1,3})\s*\)\s*(?:,\s*title\s*=\s*"([^"]+)")?\s*\)\s*$/);
 if(m){const p=Number(m[3]);if(p<2||p>200){errors.push("Line "+(index+1)+": period must be 2–200");return}plots.push({name:m[4]||m[1].toUpperCase()+" "+p,values:m[1]==="ema"?ema(a[m[2]],p):sma(a[m[2]],p)});return}
 m=s.match(/^hline\s*\(\s*(-?\d+(?:\.\d+)?)\s*\)\s*$/);if(m){plots.push({name:"hline "+m[1],values:Array(a.close.length).fill(Number(m[1]))});return}
 errors.push("Line "+(index+1)+": unsupported syntax — use plot(close/open/high/low), plot(ta.ema/sma(source, period)) or hline(price).");
 });
 return {plots,errors};
}
function showScriptEditor(){
 const body=el("div",{class:"nx-script-editor"}),help=el("div",{class:"nx-script-help"},"Supported safe subset: plot(close), plot(ta.ema(close, 20)), plot(ta.sma(close, 50)), hline(100). This is not the full TradingView Pine Script language.");
 const area=el("textarea",{class:"nx-code",spellcheck:"false"});area.value=localStorage.getItem("nexora-pine-source")||'indicator("NEXORA EMA", overlay=true)\nplot(ta.ema(close, 20), title="EMA 20")\nplot(ta.ema(close, 50), title="EMA 50")';
 const result=el("pre",{class:"nx-script-result"},"Run a script to see validation results.");body.append(help,area,result);
 openModal("Pine Script · compatible subset",body,[{label:"Clear plots",onClick:()=>{scriptSeries=[];renderScriptOverlay();result.textContent="Plots cleared."}},{label:"Add to chart",primary:true,onClick:()=>{const compiled=compileScript(area.value);if(compiled.errors.length){result.textContent=compiled.errors.join("\n");return}scriptSeries=compiled.plots;localStorage.setItem("nexora-pine-source",area.value);renderScriptOverlay();result.textContent="Compiled "+compiled.plots.length+" plot(s): "+compiled.plots.map(p=>p.name).join(", ")+"."}}]);
}
function checkAlerts(){
 const price=Number(state.candles.at(-1)?.close);if(!price)return;let changed=false;
 alerts.forEach(a=>{if(a.triggered||a.symbol!==state.symbol)return;if((a.price>=price&&Number(state.candles.at(-2)?.close)<a.price)||(a.price<=price&&Number(state.candles.at(-2)?.close)>a.price)){a.triggered=true;changed=true;openModal("Price alert triggered",el("p",{class:"nx-note"},a.symbol+" crossed "+a.price));if(prefs.alertSound){try{const ac=new AudioContext(),o=ac.createOscillator(),g=ac.createGain();o.connect(g);g.connect(ac.destination);o.frequency.value=880;g.gain.value=.04;o.start();o.stop(ac.currentTime+.16)}catch(e){}}}});
 if(changed)try{localStorage.setItem("nexora-price-alerts",JSON.stringify(alerts))}catch(e){}
}
function autoSignal(){
 const a=state.analysis;if(!prefs.autoSignal||!a||state.position||!state.candles.length||!a.latestBreak)return;
 const br=a.latestBreak,n=state.candles.length;if(n-1-br.index>2)return;
 const long=!br.bearish,aligned=long?a.structure==="BULLISH STRUCTURE"&&a.ema20>a.ema50&&a.rsi>=50:a.structure==="BEARISH STRUCTURE"&&a.ema20<a.ema50&&a.rsi<=50;
 const idm=a.inducements.some(x=>x.breakIndex===br.index),zone=(long?a.fvgs.some(x=>!x.bearish&&x.index>=br.index-8):a.fvgs.some(x=>x.bearish&&x.index>=br.index-8))||(long?a.orderBlocks.some(x=>!x.bearish&&x.breakIndex===br.index):a.orderBlocks.some(x=>x.bearish&&x.breakIndex===br.index));
 if(!aligned||(!idm&&!zone))return;
 const signalKey=[state.symbol,state.interval,br.index,long?"LONG":"SHORT"].join(":");if(signalKey===lastSignalKey)return;lastSignalKey=signalKey;
 createPosition(long?"LONG":"SHORT",Number(state.candles.at(-1).close));if(state.position){state.position.source="SMC AUTO SIGNAL";state.position.signalKey=signalKey;saveWorkspaceMarks();renderTradeDesk();drawChart();openModal("SMC signal · position added",el("p",{class:"nx-note"},(long?"Bullish":"Bearish")+" structure break with aligned trend and "+(idm?"inducement":"imbalance/block")+" confirmation. A draft position has been drawn. Review Entry, SL and targets; no exchange order was sent."))}
}
const baseCalc=calculateAnalysis;calculateAnalysis=function(){baseCalc();autoSignal()};
const baseDesk=renderTradeDesk;renderTradeDesk=function(){baseDesk();if(state.position?.source==="SMC AUTO SIGNAL"){$("tradeDeskStatus").textContent="AUTO SIGNAL · REVIEW";$("deskDirection").textContent="AUTO SMC · "+state.position.direction+" · "+state.position.symbol}};
const baseDraw=drawChart;drawChart=function(){baseDraw();renderScriptOverlay();checkAlerts()};
document.addEventListener("DOMContentLoaded",()=>{ensureUi();applyChartPrefs()});
})();