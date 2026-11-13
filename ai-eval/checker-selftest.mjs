// Tests the fact checker itself, with no AI: write answers that quote true numbers,
// slip in some wrong ones, and count how many wrong ones the checker catches (and how many true ones it wrongly flags).
// Usage: node ai-eval/checker-selftest.mjs [NQ 1m csv] [--n 50]
import {loadEngine,readCSV,agg,synthetic,sampleRanges,rng} from "./lib.mjs";
const AIR=loadEngine(),args=process.argv.slice(2),file=args.find(a=>a.endsWith(".csv")),N=+(args[args.indexOf("--n")+1]||50)||50;
const bars=agg(file?readCSV(file):synthetic(),300),R=sampleRanges(AIR,bars,N),r=rng(9);
let trueN=0,trueFlag=0,badN=0,badCaught=0,badTimeN=0,badTimeCaught=0,claimN=0,claimCaught=0,claimFalse=0;const fmt=v=>v.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
for(const {i1,i2} of R){const F=AIR.facts(bars.slice(0,i2+1),i1,i2,{sym:"NAS100",tf:"5m",tfSec:300,dec:2});
  const tru=[[F.open,"opened at"],[F.high.p,"topped at"],[F.low.p,"bottomed at"],[F.close,"closed at"],[F.eq,"the middle is"]];
  F.sweeps.slice(0,2).forEach(s=>tru.push([s.level,"swept "+s.name+" at"]));F.fvgs.slice(0,2).forEach(g=>tru.push([g.top,"gap top"]));
  const wrong=[];for(let k=0;k<2;k++){const base=tru[Math.floor(r()*tru.length)][0],shift=(r()<0.5?-1:1)*base*(0.0015+r()*0.02);wrong.push(+(base+shift).toFixed(2))}
  const badT=["10:"+String(Math.floor(r()*6))+"7","13:"+String(Math.floor(r()*5))+"3"];
  let text=tru.map(([v,w])=>"Price "+w+" "+(r()<0.5?fmt(v):String(v))+".").join(" ")+" Then the high was "+F.high.p+" at "+F.high.t+".";
  text+=" It also traded at "+fmt(wrong[0])+" and later "+wrong[1]+". A move hit at "+badT[0]+".";
  const claimWord=F.smt.length?null:"There was SMT divergence with ES.";if(claimWord)text+=" "+claimWord;
  const c=AIR.check(text,F,2),wrongSet=new Set(wrong.map(String)),strip=s=>s.replace(/,/g,"");
  c.marks.forEach(m=>{if(m.kind==="time"){if(badT.includes(m.raw)){badTimeN++;if(!m.ok)badTimeCaught++}else{trueN++;if(!m.ok)trueFlag++}return}
    const v=strip(m.raw);if(wrongSet.has(v)||wrong.some(w=>Math.abs(w-+v)<0.001)){badN++;if(!m.ok)badCaught++}else{trueN++;if(!m.ok)trueFlag++}});
  if(claimWord){claimN++;if(c.claims.length)claimCaught++}else if(c.claims.length)claimFalse++}
const pct=(a,b)=>b?(a/b*100).toFixed(1)+"%":"n/a";
const rep={ranges:R.length,data:file||"synthetic",wrongPricesCaught:pct(badCaught,badN),wrongTimesCaught:pct(badTimeCaught,badTimeN),madeUpPatternsCaught:pct(claimCaught,claimN),trueNumbersWronglyFlagged:pct(trueFlag,trueN),counts:{badN,badCaught,badTimeN,badTimeCaught,trueN,trueFlag,claimN,claimCaught,claimFalse}};
console.log(JSON.stringify(rep,null,2));
if(badN&&badCaught/badN<0.9)process.exitCode=1;if(trueN&&trueFlag/trueN>0.02)process.exitCode=1;
