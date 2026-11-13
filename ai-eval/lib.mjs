// Shared helpers: load the AI engine straight out of replay-desk.html, read candle CSVs, build 5-minute candles.
import fs from "node:fs";import path from "node:path";import {fileURLToPath} from "node:url";
const here=path.dirname(fileURLToPath(import.meta.url));
export function loadEngine(){const html=fs.readFileSync(path.join(here,"..","replay-desk.html"),"utf8");
  const a=html.indexOf("/*AIR-ENGINE-START*/"),b=html.indexOf("/*AIR-ENGINE-END*/");if(a<0||b<0)throw new Error("AI engine markers not found");
  return new Function(html.slice(a,b)+"\nreturn AIR;")()}
export function readCSV(file){const L=fs.readFileSync(file,"utf8").split(/\r?\n/);const out=[];
  for(let k=1;k<L.length;k++){const p=L[k].split(",");if(p.length<5)continue;const t=Date.parse(p[0].trim().replace(" ","T")+"Z")/1000;if(!isFinite(t))continue;out.push({t,o:+p[1],h:+p[2],l:+p[3],c:+p[4]})}return out}
export function agg(b,sec){const o=[];for(const x of b){const k=Math.floor(x.t/sec)*sec,L=o[o.length-1];if(L&&L.t===k){if(x.h>L.h)L.h=x.h;if(x.l<L.l)L.l=x.l;L.c=x.c}else o.push({t:k,o:x.o,h:x.h,l:x.l,c:x.c})}return o}
export function rng(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
// random-walk candles, used when no real data is given (CI)
export function synthetic(seed=7,days=40){const r=rng(seed),out=[];let p=20000;const t0=Date.UTC(2026,0,5,0,0)/1000;
  for(let i=0;i<days*1440;i++){const t=t0+i*60,d=new Date(t*1000).getUTCDay();if(d===0||d===6)continue;const v=p*0.00035*(0.5+r());const o=p,c=o+(r()-0.5)*2*v;
    out.push({t,o,h:Math.max(o,c)+r()*v,l:Math.min(o,c)-r()*v,c});p=c}return out}
// picks N New York morning ranges (start 09:30-10:30, 1.5 to 3 hours long) with a fixed seed
export function sampleRanges(AIR,bars,n,seed=42){const r=rng(seed),days=[...new Set(bars.map(b=>AIR.nyDay(b.t)))].filter(d=>{const w=((d%7)+7)%7;return w!==2&&w!==3});const out=[],used=new Set();let guard=0;
  while(out.length<n&&guard++<n*50){const d=days[Math.floor(r()*days.length)];if(used.has(d))continue;
    const startM=570+5*Math.floor(r()*13),len=18+Math.floor(r()*19);
    const i1=bars.findIndex(b=>AIR.nyDay(b.t)===d&&AIR.nyMin(b.t)>=startM);if(i1<0||i1+len>=bars.length)continue;
    const i2=i1+len;if(AIR.nyDay(bars[i2].t)!==d||i1<300)continue;used.add(d);out.push({i1,i2})}return out}
