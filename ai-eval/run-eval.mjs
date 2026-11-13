// Scores local AI models on the AI range feature: same ranges, same facts, then the fact checker grades every answer.
// Needs Ollama running on this PC with the models pulled.
// Usage: node ai-eval/run-eval.mjs --nq <NQ 1m csv> [--es <ES 1m csv>] [--models gemma3:4b,qwen2.5:3b,llama3.2:3b] [--n 50] [--tasks explain,tech]
// It saves after every answer, so you can stop it and run it again to continue.
import fs from "node:fs";import path from "node:path";import {loadEngine,readCSV,agg,sampleRanges} from "./lib.mjs";
const A=process.argv.slice(2),arg=(k,d)=>{const i=A.indexOf("--"+k);return i>=0?A[i+1]:d};
const nqF=arg("nq"),esF=arg("es"),models=arg("models","gemma3:4b,qwen2.5:3b,llama3.2:3b").split(","),N=+arg("n",50),tasks=arg("tasks","explain,tech").split(","),url=arg("url","http://localhost:11434");
if(!nqF){console.error("Give the NQ 1-minute CSV: --nq <file>");process.exit(1)}
const AIR=loadEngine(),nq=agg(readCSV(nqF),300),es=esF?agg(readCSV(esF),300):null,R=sampleRanges(AIR,nq,N);
const day=new Date().toISOString().slice(0,10),dir=path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,"$1")),"results",day);fs.mkdirSync(dir,{recursive:true});
const log=path.join(dir,"answers.jsonl"),done=new Set(fs.existsSync(log)?fs.readFileSync(log,"utf8").split("\n").filter(Boolean).map(l=>{const j=JSON.parse(l);return j.model+"|"+j.task+"|"+j.range}):[]);
async function ask(model,pr){const t0=Date.now();const r=await fetch(url+"/api/chat",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({model,stream:false,messages:[{role:"system",content:pr.system},{role:"user",content:pr.user}],options:{temperature:0.2,num_ctx:8192,seed:1}})});
  const j=await r.json();if(!r.ok)throw new Error(j.error||r.status);return{text:(j.message&&j.message.content)||"",ms:Date.now()-t0}}
console.log("Ranges:",R.length,"Models:",models.join(", "),"Tasks:",tasks.join(", "));
for(const model of models)for(const task of tasks)for(let k=0;k<R.length;k++){const key=model+"|"+task+"|"+k;if(done.has(key))continue;
  const {i1,i2}=R[k],F=AIR.facts(nq.slice(0,i2+1),i1,i2,{sym:"NAS100",tf:"5m",tfSec:300,dec:2,other:es?{sym:"US500",bars:es.filter(b=>b.t<=nq[i2].t)}:null});
  let out;try{out=await ask(model,AIR.prompt(task,F))}catch(e){out={text:"",ms:0,err:String(e.message||e)}}
  const c=AIR.check(out.text,F,2);
  fs.appendFileSync(log,JSON.stringify({model,task,range:k,day:F.day,from:F.from,to:F.to,ms:out.ms,err:out.err||null,text:out.text,good:c.good,total:c.total,wrong:c.marks.filter(m=>!m.ok).map(m=>m.raw),claims:c.claims.map(x=>x.name)})+"\n");
  process.stdout.write(`\r${model} ${task} ${k+1}/${R.length}   `)}
// summary
const rows=fs.readFileSync(log,"utf8").split("\n").filter(Boolean).map(l=>JSON.parse(l)),groups={};
rows.forEach(r=>{(groups[r.model+"|"+r.task]=groups[r.model+"|"+r.task]||[]).push(r)});
let md="# AI range eval, "+day+"\n\n"+R.length+" New York morning ranges of NAS100 5-minute candles"+(es?" (SMT compared with US500)":"")+". Facts are measured by code; the model only writes them up. Every price, time and pattern word in each answer is checked against the facts.\n\n| Model | Task | Answers | Numbers correct | Answers with no wrong number | Answers that invent a pattern | Avg time |\n|---|---|---|---|---|---|---|\n";
const summary=[];
Object.entries(groups).forEach(([k,g])=>{const[model,task]=k.split("|"),ok=g.filter(r=>!r.err),num=ok.reduce((a,r)=>a+r.total,0),good=ok.reduce((a,r)=>a+r.good,0);
  const s={model,task,answers:ok.length,failed:g.length-ok.length,numbersCorrect:num?+(good/num*100).toFixed(1):null,cleanAnswers:+(ok.filter(r=>r.good===r.total).length/(ok.length||1)*100).toFixed(1),inventedPattern:+(ok.filter(r=>r.claims.length).length/(ok.length||1)*100).toFixed(1),avgSec:+(ok.reduce((a,r)=>a+r.ms,0)/(ok.length||1)/1000).toFixed(1)};summary.push(s);
  md+=`| ${model} | ${task} | ${s.answers}${s.failed?" ("+s.failed+" failed)":""} | ${s.numbersCorrect??"-"}% (${good}/${num}) | ${s.cleanAnswers}% | ${s.inventedPattern}% | ${s.avgSec} s |\n`});
fs.writeFileSync(path.join(dir,"summary.json"),JSON.stringify(summary,null,2));fs.writeFileSync(path.join(dir,"summary.md"),md);
console.log("\n\n"+md+"\nSaved in "+dir);
