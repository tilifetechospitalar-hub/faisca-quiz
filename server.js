// Quiz Outubro Rosa · Grupo Lifetec — servidor em tempo real, zero dependências (Node >= 18).
// Tempo real: SSE (servidor→cliente) + POST (cliente→servidor). O servidor é a única fonte de verdade.
const http=require('http'),fs=require('fs'),path=require('path'),cr=require('crypto');
const PORT=process.env.PORT||3000,MAXP=150,GRACE=400,REV=(+process.env.REVEAL_SECONDS||10)*1000; // REV: tempo do resultado antes da próxima pergunta // GRACE: tolerância (ms) para latência de rede
const PASS=process.env.HOST_PASSWORD||'lifetecrosa',SESS=new Map(),FAIL=new Map(); // senha do anfitrião (pode ser trocada pela variável HOST_PASSWORD)
const authed=t=>(SESS.get(String(t))||0)>Date.now();
const lanIP=()=>{const i=Object.values(require('os').networkInterfaces()).flat().find(x=>x&&(x.family==='IPv4'||x.family===4)&&!x.internal);return i&&i.address};
const BASE=process.env.PUBLIC_URL||(lanIP()?`http://${lanIP()}:${PORT}`:'');
const parse=t=>String(t||'').split('\n').filter(l=>l.trim()&&l[0]!=='#').slice(0,50).map(l=>{
  const p=l.split('|').map(x=>x.trim());if(p.length<4)return null;const c=parseInt(p.pop())-1,q=p.shift().slice(0,200);
  return{q,o:p.slice(0,4).map(x=>x.slice(0,90)),c}}).filter(x=>x&&x.o.length>=2&&x.o[x.c]!==undefined);
const presets=()=>{const d=path.join(__dirname,'quizzes');try{return fs.readdirSync(d).filter(f=>f.endsWith('.txt')).map(f=>{
  const t=fs.readFileSync(path.join(d,f),'utf8');return{id:f.slice(0,-4),title:(t.match(/^# (.+)/)||[])[1]||f.slice(0,-4),quiz:parse(t)}})}catch{return[]}};
const G=new Map(),rid=()=>cr.randomBytes(8).toString('hex');
const clean=s=>String(s||'').replace(/[<>]/g,'').trim().slice(0,22);

function rank(g){ // pontos desc → menor tempo total nos acertos → ordem de entrada. Empate real divide a posição.
  const a=[...g.P.values()].sort((x,y)=>y.score-x.score||x.ms-y.ms||x.n-y.n);
  a.forEach((p,i)=>{const q=a[i-1];p.pos=q&&q.score===p.score&&q.ms===p.ms?q.pos:i+1});return a}

function view(g,p,rk){
  const q=g.quiz[g.qi],v={phase:g.phase,code:g.code,n:g.P.size,total:g.quiz.length,qi:g.qi,now:Date.now()};
  if(g.phase==='lobby'){v.names=[...g.P.values()].slice(-80).map(x=>x.name);if(!p)v.url=BASE}
  if(q&&g.phase!=='end'){v.q=q.q;v.o=q.o;v.end=g.end;v.dur=g.time}
  if(g.phase==='reveal'){v.c=q.c;v.dist=g.dist;v.nextAt=g.nextAt;v.rev=REV;v.last=g.qi+1>=g.quiz.length}
  if(g.phase==='reveal'||g.phase==='end'){
    const l=rk.map(x=>({id:x.id,name:x.name,score:x.score,pos:x.pos}));
    v.top=(g.phase==='end'&&!p)?l:l.slice(0,g.phase==='end'?10:5)}
  if(p){const r=g.phase==='reveal';
    v.me={id:p.id,name:p.name,score:p.score,pos:p.pos,streak:p.streak,
      a:p.ans?{c:p.ans.c,ok:r?p.ans.ok:undefined,pts:r?p.ans.pts:undefined}:null}}
  else v.ans=g.na;
  return v}

function push(g,hostOnly){g.last=Date.now();
  const rk=rank(g),w=(res,v)=>{try{res.write('data:'+JSON.stringify(v)+'\n\n')}catch{}};
  const hv=view(g,null,rk);g.H.forEach(r=>w(r,hv));
  if(!hostOnly)g.P.forEach(p=>p.res&&w(p.res,view(g,p,rk)))}
function sched(g,hostOnly){ // agrega rajadas de eventos (entradas/respostas) em 1 envio a cada 250ms
  if(g.t){if(!hostOnly)g.tAll=true;return}
  g.tAll=!hostOnly;g.t=setTimeout(()=>{g.t=0;push(g,!g.tAll)},250)}

function nextQ(g){
  clearTimeout(g.timer);g.qi++;g.phase='q';g.na=0;g.P.forEach(p=>p.ans=null);
  g.start=Date.now();g.end=g.start+g.time*1000;
  g.timer=setTimeout(()=>reveal(g),g.time*1000+GRACE+100);push(g)}
function reveal(g){
  if(g.phase!=='q')return;clearTimeout(g.timer);g.phase='reveal';
  const q=g.quiz[g.qi];g.dist=q.o.map(()=>0);
  g.P.forEach(p=>{if(p.ans)g.dist[p.ans.c]++;else p.streak=0});
  g.nextAt=Date.now()+REV;g.timer=setTimeout(()=>advance(g),REV);push(g)} // avança sozinho
function advance(g){if(g.phase!=='reveal')return;clearTimeout(g.timer);g.qi+1<g.quiz.length?nextQ(g):(g.phase='end',push(g))}

function answer(g,p,c){
  const now=Date.now();
  if(g.phase!=='q')return{ok:false,late:true};
  if(p.ans)return{ok:false,dup:true};                 // 1 resposta por pergunta
  if(now>g.end+GRACE)return{ok:false,late:true};     // fora do tempo: rejeita
  const q=g.quiz[g.qi];if(!(c>=0&&c<q.o.length))return{ok:false};
  const ok=c===q.c,el=Math.min(now-g.start,g.time*1000);let pts=0;
  if(ok){p.streak++;pts=Math.round(500+500*(1-el/(g.time*1000)))+Math.min(p.streak-1,4)*50;p.score+=pts;p.ms+=el}
  else p.streak=0;
  p.ans={c,ok,pts};g.na++;
  if(g.na>=g.P.size)reveal(g);else sched(g,true);    // todos responderam → antecipa o resultado
  return{ok:true}}

const routes={
  auth(b,req){ // login do anfitrião: comparação segura + bloqueio após 5 erros
    const ip=req.socket.remoteAddress,f=FAIL.get(ip)||{n:0,until:0},h=x=>cr.createHash('sha256').update(String(x)).digest();
    if(f.until>Date.now())return{error:'Muitas tentativas. Aguarde 5 minutos.'};
    if(!cr.timingSafeEqual(h(b.pw),h(PASS))){if(++f.n>=5){f.n=0;f.until=Date.now()+3e5}FAIL.set(ip,f);return{error:'Senha incorreta.'}}
    FAIL.delete(ip);const t=rid();SESS.set(t,Date.now()+8*36e5);return{auth:t}},
  presets(b){return authed(b.auth)?{list:presets().map(p=>({id:p.id,title:p.title,n:p.quiz.length}))}:{error:'auth'}},
  leave(b){ // participante sai da partida
    const g=G.get(String(b.code)),p=g&&g.P.get(b.pid);if(!p)return{ok:true};
    if(g.phase==='q'&&p.ans)g.na--;g.P.delete(p.id);try{p.res&&p.res.end()}catch{}p.res=null;
    if(g.phase==='q'&&g.P.size&&g.na>=g.P.size)reveal(g);else sched(g);return{ok:true}},
  create(b){
    if(!authed(b.auth))return{error:'auth'};
    if(G.size>=30)return{error:'Limite de salas ativas atingido.'};
    const ps=presets(),qz=(ps.find(p=>p.id===b.preset)||ps[0]||{}).quiz;
    if(!qz||!qz.length)return{error:'Quiz sem perguntas válidas.'};
    let code;do code=String(100000+Math.floor(Math.random()*900000));while(G.has(code));
    const g={code,token:rid(),quiz:qz,time:Math.min(60,Math.max(5,+b.time||20)),phase:'lobby',qi:-1,na:0,
      P:new Map,H:new Set,seq:0,t:0,last:Date.now()};
    G.set(code,g);return{code,token:g.token}},
  join(b){
    const g=G.get(String(b.code));if(!g)return{error:'Código não encontrado.'};
    let p=b.pid&&g.P.get(b.pid);                         // reconexão: mesmo pid recupera pontos
    if(!p){
      if(g.phase==='end')return{error:'Esta partida já terminou.'};
      if(g.P.size>=MAXP)return{error:'Sala cheia.'};
      let name=clean(b.name);if(!name)return{error:'Digite um apelido.'};
      const names=new Set([...g.P.values()].map(x=>x.name.toLowerCase()));
      if(names.has(name.toLowerCase())){let i=2;while(names.has((name+' '+i).toLowerCase()))i++;name+=' '+i}
      p={id:rid(),name,score:0,ms:0,streak:0,ans:null,n:++g.seq,res:null};g.P.set(p.id,p);
      sched(g)}                                          // entrada tardia: começa com 0 ponto
    return{pid:p.id,name:p.name}},
  answer(b){
    const g=G.get(String(b.code)),p=g&&g.P.get(b.pid);if(!p)return{error:'gone'};
    return answer(g,p,+b.c)},
  host(b){
    const g=G.get(String(b.code));if(!g||g.token!==b.token)return{error:'gone'};
    if(b.a==='next'){
      if(g.phase==='lobby')nextQ(g);else if(g.phase==='reveal')advance(g)
      else if(g.phase==='q')reveal(g)}
    if(b.a==='end'){clearTimeout(g.timer);g.phase='end';push(g)}
    if(b.a==='cancel'){clearTimeout(g.timer);const m='data:{"phase":"cancel"}\n\n',w=r=>{try{r.write(m);r.end()}catch{}};
      g.H.forEach(w);g.P.forEach(p=>p.res&&w(p.res));G.delete(g.code)} // só quem tem o token do anfitrião chega aqui
    return{ok:true}}};

function events(req,res,u){
  const g=G.get(u.searchParams.get('c')),h=u.searchParams.get('h'),pid=u.searchParams.get('p');
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'});
  const p=g&&g.P.get(pid),isH=g&&h&&h===g.token;
  if(!g||(!p&&!isH)){res.write('data:{"phase":"gone"}\n\n');return res.end()}
  if(isH)g.H.add(res);else{if(p.res)try{p.res.end()}catch{}p.res=res}
  res.write('data:'+JSON.stringify(view(g,isH?null:p,rank(g)))+'\n\n'); // estado atual imediato
  const hb=setInterval(()=>res.write(':\n\n'),15000);
  req.on('close',()=>{clearInterval(hb);isH?g.H.delete(res):(p.res===res&&(p.res=null))})}

http.createServer((req,res)=>{
  const u=new URL(req.url,'http://x');
  if(u.pathname==='/api/events')return events(req,res,u);
  if(req.method==='POST'&&u.pathname.startsWith('/api/')){
    let d='';req.on('data',c=>{d+=c;if(d.length>2e5)req.destroy()});
    return req.on('end',()=>{let r;try{const f=routes[u.pathname.slice(5)];r=f?f(JSON.parse(d||'{}'),req):{error:'?'}}catch(e){r={error:'Requisição inválida.'}}
      res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(r))})}
  if(u.pathname==='/healthz'){res.writeHead(200,{'Content-Type':'text/plain'});return res.end('ok')} // verificação de saúde (hospedagem)
  const m=u.pathname.match(/^\/(img\/)?([\w][\w.-]*)$/),sf=m&&path.join(__dirname,'public',m[1]?'img':'',m[2]);
  const T={'.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'}[sf&&path.extname(sf)];
  if(T&&fs.existsSync(sf)){res.writeHead(200,{'Content-Type':T,'Cache-Control':'no-cache'});return fs.createReadStream(sf).pipe(res)}
  const f=[path.join(__dirname,'public','index.html'),path.join(__dirname,'index.html')].find(x=>fs.existsSync(x));
  if(!f){res.writeHead(500,{'Content-Type':'text/plain; charset=utf-8'});return res.end('index.html não encontrado. Coloque-o em: '+path.join(__dirname,'public','index.html'))}
  fs.readFile(f,(e,b)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(b)})
}).on('error',e=>{console.error(e.code==='EADDRINUSE'?`Porta ${PORT} em uso. Rode com outra porta, ex.: PORT=3001 node server.js (Windows PowerShell: $env:PORT=3001; node server.js)`:e);process.exit(1)})
.listen(PORT,'0.0.0.0',()=>{
  const ip=Object.values(require('os').networkInterfaces()).flat().find(i=>i&&(i.family==='IPv4'||i.family===4)&&!i.internal);
  console.log(`Quiz Outubro Rosa · Grupo Lifetec rodando!\n  Neste computador: http://localhost:${PORT}\n  Na mesma rede (celulares): http://${ip?ip.address:'SEU-IP'}:${PORT}`);});
setInterval(()=>SESS.forEach((e,k)=>{if(e<Date.now())SESS.delete(k)}),36e5);
setInterval(()=>G.forEach((g,k)=>{if(Date.now()-g.last>4*36e5)G.delete(k)}),6e5); // limpa salas antigas
