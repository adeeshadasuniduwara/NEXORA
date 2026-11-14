const API="/api/v1";
const state={symbol:"BTCUSDT",interval:"1h",candles:[],symbols:[],tickerMap:new Map(),priceHistory:new Map(),symbolSet:new Set(),trades:[],analysis:null,view:{end:0,visible:120,follow:true},indicators:{ema20:true,ema50:true,sma200:false,bb:false,rsi:true},drawTool:"cursor",drawings:[],draft:null,position:null,dragging:null,socket:null,socketGeneration:0,retryTimer:null,resizeTimer:null,bookLastUpdateAt:0,book:{bids:[],asks:[]}};
const $=id=>document.getElementById(id);
const fmt=(v,max=8)=>Number(v||0).toLocaleString("en-US",{maximumFractionDigits:max});
const compact=v=>{const n=Number(v||0);return n>=1e9?(n/1e9).toFixed(2)+"B":n>=1e6?(n/1e6).toFixed(2)+"M":n>=1e3?(n/1e3).toFixed(2)+"K":fmt(n,2)};
async function api(path,options={}){const response=await fetch(path,options);if(!response.ok)throw Error(await response.text());return response.json()}
function health(id,message,ok){$(id).textContent=message;$(id).classList.toggle("bad",!ok);$(id).classList.toggle("good",!!ok)}
function setPrice(value){if(value===undefined||value===null)return;const price=fmt(value);$("chartPrice").textContent=price;$("statPrice").textContent=price}
async function loadCandles(){
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
 if(n<55){state.analysis=null;renderAnalysis();return}
 const highs=candles.map(c=>Number(c.high)),lows=candles.map(c=>Number(c.low)),closes=candles.map(c=>Number(c.close));
 const ema20=ema(closes,20),ema50=ema(closes,50),last=closes.at(-1);
 let gains=0,losses=0;
 for(let i=n-14;i<n;i++){const change=closes[i]-closes[i-1];if(change>0)gains+=change;else losses-=change}
 const rs=losses===0?Infinity:(gains/14)/(losses/14),rsi=losses===0?100:100-(100/(1+rs));
 const swingHighs=[],swingLows=[];
 for(let i=2;i<n-2;i++){
  if(highs[i]>highs[i-1]&&highs[i]>highs[i-2]&&highs[i]>=highs[i+1]&&highs[i]>=highs[i+2])swingHighs.push({index:i,price:highs[i]});
  if(lows[i]<lows[i-1]&&lows[i]<lows[i-2]&&lows[i]<=lows[i+1]&&lows[i]<=lows[i+2])swingLows.push({index:i,price:lows[i]});
 }
 const recentHighs=swingHighs.slice(-2),recentLows=swingLows.slice(-2);
 let structure="RANGING",structureDetail="Waiting for a clear sequence of confirmed swing highs and lows";
 if(recentHighs.length===2&&recentLows.length===2){
  const hh=recentHighs[1].price>recentHighs[0].price,hl=recentLows[1].price>recentLows[0].price;
  const lh=recentHighs[1].price<recentHighs[0].price,ll=recentLows[1].price<recentLows[0].price;
  if(hh&&hl)structure="BULLISH STRUCTURE";
  else if(lh&&ll)structure="BEARISH STRUCTURE";
  structureDetail=(hh?"Higher high":lh?"Lower high":"No higher/lower high")+" · "+(hl?"Higher low":ll?"Lower low":"No higher/lower low");
 }
 const events=[];
 if(recentHighs.length){const h=recentHighs.at(-1);events.push({name:"Swing high",price:h.price,index:h.index,bearish:false})}
 if(recentLows.length){const l=recentLows.at(-1);events.push({name:"Swing low",price:l.price,index:l.index,bearish:true})}
 const previous=closes[n-2],lastHigh=swingHighs.at(-1),lastLow=swingLows.at(-1);
 let breakEvent=null;
 if(lastHigh&&n-1>lastHigh.index&&last>lastHigh.price&&previous<=lastHigh.price)breakEvent={name:structure==="BEARISH STRUCTURE"?"Bullish CHoCH":"Bullish BOS",price:lastHigh.price,bearish:false};
 else if(lastLow&&n-1>lastLow.index&&last<lastLow.price&&previous>=lastLow.price)breakEvent={name:structure==="BULLISH STRUCTURE"?"Bearish CHoCH":"Bearish BOS",price:lastLow.price,bearish:true};
 if(breakEvent)events.unshift(breakEvent);
 const fvgs=[];
 for(let i=Math.max(2,n-30);i<n;i++){
  if(lows[i]>highs[i-2])fvgs.push({type:"Bullish FVG",low:highs[i-2],high:lows[i],index:i,bearish:false});
  else if(highs[i]<lows[i-2])fvgs.push({type:"Bearish FVG",low:highs[i],high:lows[i-2],index:i,bearish:true});
 }
 const equalTolerance=last*0.001;
 const equalHigh=swingHighs.slice(-12).find((p,i,arr)=>arr.slice(i+1).some(q=>Math.abs(q.price-p.price)<=equalTolerance));
 const equalLow=swingLows.slice(-12).find((p,i,arr)=>arr.slice(i+1).some(q=>Math.abs(q.price-p.price)<=equalTolerance));
 let score=0;
 if(ema20>ema50)score++;else score--;
 if(last>ema20)score++;else score--;
 if(rsi>=55)score++;else if(rsi<=45)score--;
 if(structure==="BULLISH STRUCTURE")score++;else if(structure==="BEARISH STRUCTURE")score--;
 if(breakEvent)score+=breakEvent.bearish?-1:1;
 const bias=score>=2?"BULLISH":score<=-2?"BEARISH":"NEUTRAL";
 state.analysis={ema20,ema50,rsi,structure,structureDetail,events,fvgs:fvgs,liquidity:{equalHigh,equalLow},bias,score,last};
 renderAnalysis();
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
 $("analysisLiquidityDetail").textContent=(highs?"EQH near "+fmt(highs.price):"No confirmed EQH")+" · "+(lows?"EQL near "+fmt(lows.price):"No confirmed EQL");
 const eventHost=$("structureEvents");eventHost.replaceChildren();
 const eventRows=a.events.slice(0,4);
 if(!eventRows.length)eventHost.textContent="No confirmed swing events in the current window.";
 eventRows.forEach(item=>{const row=document.createElement("div");row.className="analysis-event";const name=document.createElement("b");name.textContent=item.name;if(item.bearish)name.classList.add("bearish");const value=document.createElement("span");value.textContent=fmt(item.price);row.append(name,value);eventHost.appendChild(row)});
 const fvgHost=$("fvgEvents");fvgHost.replaceChildren();
 if(!a.fvgs.length)fvgHost.textContent="No recent three-candle imbalance detected.";
 a.fvgs.slice(-4).reverse().forEach(item=>{const row=document.createElement("div");row.className="analysis-event";const name=document.createElement("b");name.textContent=item.type;if(item.bearish)name.classList.add("bearish");const value=document.createElement("span");value.textContent=fmt(item.low)+" – "+fmt(item.high);row.append(name,value);fvgHost.appendChild(row)});
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
function saveWorkspaceMarks(){try{localStorage.setItem("nexora-marks-"+state.symbol,JSON.stringify({drawings:state.drawings,position:state.position}))}catch(error){}}
function loadWorkspaceMarks(){try{const saved=JSON.parse(localStorage.getItem("nexora-marks-"+state.symbol)||"{}");state.drawings=Array.isArray(saved.drawings)?saved.drawings:[];state.position=saved.position||null;renderTradeDesk()}catch(error){state.drawings=[];state.position=null}}
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
 ctx.clearRect(0,0,width,height);const highs=data.map(c=>+c.high),lows=data.map(c=>+c.low),closes=data.map(c=>+c.close);
 const ema20=indicatorSeries(closes,20),ema50=indicatorSeries(closes,50),sma200=indicatorSeries(closes,200),mid=indicatorSeries(closes,20,"sma");
 const sd=closes.map((_,i)=>i<19?null:Math.sqrt(closes.slice(i-19,i+1).reduce((sum,v)=>sum+(v-mid[i])**2,0)/20));
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
 if(a){a.fvgs.slice(-20).forEach(z=>{const xx=x(begin+z.index);if(xx<pad.left||xx>width-pad.right)return;ctx.fillStyle=z.bearish?"#f17e8c19":"#70e5bd19";ctx.strokeStyle=z.bearish?"#f17e8c66":"#70e5bd66";ctx.fillRect(xx,y(z.high),Math.max(1,width-pad.right-xx),Math.max(2,y(z.low)-y(z.high))));ctx.strokeRect(xx,y(z.high),Math.max(1,width-pad.right-xx),Math.max(2,y(z.low)-y(z.high))})}
 state.drawings.forEach(d=>drawManualMark(ctx,d,x,y,pad,width,height));
 if(position)drawPosition(ctx,position,y,pad,width);
 const last=data.at(-1),lastY=y(+last.close);ctx.setLineDash([4,4]);ctx.strokeStyle="#70e5bd88";ctx.beginPath();ctx.moveTo(pad.left,lastY);ctx.lineTo(width-pad.right,lastY);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle="#173d36";ctx.fillRect(width-pad.right+4,lastY-9,74,18);ctx.fillStyle="#a2f4d9";ctx.textAlign="center";ctx.fillText(fmt(last.close),width-pad.right+41,lastY+3);
 const rsiValues=closes;drawRsi(rsiValues);
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
function priceAt(clientY){const rect=$("candleChart").getBoundingClientRect(),data=state.candles.slice(Math.max(0,(state.view.end||state.candles.length)-state.view.visible),state.view.end||state.candles.length);if(!data.length)return 0;const top=12,chartH=rect.height-(state.indicators.rsi?88:0)-34,lo=Math.min(...data.map(c=>+c.low)),hi=Math.max(...data.map(c=>+c.high)),range=hi-lo||1;return hi-(clientY-rect.top-top)/chartH*range}
function createPosition(direction,price){
 const risk=price*.01,stop=direction==="LONG"?price-risk:price+risk,unit=Math.abs(price-stop);
 state.position={direction,symbol:state.symbol,entry:price,stop,tp1:price+(direction==="LONG"?1:-1)*unit,tp2:price+(direction==="LONG"?2:-2)*unit,tp3:price+(direction==="LONG"?3:-3)*unit,createdAt:Date.now()};
 saveWorkspaceMarks();renderTradeDesk();drawChart();
}
function renderTradeDesk(){
 const p=state.position,active=!!p;$("tradeDeskEmpty").classList.toggle("hidden",active);$("tradeDeskActive").classList.toggle("hidden",!active);$("tradeDeskStatus").textContent=active?"ONE ACTIVE SETUP":"NO ACTIVE SETUP";
 if(!p)return;$("deskDirection").textContent=p.direction+" · "+p.symbol;$("deskRiskReward").textContent="R:R 1:3";
 $("deskEntry").textContent=fmt(p.entry);$("deskStop").textContent=fmt(p.stop);$("deskTp1").textContent=fmt(p.tp1);$("deskTp2").textContent=fmt(p.tp2);$("deskTp3").textContent=fmt(p.tp3);
 const a=state.analysis,host=$("deskConfirmations");host.replaceChildren();const checks=[["EMA",a&&((p.direction==="LONG"&&a.ema20>a.ema50)||(p.direction==="SHORT"&&a.ema20<a.ema50))],["RSI",a&&(p.direction==="LONG"?a.rsi>50:a.rsi<50)],["Structure",a&&(p.direction==="LONG"?a.structure==="BULLISH STRUCTURE":a.structure==="BEARISH STRUCTURE")],["FVG",a&&a.fvgs.some(z=>!z.bearish=== (p.direction==="LONG"))]];
 checks.forEach(([name,ok])=>{const el=document.createElement("span");el.className=ok?"confirm-ok":"confirm-pending";el.textContent=(ok?"✓ ":"○ ")+name;host.appendChild(el)});
}

function updateCandle(k){
 const candle={open_time:k.t,open:k.o,high:k.h,low:k.l,close:k.c,volume:k.v},last=state.candles.at(-1);
 if(last&&Number(last.open_time)===Number(candle.open_time))state.candles[state.candles.length-1]=candle;else state.candles.push(candle);
 if(state.candles.length>1000)state.candles.shift();if(state.view.follow)state.view.end=state.candles.length;calculateAnalysis();drawChart();setPrice(candle.close);
}
async function loadSymbols(){
 try{
  const data=await api(API+"/market/symbols");state.symbols=(data.symbols||[]).filter(item=>item.status==="TRADING");state.symbolSet=new Set(state.symbols.map(item=>item.symbol));
  $("pairCount").textContent=state.symbols.length.toLocaleString("en-US");
  const list=$("pairOptions");list.replaceChildren();
  const fragment=document.createDocumentFragment();
  state.symbols.forEach(item=>{const option=document.createElement("option");option.value=item.symbol;option.label=item.base_asset+" / "+item.quote_asset;fragment.appendChild(option)});
  list.appendChild(fragment);
  if(!state.symbols.some(item=>item.symbol===state.symbol))state.symbol="BTCUSDT";
  $("pairSearch").value=state.symbol;health("localHealth","Online",true);return state.symbols;
 }catch(error){health("localHealth","API error",false);return []}
}
function selectSymbol(symbol){
 state.symbol=symbol;state.view={end:0,visible:120,follow:true};loadWorkspaceMarks();try{localStorage.setItem("nexora-selected-symbol",symbol)}catch(error){}$("pairSearch").value=symbol;$("statSymbol").textContent=symbol;$("chartTitle").innerHTML=symbol+" <span>·</span> "+state.interval.toUpperCase();
 $("bookMidPrice").textContent="—";$("bookSpread").textContent="Spread —";$("asks").innerHTML='<div class="book-empty">Loading ask depth…</div>';$("bids").innerHTML='<div class="book-empty">Loading bid depth…</div>';
 state.book={bids:[],asks:[]};state.bookLastUpdateAt=0;$("depthStatus").textContent="WAITING";$("depthStatus").classList.remove("live-tag");state.trades=[];renderPressure();loadCandles().then(startLive);
}
function searchPair(){
 const query=$("pairSearch").value.trim().toUpperCase().replace(/[^A-Z0-9]/g,"");
 if(!query)return;
 const match=state.symbols.find(item=>item.symbol===query);
 if(!match){$("pairSearch").setCustomValidity("Pair not found in Binance Spot trading symbols.");$("pairSearch").reportValidity();return}
 $("pairSearch").setCustomValidity("");selectSymbol(match.symbol);
}
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
 state.book={bids:data.bids,asks:data.asks};state.bookLastUpdateAt=Date.now();renderBook();
}
function updateTrade(trade){
 const buyerInitiated=!trade.m;
 state.trades.push({buy:buyerInitiated,qty:Number(trade.q||0)});
 if(state.trades.length>300)state.trades.shift();
 if(trade.s===state.symbol){setPrice(trade.p);$("priceFoot").textContent="Live trade · "+new Date().toLocaleTimeString()}
 renderPressure();
}
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
 document.querySelectorAll("[data-confirm]").forEach(input=>input.addEventListener("change",()=>{if(state.position)renderTradeDesk()}));
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
   state.view.end=Math.max(state.view.visible,Math.min(state.candles.length,state.dragging.startEnd+delta));state.view.follow=state.view.end>=state.candles.length;$("liveChartBtn").classList.toggle("tool-active",state.view.follow);drawChart();
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
 bindChartTools();loadWorkspaceMarks();
 try{state.symbol=localStorage.getItem("nexora-selected-symbol")||state.symbol;state.interval=localStorage.getItem("nexora-selected-interval")||state.interval;const active=document.querySelector('[data-interval="'+state.interval+'"]');if(active){document.querySelectorAll("[data-interval]").forEach(item=>item.classList.remove("selected"));active.classList.add("selected")}}catch(error){}
 $("searchPairBtn").addEventListener("click",searchPair);$("pairSearch").addEventListener("keydown",event=>{if(event.key==="Enter")searchPair()});
 $("pairSearch").addEventListener("input",()=>$("pairSearch").setCustomValidity(""));
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
