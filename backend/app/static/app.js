const API="/api/v1";
const state={symbol:"BTCUSDT",interval:"1h",candles:[],symbols:[],tickerMap:new Map(),priceHistory:new Map(),symbolSet:new Set(),trades:[],analysis:null,socket:null,socketGeneration:0,retryTimer:null,resizeTimer:null,bookLastUpdateAt:0,book:{bids:[],asks:[]}};
const $=id=>document.getElementById(id);
const fmt=(v,max=8)=>Number(v||0).toLocaleString("en-US",{maximumFractionDigits:max});
const compact=v=>{const n=Number(v||0);return n>=1e9?(n/1e9).toFixed(2)+"B":n>=1e6?(n/1e6).toFixed(2)+"M":n>=1e3?(n/1e3).toFixed(2)+"K":fmt(n,2)};
async function api(path,options={}){const response=await fetch(path,options);if(!response.ok)throw Error(await response.text());return response.json()}
function health(id,message,ok){$(id).textContent=message;$(id).classList.toggle("bad",!ok);$(id).classList.toggle("good",!!ok)}
function setPrice(value){if(value===undefined||value===null)return;const price=fmt(value);$("chartPrice").textContent=price;$("statPrice").textContent=price}
async function loadCandles(){
 $("chartLoading").classList.remove("hidden");
 try{
  const data=await api(`${API}/market/candles?symbol=${encodeURIComponent(state.symbol)}&interval=${state.interval}&limit=220`);
  state.candles=data.candles||[];calculateAnalysis();drawChart();$("chartLoading").classList.add("hidden");
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
function drawChart(){
 const canvas=$("candleChart"),ctx=canvas.getContext("2d"),rect=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
 canvas.width=Math.max(1,Math.floor(rect.width*dpr));canvas.height=Math.max(1,Math.floor(rect.height*dpr));ctx.setTransform(dpr,0,0,dpr,0,0);
 const width=rect.width,height=rect.height,data=state.candles;if(!data.length)return;
 const pad={left:8,right:78,top:15,bottom:20},chartW=width-pad.left-pad.right,chartH=height-pad.top-pad.bottom;
 const low=Math.min(...data.map(c=>+c.low)),high=Math.max(...data.map(c=>+c.high)),range=high-low||1;
 const y=value=>pad.top+(high-value)/range*chartH,step=chartW/data.length,bodyW=Math.max(2,Math.min(9,step*.64));
 ctx.font="10px DM Mono";ctx.textAlign="right";ctx.strokeStyle="#243247";ctx.fillStyle="#8795a9";
 for(let i=0;i<=4;i++){const yy=pad.top+chartH*i/4;ctx.beginPath();ctx.moveTo(pad.left,yy);ctx.lineTo(width-pad.right,yy);ctx.stroke();ctx.fillText(fmt(high-range*i/4),width-5,yy+3)}
 data.forEach((c,index)=>{const x=pad.left+step*(index+.5),up=+c.close>=+c.open,color=up?"#70e5bd":"#f17e8c",top=Math.min(y(+c.open),y(+c.close)),bodyH=Math.max(1,Math.abs(y(+c.open)-y(+c.close)));ctx.strokeStyle=color;ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(x,y(+c.high));ctx.lineTo(x,y(+c.low));ctx.stroke();ctx.fillRect(x-bodyW/2,top,bodyW,bodyH)});
 const analysis=state.analysis;
 if(analysis){
  analysis.fvgs.slice(-5).forEach(zone=>{const x=pad.left+step*(zone.index+.5),top=y(zone.high),bottom=y(zone.low);ctx.fillStyle=zone.bearish?"#f17e8c18":"#70e5bd18";ctx.strokeStyle=zone.bearish?"#f17e8c66":"#70e5bd66";ctx.fillRect(x,top,Math.max(1,width-pad.right-x),Math.max(2,bottom-top));ctx.strokeRect(x,top,Math.max(1,width-pad.right-x),Math.max(2,bottom-top))});
  const levels=[{item:analysis.events.find(e=>e.name==="Swing high"),label:"SH"},{item:analysis.events.find(e=>e.name==="Swing low"),label:"SL"}];
  levels.forEach(({item,label})=>{if(!item)return;const yy=y(item.price);ctx.setLineDash([3,4]);ctx.strokeStyle="#93a9c577";ctx.beginPath();ctx.moveTo(pad.left,yy);ctx.lineTo(width-pad.right,yy);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle="#aabbd0";ctx.textAlign="left";ctx.fillText(label,pad.left+3,yy-4)});
 }
 const last=data.at(-1),lastY=y(+last.close);ctx.setLineDash([4,4]);ctx.strokeStyle="#70e5bd88";ctx.beginPath();ctx.moveTo(pad.left,lastY);ctx.lineTo(width-pad.right,lastY);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle="#173d36";ctx.fillRect(width-pad.right+4,lastY-9,70,18);ctx.fillStyle="#a2f4d9";ctx.textAlign="center";ctx.fillText(fmt(last.close),width-pad.right+39,lastY+3);
}
function updateCandle(k){
 const candle={open_time:k.t,open:k.o,high:k.h,low:k.l,close:k.c,volume:k.v},last=state.candles.at(-1);
 if(last&&Number(last.open_time)===Number(candle.open_time))state.candles[state.candles.length-1]=candle;else state.candles.push(candle);
 if(state.candles.length>220)state.candles.shift();calculateAnalysis();drawChart();setPrice(candle.close);
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
 state.symbol=symbol;try{localStorage.setItem("nexora-selected-symbol",symbol)}catch(error){}$("pairSearch").value=symbol;$("statSymbol").textContent=symbol;$("chartTitle").innerHTML=symbol+" <span>·</span> "+state.interval.toUpperCase();
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

function init(){
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
