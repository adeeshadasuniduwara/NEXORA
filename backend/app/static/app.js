const API="/api/v1";
const state={symbol:"BTCUSDT",interval:"1h",candles:[],symbols:[],tickerMap:new Map(),priceHistory:new Map(),symbolSet:new Set(),trades:[],analysis:null,view:{end:0,visible:120,follow:true},historyLoading:false,historyExhausted:false,indicators:{ema20:true,ema50:true,sma200:false,bb:false,rsi:true},confirmations:{structure:true,fvg:true,ob:true,liquidity:true,eq:true,ema:true,rsi:true,volume:false},drawTool:"cursor",drawings:[],draft:null,position:null,dragging:null,socket:null,socketGeneration:0,retryTimer:null,resizeTimer:null,bookLastUpdateAt:0,book:{bids:[],asks:[]},paintQueued:false,analysisQueued:false,bookRenderQueued:false,pressureQueued:false,lastAnalysisAt:0,searchMatches:[]};
const $=id=>document.getElementById(id);
const fmt=(v,max=8)=>Number(v||0).toLocaleString("en-US",{maximumFractionDigits:max});
const compact=v=>{const n=Number(v||0);return n>=1e9?(n/1e9).toFixed(2)+"B":n>=1e6?(n/1e6).toFixed(2)+"M":n>=1e3?(n/1e3).toFixed(2)+"K":fmt(n,2)};
async function api(path,options={}){const response=await fetch(path,options);if(!response.ok)throw Error(await response.text());return response.json()}
function health(id,message,ok){$(id).textContent=message;$(id).classList.toggle("bad",!ok);$(id).classList.toggle("good",!!ok)}
function setPrice(value){if(value===undefined||value===null)return;const price=fmt(value);$("chartPrice").textContent=price;$("statPrice").textContent=price}
async function loadCandles(){
 state.historyExhausted=false;state.historyLoading=false;
 $("chartLoading").classList.remove("hidden");
 try{
  const data=await api(`${API}/market/candles?symbol=${encodeURIComponent(state.symbol)}&interval=${state.interval}&limit=1000`);
  state.candles=data.candles||[];state.view.end=state.candles.length;state.view.follow=true;calculateAnalysis();drawChart();$("chartLoading").classList.add("hidden");
  const candle=state.candles.at(-1);if(candle){setPrice(candle.close);$("priceFoot").textContent="Latest Binance candle"}
  health("restHealth","Connected",true);
 }catch(error){$("chartLoading").innerHTML="<span>Market history unavailable — check connection and retry.</span>";health("restHealth","Offline",false)}
}
function ema(values,period){
 if(values.length<period)return null;
 const multiplier=2/(period+1);let value=values.slice(0,period).reduce((a,b)=>a+b,0)/period;
 for(let i=period;i<values.length;i++)value=(values[i]-value)*multiplier+value;
 return value;
}
function calculateAnalysis(){
 const candles=state.candles,n=candles.length;
 if(n<20){state.analysis=null;renderAnalysis();return}
 const highs=candles.map(c=>Number(c.high)),lows=candles.map(c=>Number(c.low)),opens=candles.map(c=>Number(c.open)),closes=candles.map(c=>Number(c.close)),last=closes.at(-1);
 const ema20=ema(closes,20),ema50=ema(closes,50);
 let gains=0,losses=0;for(let i=Math.max(1,n-14);i<n;i++){const d=closes[i]-closes[i-1];if(d>0)gains+=d;else losses-=d}
 const rs=losses===0?Infinity:(gains/14)/(losses/14),rsi=losses===0?100:100-(100/(1+rs));
 const pivots=(radius)=>{const ph=[],pl=[];for(let i=radius;i<n-radius;i++){let isHigh=true,isLow=true;for(let j=1;j<=radius;j++){if(highs[i]<=highs[i-j]||highs[i]<highs[i+j])isHigh=false;if(lows[i]>=lows[i-j]||lows[i]>lows[i+j])isLow=false}if(isHigh)ph.push({index:i,price:highs[i]});if(isLow)pl.push({index:i,price:lows[i]})}return {highs:ph,lows:pl}};
 const internal=pivots(2),external=pivots(4),majorHighs=external.highs,majorLows=external.lows;
 const lastTwo=(arr)=>arr.slice(-2),h2=lastTwo(majorHighs),l2=lastTwo(majorLows);
 let structure="RANGING",structureDetail="Waiting for confirmed external swing sequence",bias="NEUTRAL";
 if(h2.length===2&&l2.length===2){const hh=h2[1].price>h2[0].price,hl=l2[1].price>l2[0].price,lh=h2[1].price<h2[0].price,ll=l2[1].price<l2[0].price;if(hh&&hl){structure="BULLISH STRUCTURE";bias="BULLISH"}else if(lh&&ll){structure="BEARISH STRUCTURE";bias="BEARISH"}structureDetail=(hh?"HH":lh?"LH":"Unconfirmed high")+" · "+(hl?"HL":ll?"LL":"Unconfirmed low")}
 const events=[],breaks=[];let workingBias="NEUTRAL";
 const seenHigh=new Set(),seenLow=new Set();
 for(let i=Math.max(1,n-180);i<n;i++){
  const priorHigh=[...majorHighs].reverse().find(p=>p.index<i-4),priorLow=[...majorLows].reverse().find(p=>p.index<i-4);
  if(priorHigh&&!seenHigh.has(priorHigh.index)&&closes[i]>priorHigh.price&&closes[i-1]<=priorHigh.price){const change=workingBias==="BEARISH",event={name:change?"Bullish CHoCH":"Bullish BOS",kind:change?"CHoCH":"BOS",price:priorHigh.price,index:i,bearish:false,brokenSwing:priorHigh};events.push(event);breaks.push(event);seenHigh.add(priorHigh.index);workingBias="BULLISH"}
  if(priorLow&&!seenLow.has(priorLow.index)&&closes[i]<priorLow.price&&closes[i-1]>=priorLow.price){const change=workingBias==="BULLISH",event={name:change?"Bearish CHoCH":"Bearish BOS",kind:change?"CHoCH":"BOS",price:priorLow.price,index:i,bearish:true,brokenSwing:priorLow};events.push(event);breaks.push(event);seenLow.add(priorLow.index);workingBias="BEARISH"}
 }
 const latestBreak=breaks.at(-1)||null;
 const swings=[...majorHighs.slice(-3).map(p=>({...p,name:"HH / LH",bearish:false})),...majorLows.slice(-3).map(p=>({...p,name:"HL / LL",bearish:true}))].sort((a,b)=>a.index-b.index);
 const sweeps=[];
 for(const p of internal.highs.slice(-35)){const hit=candles.slice(p.index+1).findIndex((c,j)=>p.index+1+j<n&&highs[p.index+1+j]>p.price&&closes[p.index+1+j]<p.price);if(hit>=0){const i=p.index+1+hit;sweeps.push({type:"Buy-side liquidity sweep",price:p.price,index:i,bearish:true})}}
 for(const p of internal.lows.slice(-35)){const hit=candles.slice(p.index+1).findIndex((c,j)=>p.index+1+j<n&&lows[p.index+1+j]<p.price&&closes[p.index+1+j]>p.price);if(hit>=0){const i=p.index+1+hit;sweeps.push({type:"Sell-side liquidity sweep",price:p.price,index:i,bearish:false})}}
 const inducements=[];
 for(const br of breaks.slice(-12)){const candidates=br.bearish?internal.highs:internal.lows;const start=Math.max(0,br.index-24);const candidate=candidates.filter(p=>p.index>=start&&p.index<br.index).reverse().find(p=>sweeps.some(sw=>sw.index>p.index&&sw.index<br.index&&Math.abs(sw.price-p.price)<=Math.max(last*.0005,1e-12)));if(candidate){const sw=sweeps.filter(x=>x.index>candidate.index&&x.index<br.index).at(-1);if(sw)inducements.push({type:"Inducement (IDM)",price:candidate.price,index:sw.index,bearish:br.bearish,breakIndex:br.index,confirmedBy:br.name})}}
 const fvgs=[];
 for(let i=Math.max(2,n-160);i<n;i++){if(lows[i]>highs[i-2])fvgs.push({type:"Bullish FVG",low:highs[i-2],high:lows[i],index:i,bearish:false});else if(highs[i]<lows[i-2])fvgs.push({type:"Bearish FVG",low:highs[i],high:lows[i-2],index:i,bearish:true})}
 const ifvgs=[];for(const z of fvgs){const later=closes.slice(z.index+1).findIndex(c=>z.bearish?c>z.high:c<z.low);if(later>=0){const index=z.index+1+later;if(index<n-1)ifvgs.push({type:z.bearish?"Bullish IFVG":"Bearish IFVG",low:z.low,high:z.high,index,bearish:!z.bearish})}}
 const orderBlocks=[];for(const br of breaks.slice(-20)){for(let i=br.index-1;i>=Math.max(0,br.index-12);i--){if((!br.bearish&&closes[i]<opens[i])||(br.bearish&&closes[i]>opens[i])){orderBlocks.push({type:br.bearish?"Bearish Order Block":"Bullish Order Block",low:lows[i],high:highs[i],index:i,bearish:br.bearish,breakIndex:br.index});break}}}
 const breakers=[],mitigationBlocks=[];for(const ob of orderBlocks){const invalid=closes.slice(ob.breakIndex+1).findIndex(c=>ob.bearish?c>ob.high:c<ob.low);if(invalid>=0){const index=ob.breakIndex+1+invalid;breakers.push({type:ob.bearish?"Bullish Breaker Block":"Bearish Breaker Block",low:ob.low,high:ob.high,index,bearish:!ob.bearish})}else{const retest= candles.slice(ob.breakIndex+1).findIndex(c=>+c.low<=ob.high&&+c.high>=ob.low);if(retest>=0){const index=ob.breakIndex+1+retest;mitigationBlocks.push({type:"Mitigation Block candidate",low:ob.low,high:ob.high,index,bearish:ob.bearish})}}}
 const trueRanges=candles.map((c,i)=>i===0?highs[i]-lows[i]:Math.max(highs[i]-lows[i],Math.abs(highs[i]-closes[i-1]),Math.abs(lows[i]-closes[i-1]))),atr14=trueRanges.slice(-14).reduce((a,b)=>a+b,0)/Math.max(1,trueRanges.slice(-14).length);
 const displacements=[];for(let i=Math.max(1,n-100);i<n;i++){const body=Math.abs(closes[i]-opens[i]),span=Math.max(1e-12,highs[i]-lows[i]),closeStrength=closes[i]>opens[i]?(highs[i]-closes[i])/span:(closes[i]-lows[i])/span;if(body>=atr14*1.5&&closeStrength<=.25)displacements.push({type:closes[i]>opens[i]?"Bullish Displacement":"Bearish Displacement",index:i,price:closes[i],bearish:closes[i]<opens[i]})}
 const liquidityVoids=[];for(let i=Math.max(2,n-100);i<n;i++){const gapUp=lows[i]>highs[i-2],gapDown=highs[i]<lows[i-2];if(gapUp||gapDown){const gap=gapUp?lows[i]-highs[i-2]:lows[i-2]-highs[i];if(gap>=atr14*.35)liquidityVoids.push({type:gapUp?"Bullish Liquidity Void":"Bearish Liquidity Void",low:gapUp?highs[i-2]:highs[i],high:gapUp?lows[i]:lows[i-2],index:i,bearish:gapDown})}}
 const swingLabels=[];majorHighs.slice(-12).forEach((p,i,arr)=>{const prev=arr[i-1];if(prev)swingLabels.push({...p,label:p.price>prev.price?"HH":"LH",bearish:p.price<prev.price})});majorLows.slice(-12).forEach((p,i,arr)=>{const prev=arr[i-1];if(prev)swingLabels.push({...p,label:p.price>prev.price?"HL":"LL",bearish:p.price<prev.price})});
 const rejectionBlocks=[];for(let i=Math.max(1,n-80);i<n;i++){const body=Math.abs(closes[i]-opens[i]),upper=highs[i]-Math.max(opens[i],closes[i]),lower=Math.min(opens[i],closes[i])-lows[i];if(upper>Math.max(body*2,atr14*.45)&&closes[i]<opens[i])rejectionBlocks.push({type:"Bearish Rejection Block candidate",low:Math.max(opens[i],closes[i]),high:highs[i],index:i,bearish:true});if(lower>Math.max(body*2,atr14*.45)&&closes[i]>opens[i])rejectionBlocks.push({type:"Bullish Rejection Block candidate",low:lows[i],high:Math.min(opens[i],closes[i]),index:i,bearish:false})}
 const tolerance=last*.001,equal=(arr)=>arr.slice(-30).flatMap((p,i)=>arr.slice(i+1).filter(q=>Math.abs(q.price-p.price)<=tolerance).map(q=>({price:(p.price+q.price)/2,index:q.index,firstIndex:p.index}))).at(-1)||null;
 const equalHigh=equal(internal.highs),equalLow=equal(internal.lows);
 const rangeHigh=majorHighs.at(-1)||internal.highs.at(-1),rangeLow=majorLows.at(-1)||internal.lows.at(-1),range=rangeHigh&&rangeLow?{high:Math.max(rangeHigh.price,rangeLow.price),low:Math.min(rangeHigh.price,rangeLow.price)}:null,mid=range?(range.high+range.low)/2:null;
 const zone=mid===null?"UNKNOWN":last>mid?"PREMIUM":"DISCOUNT";
 const score=(ema20>ema50?1:-1)+(last>ema20?1:-1)+(rsi>=55?1:rsi<=45?-1:0)+(bias==="BULLISH"?1:bias==="BEARISH"?-1:0)+(latestBreak?(latestBreak.bearish?-1:1):0);
 const finalBias=score>=2?"BULLISH":score<=-2?"BEARISH":"NEUTRAL";
 state.analysis={ema20,ema50,rsi,structure,structureDetail,events:events.slice(-15).reverse(),swings,swingLabels,fvgs,ifvgs,orderBlocks,breakers,mitigationBlocks,rejectionBlocks,displacements,liquidityVoids,sweeps:sweeps.slice(-20),inducements,liquidity:{equalHigh,equalLow},dealingRange:range,equilibrium:mid,premiumDiscount:zone,bias:finalBias,score,last,internal,external,latestBreak};
 renderAnalysis();if(state.position)renderTradeDesk();
}

function renderAnalysis(){
 const a=state.analysis;
 if(!a){$("analysisState").textContent="NEED MORE DATA";$("analysisBias").textContent="—";$("analysisReason").textContent="At least 55 candles are required for stable EMA 50 analysis.";$("analysisScore").textContent="—";$("analysisScoreLabel").textContent="Not enough data";return}
 $("analysisState").textContent="UPDATED · "+state.interval.toUpperCase();
 $("analysisBias").textContent=a.bias;$("analysisBias").className=a.bias==="BULLISH"?"bullish":a.bias==="BEARISH"?"bearish":"";
 $("analysisReason").textContent="Based on EMA alignment, RSI, confirmed swing structure and the latest candle.";
 $("analysisScore").textContent=(a.score>0?"+":"")+a.score+"/5";$("analysisScoreLabel").textContent=a.score>=2?"Bullish confluence":a.score<=-2?"Bearish confluence":"Mixed conditions";
 $("analysisStructure").textContent=a.structure;$("analysisStructureDetail").textContent=a.structureDetail;
 $("analysisEma").textContent=a.ema20>a.ema50?"EMA 20 above 50":"EMA 20 below 50";$("analysisEmaDetail").textContent="20: "+fmt(a.ema20)+" · 50: "+fmt(a.ema50);
 $("analysisRsi").textContent=a.rsi.toFixed(1);$("analysisRsiDetail").textContent=a.rsi>=70?"Overbought zone":a.rsi<=30?"Oversold zone":a.rsi>=50?"Above midpoint":"Below midpoint";
 const highs=a.liquidity.equalHigh,lows=a.liquidity.equalLow;
 $("analysisLiquidity").textContent=(highs?"EQH":"")+(highs&&lows?" / ":"")+(lows?"EQL":"")||"No equal levels";
 $("analysisLiquidityDetail").textContent=(highs?"EQH near "+fmt(highs.price):"No confirmed EQH")+" · "+(lows?"EQL near "+fmt(lows.price):"No confirmed EQL")+" · "+a.premiumDiscount;
 const eventHost=$("structureEvents");eventHost.replaceChildren();
 const eventRows=a.events.slice(0,4);
 if(!eventRows.length)eventHost.textContent="No confirmed swing events in the current window.";
 eventRows.forEach(item=>{const row=document.createElement("div");row.className="analysis-event";const name=document.createElement("b");name.textContent=item.name;if(item.bearish)name.classList.add("bearish");const value=document.createElement("span");value.textContent=fmt(item.price);row.append(name,value);eventHost.appendChild(row)});
 const extra=[...a.inducements,...a.sweeps,...a.displacements,...a.liquidityVoids,...a.orderBlocks,...a.breakers,...a.mitigationBlocks,...a.rejectionBlocks];extra.slice(-12).reverse().forEach(item=>{const row=document.createElement("div");row.className="analysis-event";const name=document.createElement("b");name.textContent=item.type;if(item.bearish)name.classList.add("bearish");const value=document.createElement("span");value.textContent=fmt(item.price??item.low)+" – "+fmt(item.high??item.price);row.append(name,value);eventHost.appendChild(row)});
 const fvgHost=$("fvgEvents");fvgHost.replaceChildren();
 if(!a.fvgs.length)fvgHost.textContent="No recent three-candle imbalance detected.";
 [...a.fvgs.slice(-4),...a.ifvgs.slice(-4)].reverse().forEach(item=>{const row=document.createElement("div");row.className="analysis-event";const name=document.createElement("b");name.textContent=item.type;if(item.bearish)name.classList.add("bearish");const value=document.createElement("span");value.textContent=fmt(item.low)+" – "+fmt(item.high);row.append(name,value);fvgHost.appendChild(row)});
}
function indicatorSeries(values,period,type="ema"){
 if(values.length<period)return values.map(()=>null);
 if(type==="sma")return values.map((_,i)=>i+1<period?null:values.slice(i-period+1,i+1).reduce((a,b)=>a+b,0)/period);
 const out=Array(values.length).fill(null),k=2/(period+1);let v=values.slice(0,period).reduce((a,b)=>a+b,0)/period;out[period-1]=v;
 for(let i=period;i<values.length;i++){v=values[i]*k+v*(1-k);out[i]=v}return out;
}
function rsiSeries(values,period=14){
 const out=Array(values.length).fill(null);if(values.length<=period)return out;
 let gain=0,loss=0;for(let i=1;i<=period;i++){const d=values[i]-values[i-1];if(d>0)gain+=d;else loss-=d}
 let ag=gain/period,al=loss/period;out[period]=al===0?100:100-100/(1+ag/al);
 for(let i=period+1;i<values.length;i++){const d=values[i]-values[i-1];ag=(ag*(period-1)+Math.max(d,0))/period;al=(al*(period-1)+Math.max(-d,0))/period;out[i]=al===0?100:100-100/(1+ag/al)}return out;
}
function saveWorkspaceMarks(){try{localStorage.setItem("nexora-marks-"+state.symbol,JSON.stringify({drawings:state.drawings}));if(state.position)localStorage.setItem("nexora-active-position",JSON.stringify(state.position));else localStorage.removeItem("nexora-active-position")}catch(error){}}
function loadWorkspaceMarks(){try{const saved=JSON.parse(localStorage.getItem("nexora-marks-"+state.symbol)||"{}");state.drawings=Array.isArray(saved.drawings)?saved.drawings:[];state.position=JSON.parse(localStorage.getItem("nexora-active-position")||"null");renderTradeDesk()}catch(error){state.drawings=[];state.position=null}}
function chartMetrics(){
 const canvas=$("candleChart"),rect=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
 canvas.width=Math.max(1,Math.floor(rect.width*dpr));canvas.height=Math.max(1,Math.floor(rect.height*dpr));
 const ctx=canvas.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);
 const width=rect.width,height=rect.height,visible=state.view.visible,end=Math.min(state.candles.length,state.view.end||state.candles.length),begin=Math.max(0,end-visible),data=state.candles.slice(begin,end);
 const pad={left:10,right:82,top:12,bottom:22},chartH=height-(state.indicators.rsi?88:0)-pad.top-pad.bottom,chartW=width-pad.left-pad.right;
 return {ctx,width,height,data,begin,end,pad,chartH,chartW};
}
function drawRsi(values){
 const canvas=$("rsiChart");if(!canvas)return;canvas.classList.toggle("hidden",!state.indicators.rsi);if(!state.indicators.rsi)return;
 const rect=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;canvas.width=Math.max(1,Math.floor(rect.width*dpr));canvas.height=Math.max(1,Math.floor(rect.height*dpr));const ctx=canvas.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);
 const width=rect.width,height=rect.height,series=rsiSeries(values),visible=state.view.visible,end=Math.min(state.candles.length,state.view.end||state.candles.length),begin=Math.max(0,end-visible),data=series.slice(begin,end),left=10,right=82,step=(width-left-right)/Math.max(1,visible);
 ctx.clearRect(0,0,width,height);ctx.fillStyle="#0c1522";ctx.fillRect(0,0,width,height);ctx.font="8px DM Mono";ctx.fillStyle="#8090a5";ctx.textAlign="right";
 [30,50,70].forEach(level=>{const y=height-(level/100)*height;ctx.strokeStyle=level===50?"#526078":"#26364a";ctx.setLineDash(level===50?[]:[3,4]);ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(width-right,y);ctx.stroke();ctx.fillText(String(level),width-5,y+3)});ctx.setLineDash([]);
 ctx.strokeStyle="#b89cff";ctx.lineWidth=1.5;ctx.beginPath();let started=false;data.forEach((v,i)=>{if(v===null)return;const x=left+(i+.5)*step,y=height-(v/100)*height;if(!started){ctx.moveTo(x,y);started=true}else ctx.lineTo(x,y)});ctx.stroke();ctx.fillStyle="#b89cff";ctx.textAlign="left";const last=[...data].reverse().find(v=>v!==null);ctx.fillText(last===undefined?"RSI 14":"RSI 14 · "+last.toFixed(1),left+5,11);
}
function drawChart(){
 const m=chartMetrics(),{ctx,width,height,data,begin,end,pad,chartH,chartW}=m;if(!data.length)return;
 ctx.clearRect(0,0,width,height);const highs=data.map(c=>+c.high),lows=data.map(c=>+c.low),allCloses=state.candles.map(c=>+c.close),closes=allCloses.slice(begin,end);
 const ema20=indicatorSeries(allCloses,20).slice(begin,end),ema50=indicatorSeries(allCloses,50).slice(begin,end),sma200=indicatorSeries(allCloses,200).slice(begin,end),mid=indicatorSeries(allCloses,20,"sma").slice(begin,end);
 const allMid=indicatorSeries(allCloses,20,"sma"),allSd=allCloses.map((_,i)=>i<19?null:Math.sqrt(allCloses.slice(i-19,i+1).reduce((sum,v)=>sum+(v-allMid[i])**2,0)/20)),sd=allSd.slice(begin,end);
 let low=Math.min(...lows),high=Math.max(...highs);const position=state.position;
 if(position){[position.entry,position.stop,position.tp1,position.tp2,position.tp3].forEach(v=>{if(Number.isFinite(+v)){low=Math.min(low,+v);high=Math.max(high,+v)}})}
 if(state.drawings.length){state.drawings.forEach(d=>{if(d.price){low=Math.min(low,d.price);high=Math.max(high,d.price)}if(d.p1?.price){low=Math.min(low,d.p1.price);high=Math.max(high,d.p1.price)}if(d.p2?.price){low=Math.min(low,d.p2.price);high=Math.max(high,d.p2.price)}})}
 const range=(high-low)||1;low-=range*.06;high+=range*.06;const y=v=>pad.top+(high-v)/(high-low)*chartH,step=chartW/state.view.visible,bodyW=Math.max(2,Math.min(9,step*.64)),x=i=>pad.left+(i-begin+.5)*step;
 ctx.font="9px DM Mono";ctx.textAlign="right";ctx.strokeStyle="#243247";ctx.fillStyle="#8795a9";
 for(let i=0;i<=5;i++){const yy=pad.top+chartH*i/5;ctx.beginPath();ctx.moveTo(pad.left,yy);ctx.lineTo(width-pad.right,yy);ctx.stroke();ctx.fillText(fmt(high-(high-low)*i/5),width-5,yy+3)}
 data.forEach((c,i)=>{const xx=x(begin+i),up=+c.close>=+c.open,color=up?"#70e5bd":"#f17e8c",top=Math.min(y(+c.open),y(+c.close)),bodyH=Math.max(1,Math.abs(y(+c.open)-y(+c.close)));ctx.strokeStyle=color;ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(xx,y(+c.high));ctx.lineTo(xx,y(+c.low));ctx.stroke();ctx.fillRect(xx-bodyW/2,top,bodyW,bodyH)});
 const line=(values,color,dash=[])=>{ctx.strokeStyle=color;ctx.lineWidth=1.35;ctx.setLineDash(dash);ctx.beginPath();let started=false;values.forEach((v,i)=>{if(v===null||v===undefined)return;const xx=x(begin+i),yy=y(v);if(!started){ctx.moveTo(xx,yy);started=true}else ctx.lineTo(xx,yy)});ctx.stroke();ctx.setLineDash([])};
 if(state.indicators.ema20)line(ema20,"#e9c46a");if(state.indicators.ema50)line(ema50,"#76b9e8");if(state.indicators.sma200)line(sma200,"#c79bff");
 if(state.indicators.bb){line(mid,"#9ba9bb",[4,3]);line(mid.map((v,i)=>v===null?null:v+2*(sd[i]||0)),"#8294a866",[3,3]);line(mid.map((v,i)=>v===null?null:v-2*(sd[i]||0)),"#8294a866",[3,3])}
 const a=state.analysis;
 if(a){if(state.confirmations.fvg)a.fvgs.slice(-20).forEach(z=>{const xx=x(z.index);if(xx<pad.left||xx>width-pad.right)return;ctx.fillStyle=z.bearish?"#f17e8c19":"#70e5bd19";ctx.strokeStyle=z.bearish?"#f17e8c66":"#70e5bd66";const top=y(z.high),bottom=y(z.low),w=Math.max(1,width-pad.right-xx),h=Math.max(2,bottom-top);ctx.fillRect(xx,top,w,h);ctx.strokeRect(xx,top,w,h)});if(state.confirmations.ifvg)a.ifvgs.slice(-12).forEach(z=>{const xx=x(z.index);ctx.fillStyle=z.bearish?"#f17e8c33":"#70e5bd33";ctx.strokeStyle=z.bearish?"#f17e8caa":"#70e5bdaa";ctx.fillRect(xx,y(z.high),Math.max(1,width-pad.right-xx),Math.max(2,y(z.low)-y(z.high)));ctx.strokeRect(xx,y(z.high),Math.max(1,width-pad.right-xx),Math.max(2,y(z.low)-y(z.high)))});if(state.confirmations.ob)a.orderBlocks.slice(-6).forEach(z=>{const xx=x(z.index);ctx.fillStyle=z.bearish?"#f17e8c22":"#70e5bd22";ctx.strokeStyle=z.bearish?"#f17e8c88":"#70e5bd88";ctx.fillRect(xx,y(z.high),Math.max(1,width-pad.right-xx),Math.max(2,y(z.low)-y(z.high)));ctx.strokeRect(xx,y(z.high),Math.max(1,width-pad.right-xx),Math.max(2,y(z.low)-y(z.high)))});if(state.confirmations.rejection)a.rejectionBlocks.slice(-5).forEach(z=>{const xx=x(z.index);ctx.strokeStyle=z.bearish?"#f17e8c":"#70e5bd";ctx.setLineDash([1,3]);ctx.strokeRect(xx,y(z.high),Math.max(1,width-pad.right-xx),Math.max(2,y(z.low)-y(z.high)));ctx.setLineDash([])});if(state.confirmations.mitigation)a.mitigationBlocks.slice(-5).forEach(z=>{const xx=x(z.index);ctx.fillStyle="#e9c46a20";ctx.strokeStyle="#e9c46a88";ctx.fillRect(xx,y(z.high),Math.max(1,width-pad.right-xx),Math.max(2,y(z.low)-y(z.high)));ctx.strokeRect(xx,y(z.high),Math.max(1,width-pad.right-xx),Math.max(2,y(z.low)-y(z.high)))});if(state.confirmations.liquidity)a.sweeps.slice(-8).forEach(z=>{const xx=x(z.index),yy=y(z.price);ctx.fillStyle=z.bearish?"#f17e8c":"#70e5bd";ctx.font="8px DM Mono";ctx.fillText(z.type,xx+4,yy+(z.bearish?-8:12))});if(state.confirmations.liquidityVoid)a.liquidityVoids.slice(-8).forEach(z=>{const xx=x(z.index);ctx.fillStyle=z.bearish?"#f17e8c14":"#70e5bd14";ctx.strokeStyle=z.bearish?"#f17e8c55":"#70e5bd55";ctx.fillRect(xx,y(z.high),Math.max(1,width-pad.right-xx),Math.max(2,y(z.low)-y(z.high)));ctx.strokeRect(xx,y(z.high),Math.max(1,width-pad.right-xx),Math.max(2,y(z.low)-y(z.high)))});if(state.confirmations.eq){[["EQH",a.liquidity.equalHigh],["EQL",a.liquidity.equalLow]].forEach(([label,p])=>{if(!p)return;const yy=y(p.price);ctx.strokeStyle="#d6b87588";ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(pad.left,yy);ctx.lineTo(width-pad.right,yy);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle="#d6b875";ctx.font="8px DM Mono";ctx.fillText(label,pad.left+6,yy-4)})}if(state.confirmations.premiumDiscount&&a.dealingRange){const mid=a.equilibrium;ctx.strokeStyle="#b89cff88";ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(pad.left,y(mid));ctx.lineTo(width-pad.right,y(mid));ctx.stroke();ctx.setLineDash([]);ctx.fillStyle="#b89cff";ctx.font="8px DM Mono";ctx.fillText("EQ · "+a.premiumDiscount,pad.left+6,y(mid)-5)}if(state.confirmations.breakers)a.breakers.slice(-5).forEach(z=>{const xx=x(z.index);ctx.strokeStyle=z.bearish?"#f17e8c":"#70e5bd";ctx.setLineDash([2,3]);ctx.strokeRect(xx,y(z.high),Math.max(1,width-pad.right-xx),Math.max(2,y(z.low)-y(z.high)));ctx.setLineDash([])});if(state.confirmations.idm)a.inducements.slice(-8).forEach(z=>{const xx=x(z.index),yy=y(z.price);ctx.fillStyle="#f2c879";ctx.font="8px DM Mono";ctx.fillText("IDM",xx,yy-5);ctx.strokeStyle="#f2c87988";ctx.setLineDash([2,3]);ctx.beginPath();ctx.moveTo(xx,yy);ctx.lineTo(width-pad.right,yy);ctx.stroke();ctx.setLineDash([])});if(state.confirmations.structure){a.swingLabels.slice(-14).forEach(e=>{const xx=x(e.index),yy=y(e.price);ctx.fillStyle=e.bearish?"#f17e8c":"#70e5bd";ctx.font="8px DM Mono";ctx.textAlign="center";ctx.fillText(e.label,xx,yy+(e.label==="HH"||e.label==="LH"?-8:12))});a.events.slice(-8).forEach(e=>{const xx=x(e.index),yy=y(e.price);ctx.fillStyle=e.bearish?"#f17e8c":"#70e5bd";ctx.font="8px DM Mono";ctx.textAlign="left";ctx.fillText(e.name,xx+3,yy-6)})}}
 state.drawings.forEach(d=>drawManualMark(ctx,d,x,y,pad,width,height));
 if(position&&position.symbol===state.symbol)drawPosition(ctx,position,y,pad,width);
 const last=data.at(-1),lastY=y(+last.close);ctx.setLineDash([4,4]);ctx.strokeStyle="#70e5bd88";ctx.beginPath();ctx.moveTo(pad.left,lastY);ctx.lineTo(width-pad.right,lastY);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle="#173d36";ctx.fillRect(width-pad.right+4,lastY-9,74,18);ctx.fillStyle="#a2f4d9";ctx.textAlign="center";ctx.fillText(fmt(last.close),width-pad.right+41,lastY+3);
 drawRsi(allCloses);
}
function drawPosition(ctx,p,y,pad,width){
 const levels=[["ENTRY",p.entry,"#e9c46a"],["SL",p.stop,"#f17e8c"],["TP1",p.tp1,"#70e5bd"],["TP2",p.tp2,"#70e5bd"],["TP3",p.tp3,"#70e5bd"]];
 levels.forEach(([label,value,color])=>{const yy=y(value);ctx.strokeStyle=color;ctx.setLineDash(label==="ENTRY"?[]:[5,4]);ctx.lineWidth=label==="ENTRY"?1.7:1;ctx.beginPath();ctx.moveTo(pad.left,yy);ctx.lineTo(width-pad.right,yy);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=color;ctx.textAlign="left";ctx.font="9px DM Mono";ctx.fillText(label+" "+fmt(value),pad.left+4,yy-4)});
}
function drawManualMark(ctx,d,x,y,pad,width,height){
 ctx.save();ctx.strokeStyle=d.color||"#91a9c9";ctx.fillStyle=d.color||"#91a9c9";ctx.lineWidth=1.4;
 if(d.type==="horizontal"){const yy=y(d.price);ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(pad.left,yy);ctx.lineTo(width-pad.right,yy);ctx.stroke();ctx.fillText(d.label||"Level",pad.left+5,yy-5)}
 if(d.type==="trendline"&&d.p1&&d.p2){ctx.beginPath();ctx.moveTo(x(d.p1.index),y(d.p1.price));ctx.lineTo(x(d.p2.index),y(d.p2.price));ctx.stroke()}
 if(d.type==="rectangle"&&d.p1&&d.p2){const xx=x(Math.min(d.p1.index,d.p2.index)),yy=y(Math.max(d.p1.price,d.p2.price)),w=Math.abs(d.p2.index-d.p1.index)*((width-pad.left-pad.right)/state.view.visible),h=Math.abs(y(d.p1.price)-y(d.p2.price));ctx.globalAlpha=.12;ctx.fillRect(xx,yy,w,h);ctx.globalAlpha=1;ctx.strokeRect(xx,yy,w,h)}
 if(d.type==="text"){ctx.font="11px Manrope";ctx.fillText(d.text||"Note",x(d.index),y(d.price))}
 ctx.restore();
}
function priceAt(clientY){const rect=$("candleChart").getBoundingClientRect(),end=state.view.end||state.candles.length,begin=Math.max(0,end-state.view.visible),data=state.candles.slice(begin,end);if(!data.length)return 0;let lo=Math.min(...data.map(c=>+c.low)),hi=Math.max(...data.map(c=>+c.high));if(state.position&&state.position.symbol===state.symbol)[state.position.entry,state.position.stop,state.position.tp1,state.position.tp2,state.position.tp3].forEach(v=>{lo=Math.min(lo,+v);hi=Math.max(hi,+v)});state.drawings.forEach(d=>[d.price,d.p1?.price,d.p2?.price].filter(Number.isFinite).forEach(v=>{lo=Math.min(lo,v);hi=Math.max(hi,v)}));const range=(hi-lo)||1;lo-=range*.06;hi+=range*.06;const top=12,chartH=rect.height-(state.indicators.rsi?88:0)-34;return hi-(clientY-rect.top-top)/chartH*(hi-lo)}
function createPosition(direction,price){
 const recent=state.candles.slice(-15),tr=recent.slice(1).map((c,i)=>Math.max(+c.high- +c.low,Math.abs(+c.high- +recent[i].close),Math.abs(+c.low- +recent[i].close))),atr=tr.length?tr.reduce((a,b)=>a+b,0)/tr.length:price*.01,risk=Math.max(atr*1.5,price*.001),stop=direction==="LONG"?price-risk:price+risk,unit=Math.abs(price-stop);
 state.position={direction,symbol:state.symbol,entry:price,stop,tp1:price+(direction==="LONG"?1:-1)*unit,tp2:price+(direction==="LONG"?2:-2)*unit,tp3:price+(direction==="LONG"?3:-3)*unit,createdAt:Date.now()};
 saveWorkspaceMarks();renderTradeDesk();drawChart();
}
function renderTradeDesk(){
 const p=state.position,active=!!p;$("tradeDeskEmpty").classList.toggle("hidden",active);$("tradeDeskActive").classList.toggle("hidden",!active);$("tradeDeskStatus").textContent=active?"ONE ACTIVE SETUP":"NO ACTIVE SETUP";
 if(!p)return;$("deskDirection").textContent=p.direction+" · "+p.symbol;$("deskRiskReward").textContent="R:R 1:3";
 $("deskEntry").textContent=fmt(p.entry);$("deskStop").textContent=fmt(p.stop);$("deskTp1").textContent=fmt(p.tp1);$("deskTp2").textContent=fmt(p.tp2);$("deskTp3").textContent=fmt(p.tp3);
 const a=state.analysis,host=$("deskConfirmations");host.replaceChildren();const recentVol=state.candles.slice(-20).map(c=>Number(c.volume||0)),volAvg=recentVol.length?recentVol.reduce((x,y)=>x+y,0)/recentVol.length:0,volOk=recentVol.length>1&&recentVol.at(-1)>volAvg;const checks=[["EMA","ema",a&&((p.direction==="LONG"&&a.ema20>a.ema50)||(p.direction==="SHORT"&&a.ema20<a.ema50))],["RSI","rsi",a&&(p.direction==="LONG"?a.rsi>50:a.rsi<50)],["Structure","structure",a&&(p.direction==="LONG"?a.structure==="BULLISH STRUCTURE":a.structure==="BEARISH STRUCTURE")],["FVG","fvg",a&&a.fvgs.some(z=>!z.bearish===(p.direction==="LONG"))],["IFVG","ifvg",a&&a.ifvgs.some(z=>!z.bearish===(p.direction==="LONG"))],["Volume","volume",volOk],["Liquidity sweep","liquidity",a&&a.sweeps.some(z=>z.bearish===(p.direction==="SHORT"))],["Premium / Discount","premiumDiscount",a&&(p.direction==="LONG"?a.premiumDiscount==="DISCOUNT":a.premiumDiscount==="PREMIUM")],["Mitigation block","mitigation",a&&a.mitigationBlocks.some(z=>z.bearish===(p.direction==="SHORT"))],["Displacement","displacement",a&&a.displacements.some(z=>z.bearish===(p.direction==="SHORT"))],["Rejection block","rejection",a&&a.rejectionBlocks.some(z=>z.bearish===(p.direction==="SHORT"))],["Inducement","idm",a&&a.inducements.some(z=>z.bearish===(p.direction==="SHORT"))],["Order block","ob",a&&a.orderBlocks.some(z=>z.bearish===(p.direction==="SHORT"))],["Breaker block","breakers",a&&a.breakers.some(z=>z.bearish===(p.direction==="SHORT"))],["EQH / EQL","eq",a&&!!(p.direction==="LONG"?a.liquidity.equalLow:a.liquidity.equalHigh)]];
 checks.filter(([,key])=>state.confirmations[key]).forEach(([name,key,ok])=>{const el=document.createElement("span");el.className=ok?"confirm-ok":"confirm-pending";el.textContent=(ok?"✓ ":"○ ")+name;host.appendChild(el)});
}

async function loadOlderHistory(){
 if(state.historyLoading||state.historyExhausted||!state.candles.length)return;
 state.historyLoading=true;
 try{
  const first=state.candles[0],endTime=new Date(Number(first.open_time)).toISOString();
  const data=await api(`${API}/market/candles?symbol=${encodeURIComponent(state.symbol)}&interval=${state.interval}&limit=1000&end_time=${encodeURIComponent(endTime)}`);
  const older=(data.candles||[]).filter(c=>Number(c.open_time)<Number(first.open_time));
  if(!older.length){state.historyExhausted=true;return}
  const oldEnd=state.view.end||state.candles.length;
  state.candles=older.concat(state.candles).slice(-5000);
  const added=older.length;state.drawings.forEach(d=>{if(d.index!==undefined)d.index+=added;if(d.p1)d.p1.index+=added;if(d.p2)d.p2.index+=added});if(state.dragging?.startEnd)state.dragging.startEnd+=added;saveWorkspaceMarks();state.view.end=Math.min(state.candles.length,oldEnd+added);calculateAnalysis();drawChart();
 }catch(error){$("chartChange").textContent="HISTORY LOAD FAILED · "+String(error.message||error).slice(0,80)}
 finally{state.historyLoading=false}
}
function updateCandle(k){
 const candle={open_time:k.t,open:k.o,high:k.h,low:k.l,close:k.c,volume:k.v},last=state.candles.at(-1);
 if(last&&Number(last.open_time)===Number(candle.open_time)){const liveClose=Number(last.close),liveHigh=Number(last.high),liveLow=Number(last.low);candle.high=Math.max(Number(candle.high),liveHigh);candle.low=Math.min(Number(candle.low),liveLow);if(!k.x&&liveClose!==Number(candle.close))candle.close=String(liveClose);state.candles[state.candles.length-1]=candle}else state.candles.push(candle);
 if(state.candles.length>5000)state.candles.shift();if(state.view.follow)state.view.end=state.candles.length;if(k.x)calculateAnalysis();scheduleMarketPaint();setPrice(candle.close);
}
async function loadSymbols(){
 try{const data=await api(API+"/market/symbols");state.symbols=(data.symbols||[]).filter(item=>item.status==="TRADING").sort((a,b)=>a.symbol.localeCompare(b.symbol));state.symbolSet=new Set(state.symbols.map(item=>item.symbol));$("pairCount").textContent=state.symbols.length.toLocaleString("en-US");if(!state.symbols.some(item=>item.symbol===state.symbol))state.symbol="BTCUSDT";renderPairSuggestions($("pairSearch").value);health("localHealth","Online",true);return state.symbols}catch(error){health("localHealth","API error",false);return []}
}
function selectSymbol(symbol){
 state.symbol=symbol;state.view={end:0,visible:120,follow:true};loadWorkspaceMarks();try{localStorage.setItem("nexora-selected-symbol",symbol)}catch(error){}$("pairSearch").value=symbol;$("statSymbol").textContent=symbol;$("chartTitle").innerHTML=symbol+" <span>·</span> "+state.interval.toUpperCase();
 $("bookMidPrice").textContent="—";$("bookSpread").textContent="Spread —";$("asks").innerHTML='<div class="book-empty">Loading ask depth…</div>';$("bids").innerHTML='<div class="book-empty">Loading bid depth…</div>';
 state.book={bids:[],asks:[]};state.bookLastUpdateAt=0;$("depthStatus").textContent="WAITING";$("depthStatus").classList.remove("live-tag");state.trades=[];renderPressure();loadCandles().then(startLive);
}
function renderPairSuggestions(query=""){
 const host=$("pairSuggestions");if(!host)return;const q=query.trim().toUpperCase();const matches=q?state.symbols.filter(item=>item.symbol.includes(q)||item.base_asset.includes(q)||item.quote_asset.includes(q)):state.symbols;state.searchMatches=matches;host.replaceChildren();const fragment=document.createDocumentFragment();matches.forEach(item=>{const row=document.createElement("button");row.type="button";row.className="pair-option";const symbol=document.createElement("b");symbol.textContent=item.symbol;const assets=document.createElement("span");assets.textContent=item.base_asset+" / "+item.quote_asset;row.append(symbol,assets);row.addEventListener("click",()=>{host.classList.add("hidden");selectSymbol(item.symbol)});fragment.appendChild(row)});host.appendChild(fragment);$("pairSuggestionCount").textContent=matches.length.toLocaleString()+" pairs";host.classList.toggle("hidden",document.activeElement!==$("pairSearch")&& !q);}
function searchPair(){const query=$("pairSearch").value.trim().toUpperCase().replace(/[^A-Z0-9]/g,"");if(!query)return;const match=state.symbols.find(item=>item.symbol===query);if(match){$("pairSuggestions").classList.add("hidden");selectSymbol(match.symbol);return}renderPairSuggestions(query);$("pairSuggestions").classList.remove("hidden");}
function renderMovers(){
 const rows=[...state.tickerMap.values()].filter(t=>state.symbolSet.has(t.s)).map(t=>{const history=state.priceHistory.get(t.s)||[],oldest=history[0],fastMove=oldest&&oldest.price&&Date.now()-oldest.time>=60000?((Number(t.c)/oldest.price)-1)*100:Number(t.P||0);return {...t,fastMove}}).sort((a,b)=>Math.abs(b.fastMove)-Math.abs(a.fastMove)).slice(0,12);
 const host=$("moversList");host.replaceChildren();
 if(!rows.length){host.innerHTML='<div class="book-empty">Waiting for live ticker data…</div>';return}
 const fragment=document.createDocumentFragment();
 rows.forEach(t=>{
  const row=document.createElement("button");row.className="mover-row";row.type="button";
  const pair=document.createElement("span");pair.className="mover-pair";pair.textContent=t.s;
  const price=document.createElement("span");price.textContent=fmt(t.c);
  const change=document.createElement("span");change.className=Number(t.fastMove)>=0?"positive":"negative";change.textContent=(Number(t.fastMove)>0?"+":"")+Number(t.fastMove).toFixed(3)+"%";
  const volume=document.createElement("span");volume.textContent=compact(t.q);
  row.append(pair,price,change,volume);row.addEventListener("click",()=>selectSymbol(t.s));fragment.appendChild(row);
 });
 host.appendChild(fragment);
}
function updateTicker(t){
 if(!t||!t.s)return;state.tickerMap.set(t.s,t);const now=Date.now(),history=state.priceHistory.get(t.s)||[];if(!history.length||history.at(-1).price!==Number(t.c))history.push({time:now,price:Number(t.c)});while(history.length&&now-history[0].time>65000)history.shift();state.priceHistory.set(t.s,history);
 if(t.s===state.symbol){
  setPrice(t.c);const change=Number(t.P||0);$("statChange").textContent=(change>0?"+":"")+change.toFixed(2)+"%";$("statChange").className="stat-value "+(change>=0?"positive":"negative");
  $("statVolume").textContent="24h quote volume "+compact(t.q);$("chartChange").textContent=(change>0?"+":"")+change.toFixed(2)+"% · 24H";
 }
}
function updateTickerArray(items){items.forEach(updateTicker);renderMovers()}
function renderBook(){
 const renderSide=(items,host,type)=>{
  if(!items.length){host.innerHTML='<div class="book-empty">Waiting for '+type+' depth…</div>';return}
  const max=Math.max(...items.map(level=>Number(level[1])||0),1);let total=0;host.replaceChildren();
  items.slice(0,10).forEach(level=>{
   const price=Number(level[0]),amount=Number(level[1]);total+=amount;
   const row=document.createElement("div");row.className="book-row "+type;
   const bar=document.createElement("i");bar.className="depth-bar";bar.style.width=Math.max(2,amount/max*100)+"%";
   const p=document.createElement("span");p.textContent=fmt(price);
   const a=document.createElement("span");a.textContent=fmt(amount,5);
   const sum=document.createElement("span");sum.textContent=compact(total);
   row.append(bar,p,a,sum);host.appendChild(row);
  });
 };
 renderSide(state.book.asks.slice().sort((a,b)=>Number(a[0])-Number(b[0])),$("asks"),"ask");
 renderSide(state.book.bids.slice().sort((a,b)=>Number(b[0])-Number(a[0])),$("bids"),"bid");
 if(state.book.bids.length&&state.book.asks.length){
  const bid=Number(state.book.bids[0][0]),ask=Number(state.book.asks[0][0]),mid=(bid+ask)/2,spread=ask-bid;
  $("bookMidPrice").textContent=fmt(mid);$("bookSpread").textContent="Spread "+fmt(spread)+" ("+(mid?((spread/mid)*100).toFixed(4):"0")+"%)";
  $("statSpread").textContent=fmt(spread);$("depthStatus").textContent="LIVE";$("depthStatus").classList.add("live-tag");
  $("bookUpdate").textContent=new Date().toLocaleTimeString();
 }
}
function updateBook(data){
 if(!Array.isArray(data.bids)||!Array.isArray(data.asks))return;
 state.book={bids:data.bids,asks:data.asks};state.bookLastUpdateAt=Date.now();if(!state.bookRenderQueued){state.bookRenderQueued=true;requestAnimationFrame(()=>{state.bookRenderQueued=false;renderBook()})}
}
function intervalMs(interval){return ({"1m":60000,"3m":180000,"5m":300000,"15m":900000,"30m":1800000,"1h":3600000,"2h":7200000,"4h":14400000,"6h":21600000,"8h":28800000,"12h":43200000,"1d":86400000,"3d":259200000,"1w":604800000})[interval]||60000}
function scheduleMarketPaint(){if(state.paintQueued)return;state.paintQueued=true;requestAnimationFrame(()=>{state.paintQueued=false;drawChart()})}
function scheduleAnalysis(){const now=performance.now();if(state.analysisQueued||now-state.lastAnalysisAt<350)return;state.analysisQueued=true;requestAnimationFrame(()=>{state.analysisQueued=false;state.lastAnalysisAt=performance.now();calculateAnalysis();scheduleMarketPaint()})}
function updateTrade(trade){
 const buyerInitiated=!trade.m;state.trades.push({buy:buyerInitiated,qty:Number(trade.q||0)});if(state.trades.length>300)state.trades.shift();
 if(trade.s===state.symbol){const price=Number(trade.p),last=state.candles.at(-1),time=Number(trade.T||Date.now()),duration=intervalMs(state.interval);setPrice(price);$("priceFoot").textContent="Live trade · "+new Date(time).toLocaleTimeString();if(last&&time>=Number(last.open_time)&&time<Number(last.open_time)+duration){last.high=Math.max(Number(last.high),price);last.low=Math.min(Number(last.low),price);last.close=price;if(state.view.follow)state.view.end=state.candles.length;scheduleMarketPaint();scheduleAnalysis()}}
 schedulePressureRender();
}
function schedulePressureRender(){if(state.pressureQueued)return;state.pressureQueued=true;requestAnimationFrame(()=>{state.pressureQueued=false;renderPressure()})}
function renderPressure(){
 const buy=state.trades.filter(t=>t.buy).reduce((sum,t)=>sum+t.qty,0),sell=state.trades.filter(t=>!t.buy).reduce((sum,t)=>sum+t.qty,0),total=buy+sell,pct=total?buy/total*100:50;
 $("buyPressure").textContent=compact(buy);$("sellPressure").textContent=compact(sell);$("pressureBar").style.width=pct+"%";$("tradeCount").textContent=state.trades.length+" recent trades";$("pressureRatio").textContent=Math.round(pct)+"% buy";
}
function handleLiveEvent(event){
 if(event.e==="tickerArray"){updateTickerArray(event.data||[]);return}
 if(event.e==="24hrTicker"){updateTicker(event);renderMovers();return}
 if(event.e==="kline"&&event.s===state.symbol){updateCandle(event.k);return}
 if(event.e==="trade")updateTrade(event);
 if(event.e==="bookTicker"&&event.s===state.symbol){
  const bid=Number(event.b),ask=Number(event.a),mid=(bid+ask)/2,spread=ask-bid;
  $("statSpread").textContent=fmt(spread);$("bookMidPrice").textContent=fmt(mid);$("bookSpread").textContent="Spread "+fmt(spread)+" ("+(mid?(spread/mid*100).toFixed(4):"0")+"%)";
 }
 if(event._stream&&event._stream.includes("@depth20@")&&event.s===state.symbol)updateBook(event);
}
function connectSocket(generation){
 const scheme=location.protocol==="https:"?"wss":"ws",socket=new WebSocket(scheme+"://"+location.host+"/api/v1/live/ws");state.socket=socket;
 socket.onopen=()=>{if(generation!==state.socketGeneration)return;$("feedState").textContent="LIVE";$("engineLabel").textContent="Live Binance stream connected";$("engineStatus").textContent="Streaming";health("wsHealth","Connected",true)};
 socket.onmessage=message=>{if(generation!==state.socketGeneration)return;try{const event=JSON.parse(message.data);if(event.type==="connected"){const connected=!!event.status?.connected;$("feedState").textContent=connected?"LIVE":"CONNECTING";return}if(event.type==="heartbeat"){const connected=!!event.status?.connected;$("feedState").textContent=connected?"LIVE":"RECONNECTING";$("engineLabel").textContent=connected?"Live Binance stream connected":"Reconnecting to Binance market stream";health("wsHealth",connected?"Connected":"Reconnecting",connected);return}handleLiveEvent(event)}catch(error){}};
 socket.onerror=()=>{if(generation===state.socketGeneration)health("wsHealth","Connection issue",false)};
 socket.onclose=()=>{if(generation!==state.socketGeneration)return;$("feedState").textContent="Reconnecting";health("wsHealth","Reconnecting",false);clearTimeout(state.retryTimer);state.retryTimer=setTimeout(()=>{if(generation===state.socketGeneration)connectSocket(generation)},1800)};
}
async function startLive(){
 try{
  const params=new URLSearchParams();params.append("symbols",state.symbol);params.append("intervals",state.interval);
  await api(API+"/live/start?"+params.toString(),{method:"POST"});
  state.socketGeneration++;clearTimeout(state.retryTimer);if(state.socket)state.socket.close();
  connectSocket(state.socketGeneration);
 }catch(error){$("feedState").textContent="Unavailable";$("engineLabel").textContent="Could not start Binance stream";health("wsHealth","Unavailable",false)}
}

let updatePollBusy=false,updateInstallStarted=false,updateBlocked=false;
function showUpdateToast(title,message,timeText=""){
 const toast=$("updateToast");if(!toast)return;
 $("updateToastTitle").textContent=title;$("updateToastMessage").textContent=message;$("updateToastTime").textContent=timeText;
 toast.classList.remove("hidden");
}
async function watchForUpdatedServer(){
 let sawOffline=false;
 for(let attempt=0;attempt<180;attempt++){
  await new Promise(resolve=>setTimeout(resolve,1000));
  try{
   const response=await fetch("/health",{cache:"no-store"});
   if(!response.ok)sawOffline=true;
   else if(sawOffline||attempt>=20){location.reload();return}
  }catch(error){sawOffline=true}
 }
 showUpdateToast("Update restart is taking longer","NEXORA is still trying to restart. Please refresh the page in a moment.");
}
async function checkForNexoraUpdate(){
 if(updatePollBusy||updateInstallStarted||updateBlocked)return;
 updatePollBusy=true;
 try{
  const status=await api("/api/v1/system/update");
  if(status.last_update){
   const last=status.last_update,key="nexora-update-seen-"+last.version;
   let seen=false;try{seen=localStorage.getItem(key)==="1"}catch(error){}
   if(!seen){
    const updatedAt=last.updated_at?new Date(last.updated_at).toLocaleString():"just now";
    const notes=(last.status==="failed"?(last.error||"The update could not be installed. Your previous workspace was restarted."):((last.release_notes||"New improvements and fixes are now installed.").trim().slice(0,700)));
    showUpdateToast(last.status==="failed"?"NEXORA update could not be installed":"NEXORA updated to v"+last.version,notes,(last.status==="failed"?"Attempted at ":"Updated at ")+updatedAt);
    try{localStorage.setItem(key,"1")}catch(error){}
   }
  }
  if(status.status==="available"&&status.downloadable){
   updateInstallStarted=true;
   showUpdateToast("New NEXORA update found","Version "+status.latest_version+" is downloading. The workspace will restart automatically.");
   const result=await api("/api/v1/system/update/apply",{method:"POST"});
   if(result.started)watchForUpdatedServer();
   else{updateInstallStarted=false;updateBlocked=true;showUpdateToast("Update not started",result.message||"The latest update could not be installed automatically.")}
  }
 }catch(error){
  const detail=String(error&&error.message||error);
  if(detail.includes("Local Git changes")||detail.includes("409")){
   updateBlocked=true;showUpdateToast("NEXORA update waiting","Local project changes were detected. They have been protected; close local edits before updating.");
  }else{
   showUpdateToast("Automatic update could not start",detail.slice(0,500));
  }
 }finally{updatePollBusy=false}
}

function refreshBookFreshness(){
 if(!state.bookLastUpdateAt)return;
 const stale=Date.now()-state.bookLastUpdateAt>5000;
 $("depthStatus").textContent=stale?"STALE":"LIVE";
 $("depthStatus").classList.toggle("live-tag",!stale);
}


function chartIndexAt(clientX){
 const rect=$("candleChart").getBoundingClientRect(),x=clientX-rect.left,left=10,right=82,step=(rect.width-left-right)/state.view.visible;
 return Math.max(0,Math.min(state.candles.length-1,(state.view.end||state.candles.length)-state.view.visible+Math.floor((x-left)/step)));
}
function updatePositionLevel(level,price){
 const p=state.position;if(!p)return;
 p[level]=price;
 const risk=Math.abs(p.entry-p.stop),sign=p.direction==="LONG"?1:-1;
 if(level==="entry"){p.tp1=price+sign*risk;p.tp2=price+sign*risk*2;p.tp3=price+sign*risk*3}
 else if(level==="stop"){p.tp1=p.entry+sign*risk;p.tp2=p.entry+sign*risk*2;p.tp3=p.entry+sign*risk*3}
 saveWorkspaceMarks();renderTradeDesk();drawChart();
}
function bindChartTools(){
 const canvas=$("candleChart");let pointerStart=null;
 document.querySelectorAll("[data-draw]").forEach(btn=>btn.addEventListener("click",()=>{
  state.drawTool=btn.dataset.draw;document.querySelectorAll("[data-draw]").forEach(b=>b.classList.toggle("tool-active",b===btn));
 }));
 document.querySelectorAll("[data-indicator]").forEach(input=>input.addEventListener("change",()=>{state.indicators[input.dataset.indicator]=input.checked;drawChart()}));
 document.querySelectorAll("[data-confirm]").forEach(input=>{state.confirmations[input.dataset.confirm]=input.checked;input.addEventListener("change",()=>{state.confirmations[input.dataset.confirm]=input.checked;drawChart();if(state.position)renderTradeDesk()})});
 document.querySelectorAll("[data-pack]").forEach(btn=>btn.addEventListener("click",()=>{
  if(btn.dataset.pack!=="smc")return;
  document.querySelectorAll("[data-pack]").forEach(b=>b.classList.toggle("selected",b===btn));
 }));
 $("positionLongBtn").addEventListener("click",()=>{if(state.position){$("tradeDeskStatus").textContent="CLEAR CURRENT SETUP FIRST";return}state.drawTool="long";$("positionLongBtn").classList.add("tool-active");$("positionShortBtn").classList.remove("tool-active")});
 $("positionShortBtn").addEventListener("click",()=>{if(state.position){$("tradeDeskStatus").textContent="CLEAR CURRENT SETUP FIRST";return}state.drawTool="short";$("positionShortBtn").classList.add("tool-active");$("positionLongBtn").classList.remove("tool-active")});
 $("clearPositionBtn").addEventListener("click",()=>{state.position=null;saveWorkspaceMarks();renderTradeDesk();drawChart()});
 $("clearDrawingsBtn").addEventListener("click",()=>{state.drawings=[];state.draft=null;saveWorkspaceMarks();drawChart()});
 $("liveChartBtn").addEventListener("click",()=>{state.view.follow=true;state.view.end=state.candles.length;$("liveChartBtn").classList.add("tool-active");drawChart()});
 canvas.addEventListener("pointerdown",event=>{
  const rect=canvas.getBoundingClientRect(),px=event.clientX-rect.left,py=event.clientY-rect.top;
  if(state.drawTool==="long"||state.drawTool==="short"){
   if(!state.position){createPosition(state.drawTool==="long"?"LONG":"SHORT",priceAt(event.clientY));state.drawTool="cursor";$("positionLongBtn").classList.remove("tool-active");$("positionShortBtn").classList.remove("tool-active")}
   return;
  }
  if(state.drawTool==="horizontal"){state.drawings.push({type:"horizontal",price:priceAt(event.clientY),label:"Manual level"});saveWorkspaceMarks();drawChart();return}
  if(state.drawTool==="text"){const note=window.prompt("Chart note:");if(note){state.drawings.push({type:"text",index:chartIndexAt(event.clientX),price:priceAt(event.clientY),text:note.slice(0,80)});saveWorkspaceMarks();drawChart()}return}
  if(state.drawTool==="trendline"||state.drawTool==="rectangle"){
   const point={index:chartIndexAt(event.clientX),price:priceAt(event.clientY)};
   if(!state.draft){state.draft={type:state.drawTool,p1:point,p2:point};}
   else{state.draft.p2=point;state.drawings.push(state.draft);state.draft=null;saveWorkspaceMarks();drawChart()}
   return;
  }
  if(state.position){
   const levelNames=["entry","stop","tp1","tp2","tp3"],nearest=levelNames.map(name=>({name,dist:Math.abs(priceAt(event.clientY)-state.position[name])})).sort((a,b)=>a.dist-b.dist)[0];
   const rectH=canvas.getBoundingClientRect().height,visible=state.candles.slice(Math.max(0,(state.view.end||state.candles.length)-state.view.visible),state.view.end||state.candles.length),range=Math.max(...visible.map(c=>+c.high))-Math.min(...visible.map(c=>+c.low))||1;
   if(nearest&&nearest.dist<range*.025){state.dragging={level:nearest.name};canvas.setPointerCapture(event.pointerId);return}
  }
  state.dragging={pan:true,startX:event.clientX,startEnd:state.view.end||state.candles.length};pointerStart=event.clientX;canvas.setPointerCapture(event.pointerId);
 });
 canvas.addEventListener("pointermove",event=>{
  if(!state.dragging)return;
  if(state.dragging.level){updatePositionLevel(state.dragging.level,priceAt(event.clientY));return}
  if(state.dragging.pan&&pointerStart!==null){
   const rect=canvas.getBoundingClientRect(),step=(rect.width-92)/state.view.visible,delta=Math.round((pointerStart-event.clientX)/step);
   state.view.end=Math.max(state.view.visible,Math.min(state.candles.length,state.dragging.startEnd+delta));state.view.follow=state.view.end>=state.candles.length;$("liveChartBtn").classList.toggle("tool-active",state.view.follow);drawChart();if(state.view.end<=state.view.visible+2&&delta>0)loadOlderHistory();
  }
 });
 const finish=()=>{if(state.dragging?.level)saveWorkspaceMarks();state.dragging=null;pointerStart=null};
 canvas.addEventListener("pointerup",finish);canvas.addEventListener("pointercancel",finish);
 canvas.addEventListener("wheel",event=>{
  event.preventDefault();const old=state.view.visible,next=Math.max(30,Math.min(300,Math.round(old*(event.deltaY>0?1.15:.87))));
  const anchor=chartIndexAt(event.clientX),ratio=(anchor-(state.view.end-old))/old;state.view.visible=next;state.view.end=Math.min(state.candles.length,Math.max(next,Math.round(anchor+next*(1-ratio))));state.view.follow=false;$("liveChartBtn").classList.remove("tool-active");drawChart();
 },{passive:false});
}
function init(){
 bindChartTools();loadWorkspaceMarks();window.addEventListener("storage",event=>{if(event.key==="nexora-active-position"){try{state.position=JSON.parse(event.newValue||"null")}catch(error){state.position=null}renderTradeDesk();drawChart()}});
 try{state.symbol=localStorage.getItem("nexora-selected-symbol")||state.symbol;state.interval=localStorage.getItem("nexora-selected-interval")||state.interval;const active=document.querySelector('[data-interval="'+state.interval+'"]');if(active){document.querySelectorAll("[data-interval]").forEach(item=>item.classList.remove("selected"));active.classList.add("selected")}}catch(error){}
 $("searchPairBtn").addEventListener("click",searchPair);$("pairSearch").addEventListener("focus",()=>{renderPairSuggestions($("pairSearch").value);$("pairSuggestions").classList.remove("hidden")});$("pairSearch").addEventListener("input",()=>{renderPairSuggestions($("pairSearch").value);$("pairSuggestions").classList.remove("hidden")});$("pairSearch").addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();searchPair()}if(event.key==="Escape")$("pairSuggestions").classList.add("hidden")});document.addEventListener("click",event=>{if(!event.target.closest(".search-controls"))$("pairSuggestions").classList.add("hidden")});
 document.querySelectorAll("[data-interval]").forEach(button=>button.addEventListener("click",()=>{
  document.querySelectorAll("[data-interval]").forEach(item=>item.classList.remove("selected"));button.classList.add("selected");state.interval=button.dataset.interval;try{localStorage.setItem("nexora-selected-interval",state.interval)}catch(error){}
  $("chartTitle").innerHTML=state.symbol+" <span>·</span> "+state.interval.toUpperCase();loadCandles().then(startLive);
 }));
 $("refreshBtn").addEventListener("click",()=>{loadSymbols().then(()=>{loadCandles();startLive()})});
 $("updateToastClose")?.addEventListener("click",()=>$("updateToast").classList.add("hidden"));
 checkForNexoraUpdate();setInterval(checkForNexoraUpdate,30000);setInterval(refreshBookFreshness,1000);
 window.addEventListener("resize",()=>{clearTimeout(state.resizeTimer);state.resizeTimer=setTimeout(drawChart,100)});
 api("/health").then(()=>{health("localHealth","Online",true);$("engineLabel").textContent="Local engine online"}).catch(()=>health("localHealth","Offline",false));
 loadSymbols().then(()=>{if(!state.symbols.length)return;$("pairSearch").value=state.symbol;selectSymbol(state.symbol)});
 setInterval(()=>loadSymbols(),5*60*1000);
}
document.addEventListener("DOMContentLoaded",init);
