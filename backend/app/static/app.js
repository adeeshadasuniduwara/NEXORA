const API="/api/v1";
const state={symbol:"BTCUSDT",interval:"1h",candles:[],symbols:[],tickerMap:new Map(),priceHistory:new Map(),symbolSet:new Set(),trades:[],socket:null,socketGeneration:0,retryTimer:null,resizeTimer:null,book:{bids:[],asks:[]}};
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
  state.candles=data.candles||[];drawChart();$("chartLoading").classList.add("hidden");
  const candle=state.candles.at(-1);if(candle){setPrice(candle.close);$("priceFoot").textContent="Latest Binance candle"}
  health("restHealth","Connected",true);
 }catch(error){$("chartLoading").innerHTML="<span>Market history unavailable — check connection and retry.</span>";health("restHealth","Offline",false)}
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
 const last=data.at(-1),lastY=y(+last.close);ctx.setLineDash([4,4]);ctx.strokeStyle="#70e5bd88";ctx.beginPath();ctx.moveTo(pad.left,lastY);ctx.lineTo(width-pad.right,lastY);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle="#173d36";ctx.fillRect(width-pad.right+4,lastY-9,70,18);ctx.fillStyle="#a2f4d9";ctx.textAlign="center";ctx.fillText(fmt(last.close),width-pad.right+39,lastY+3);
}
function updateCandle(k){
 const candle={open_time:k.t,open:k.o,high:k.h,low:k.l,close:k.c,volume:k.v},last=state.candles.at(-1);
 if(last&&Number(last.open_time)===Number(candle.open_time))state.candles[state.candles.length-1]=candle;else state.candles.push(candle);
 if(state.candles.length>220)state.candles.shift();drawChart();setPrice(candle.close);
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
 state.symbol=symbol;$("pairSearch").value=symbol;$("statSymbol").textContent=symbol;$("chartTitle").innerHTML=symbol+" <span>·</span> "+state.interval.toUpperCase();
 $("bookMidPrice").textContent="—";$("bookSpread").textContent="Spread —";$("asks").innerHTML='<div class="book-empty">Loading ask depth…</div>';$("bids").innerHTML='<div class="book-empty">Loading bid depth…</div>';
 state.book={bids:[],asks:[]};state.trades=[];renderPressure();loadCandles().then(startLive);
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
 state.book={bids:data.bids,asks:data.asks};renderBook();
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
 socket.onmessage=message=>{if(generation!==state.socketGeneration)return;try{const event=JSON.parse(message.data);if(event.type==="connected"||event.type==="heartbeat")return;handleLiveEvent(event)}catch(error){}};
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
function init(){
 $("searchPairBtn").addEventListener("click",searchPair);$("pairSearch").addEventListener("keydown",event=>{if(event.key==="Enter")searchPair()});
 $("pairSearch").addEventListener("input",()=>$("pairSearch").setCustomValidity(""));
 document.querySelectorAll("[data-interval]").forEach(button=>button.addEventListener("click",()=>{
  document.querySelectorAll("[data-interval]").forEach(item=>item.classList.remove("selected"));button.classList.add("selected");state.interval=button.dataset.interval;
  $("chartTitle").innerHTML=state.symbol+" <span>·</span> "+state.interval.toUpperCase();loadCandles().then(startLive);
 }));
 $("refreshBtn").addEventListener("click",()=>{loadSymbols().then(()=>{loadCandles();startLive()})});
 window.addEventListener("resize",()=>{clearTimeout(state.resizeTimer);state.resizeTimer=setTimeout(drawChart,100)});
 api("/health").then(()=>{health("localHealth","Online",true);$("engineLabel").textContent="Local engine online"}).catch(()=>health("localHealth","Offline",false));
 loadSymbols().then(()=>{if(!state.symbols.length)return;$("pairSearch").value=state.symbol;selectSymbol(state.symbol)});
 setInterval(()=>loadSymbols(),5*60*1000);
}
document.addEventListener("DOMContentLoaded",init);
