
const $=id=>document.getElementById(id);

const markets={
  player_pass_yds:['Pass yards','passing_yards'],
  player_rush_yds:['Rush yards','rushing_yards'],
  player_reception_yds:['Rec yards','receiving_yards'],
  player_receptions:['Receptions','receptions'],
  player_anytime_td:['Anytime TD','anytime_td'],
  player_pass_tds:['Pass TDs','passing_tds'],
  player_pass_attempts:['Pass attempts','attempts'],
  player_pass_completions:['Completions','completions'],
  player_rush_attempts:['Rush attempts','carries']
};

const state={
  bets:[],logs:[],slip:[],
  sort:'player',direction:1,page:0,
  statsError:'',injuries:[],
  analytics:null,historyCache:new Map(),contextCache:new Map(),
  playerLogs:new Map(),eligibleLogs:new Map(),injuryByPlayer:new Map()
};

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;',
  '"':'&quot;',"'":'&#39;'
}[c]));
const norm=s=>String(s||'').toLowerCase()
  .replace(/\b(jr|sr|ii|iii|iv)\b/g,'')
  .replace(/[^a-z0-9]/g,'');
const pct=n=>Number.isFinite(n)?(n*100).toFixed(1)+'%':'—';
const american=n=>Number(n)>0?'+'+n:String(n);
const decimal=n=>n>0?1+n/100:1+100/Math.abs(n);

const cols=[
  ['player','Player'],['prop','Prop'],['line','Line'],
  ['book','Book'],['price','Odds'],['ev','EV'],
  ['prob','Model %'],['l5','L5'],['l10','L10'],
  ['season','Season'],['usage','Usage'],
  ['defense','Opp D'],['injury','Injury'],['add','+']
];

$('markets').innerHTML=Object.entries(markets)
  .map(([k,v],i)=>`<label><input type="checkbox" value="${k}" ${i<5?'checked':''}> ${v[0]}</label>`)
  .join('');

function headers(){
  $('headers').innerHTML=cols.map(([key,label])=>
    `<th><button data-sort="${key}" ${key==='add'?'disabled':''}>${label}${state.sort===key?(state.direction===1?' ▲':' ▼'):''}</button></th>`
  ).join('');
  document.querySelectorAll('[data-sort]').forEach(b=>b.onclick=()=>{
    if(b.dataset.sort==='add')return;
    if(state.sort===b.dataset.sort)state.direction*=-1;
    else{
      state.sort=b.dataset.sort;
      state.direction=keyDirection(state.sort);
    }
    state.page=0;render();
  });
}

function keyDirection(key){
  return ['ev','prob','l5','l10','season','price'].includes(key)?-1:1;
}

async function api(q){
  const r=await fetch('/api/odds?'+new URLSearchParams(q));
  const j=await r.json();
  if(!r.ok)throw Error(j.error||'Odds API error');
  return j.data;
}

function numeric(row,key){
  if(key==='anytime_td'){
    if(row.rushing_tds==null||row.receiving_tds==null)return NaN;
    return Number(row.rushing_tds)+Number(row.receiving_tds);
  }
  return row[key]==null||row[key]===''?NaN:Number(row[key]);
}

// Rebuild indexes only when historical data or injury data changes.
function rebuildIndexes(){
  state.playerLogs=new Map();
  state.eligibleLogs=new Map();
  state.injuryByPlayer=new Map();
  for(const injury of state.injuries){
    const name=norm(injury.player);
    if(!state.injuryByPlayer.has(name))state.injuryByPlayer.set(name,injury);
  }
  for(const row of state.logs){
    const name=norm(row.player_display_name);
    if(!state.playerLogs.has(name))state.playerLogs.set(name,[]);
    state.playerLogs.get(name).push(row);
    if(String(row.season_type)==='REG'&&Number(row.season)===2026){
      for(const [,key] of Object.values(markets)){
        if(row[key]==null)continue;
        if(!state.eligibleLogs.has(key))state.eligibleLogs.set(key,[]);
        state.eligibleLogs.get(key).push(row);
      }
    }
  }
  invalidateAnalytics();
}
function invalidateAnalytics(){
  state.analytics=null;
  state.historyCache.clear();
  state.contextCache.clear();
}
function calculatedRows(){
  if(state.analytics!==null)return state.analytics;
  state.analytics=state.bets.map(b=>{
    // Sportsbooks and alternate market labels can share identical calculations.
    const historyKey=JSON.stringify([norm(b.player),b.base,b.side,b.line]);
    if(!state.historyCache.has(historyKey))
      state.historyCache.set(historyKey,history(b));
    const h=state.historyCache.get(historyKey);
    const contextKey=JSON.stringify([historyKey,b.home,b.away]);
    if(!state.contextCache.has(contextKey))
      state.contextCache.set(contextKey,context(b,h));
    const c=state.contextCache.get(contextKey);
    return {...b,h,...c,
      ev:Number.isFinite(c.prob)?c.prob*decimal(b.price)-1:NaN,
      l5:h?.l5??NaN,l10:h?.l10??NaN,season:h?.season??NaN
    };
  });
  return state.analytics;
}

function history(b){
  const key=markets[b.base][1],name=norm(b.player);
  const matches=(state.playerLogs.get(name)||[]);
  if(new Set(matches.map(r=>r.player_id).filter(Boolean)).size>1)return null;
  const rows=matches
    .filter(r=>String(r.season_type)==='REG'&&Number(r.season)===2026)
    .sort((a,z)=>Number(a.week)-Number(z.week));
  const values=rows.map(r=>numeric(r,key)).filter(Number.isFinite);
  if(values.length<5)return null;
  const hit=xs=>{
    const eligible=xs.filter(v=>b.side==='Anytime'||v!==b.line);
    return eligible.length
      ?eligible.filter(v=>b.side==='Anytime'?v>=1:b.side==='Over'?v>b.line:v<b.line).length/eligible.length
      :NaN;
  };
  const l5=hit(values.slice(-5)),l10=hit(values.slice(-10)),season=hit(values);
  if(![l5,l10,season].every(Number.isFinite))return null;
  const prob=Math.max(.02,Math.min(.98,(10*l10+10*season+2.5)/25));
  return {l5,l10,season,prob,n:values.length,rows};
}

function parse(e){
  const arr=[];
  for(const b of e.bookmakers||[])
    for(const m of b.markets||[]){
      const base=m.key.replace(/_alternate$/,'');
      if(!markets[base])continue;
      for(const o of m.outcomes||[]){
        const side=/^over$/i.test(o.name)?'Over':
          /^under$/i.test(o.name)?'Under':
          base==='player_anytime_td'&&/^yes$/i.test(o.name)?'Anytime':null;
        if(!side||!o.description||!Number.isFinite(o.price))continue;
        const line=side==='Anytime'?0:Number(o.point);
        if(!Number.isFinite(line))continue;
        arr.push({
          id:[e.id,b.key,m.key,o.description,side,line].join('|'),
          eventId:e.id,
          game:`${e.away_team} @ ${e.home_team}`,
          home:e.home_team,away:e.away_team,
          player:o.description,prop:markets[base][0],
          book:b.title,base,
          alt:m.key.endsWith('_alternate'),
          side,line,price:o.price
        });
      }
    }
  return arr;
}

function context(b,h){
  const injury=state.injuryByPlayer.get(norm(b.player));
  const status=injury?.status||'Unverified';
  if(!h)return {prob:NaN,usage:NaN,defense:NaN,injury:status};

  const recent=h.rows.slice(-5),key=markets[b.base][1];
  const volumeKey=['passing_yards','passing_tds','completions','attempts'].includes(key)?'attempts':
    ['rushing_yards','carries'].includes(key)?'carries':
    ['receiving_yards','receptions'].includes(key)?'targets':null;

  const avg=(rows,k)=>{
    const v=rows.map(r=>Number(r[k])).filter(Number.isFinite);
    return v.length?v.reduce((a,z)=>a+z,0)/v.length:NaN;
  };

  const usage=volumeKey?avg(recent,volumeKey):NaN;
  const baseline=volumeKey?avg(h.rows,volumeKey):NaN;
  const team=h.rows[h.rows.length-1]?.recent_team;
  const opponent=team===b.home?b.away:team===b.away?b.home:null;

  const eligible=state.eligibleLogs.get(key)||[];
  const allowed=opponent?eligible.filter(r=>r.opponent_team===opponent):[];
  const leagueAvg=avg(eligible,key),defAvg=avg(allowed,key);
  const defense=allowed.length>=20&&leagueAvg>0
    ?Math.max(.85,Math.min(1.15,defAvg/leagueAvg)):NaN;

  let factor=1;
  if(Number.isFinite(usage)&&Number.isFinite(baseline)&&baseline>0)
    factor*=Math.max(.85,Math.min(1.15,usage/baseline));
  if(Number.isFinite(defense))factor*=defense;

  const prob=/^(out|inactive|ir)$/i.test(status)
    ?NaN:Math.max(.02,Math.min(.98,h.prob*factor));

  return {prob,usage,defense,injury:status};
}

function slip(){
  $('count').textContent=state.slip.length;
  $('slip').innerHTML=state.slip.map((b,i)=>
    `<div class="slip">${esc(b.player)} · ${esc(b.prop)} ${b.side==='Anytime'?'TD':`${b.side} ${b.line}`} · ${esc(b.book)} ${american(b.price)} <button class="add" data-remove="${i}">×</button></div>`
  ).join('');
  document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{
    state.slip.splice(Number(b.dataset.remove),1);slip();
  });
  if(!state.slip.length){$('summary').textContent='';return}
  const d=state.slip.reduce((v,b)=>v*decimal(b.price),1);
  const stake=Math.max(0,Number($('stake').value)||0);
  $('summary').textContent=`Indicative decimal odds ${d.toFixed(2)} · Potential return $${(stake*d).toFixed(2)} · Correlated legs not priced`;
}

function render(){
  headers();
  const search=$('player').value.trim().toLowerCase();
  const min=Number($('minhit').value)||0;
  let rows=calculatedRows();

  rows=rows.filter(b=>
    ($('game').value==='all'||b.eventId===$('game').value)&&
    ($('alts').checked||!b.alt)&&
    (!search||b.player.toLowerCase().includes(search))&&
    (min===0||Number.isFinite(b.l10)&&b.l10*100>=min)
  );

  rows.sort((a,b)=>{
    const k=state.sort;
    const av=k==='line'?a.line:k==='player'?a.player:k==='prop'?a.prop:k==='book'?a.book:a[k];
    const bv=k==='line'?b.line:k==='player'?b.player:k==='prop'?b.prop:k==='book'?b.book:b[k];
    const missing=v=>v==null||typeof v==='number'&&!Number.isFinite(v);
    if(missing(av)!==missing(bv))return missing(av)?1:-1;
    const cmp=typeof av==='string'?av.localeCompare(bv):av-bv;
    return state.direction*cmp;
  });

  const size=Number($('pageSize').value);
  const pages=Math.max(1,Math.ceil(rows.length/size));
  state.page=Math.min(state.page,pages-1);
  $('total').textContent=`${rows.length.toLocaleString()} matching bets`;
  $('pageInfo').textContent=`Page ${state.page+1} of ${pages}`;
  $('prev').disabled=state.page===0;
  $('next').disabled=state.page>=pages-1;

  $('results').innerHTML=rows.slice(state.page*size,(state.page+1)*size)
    .map(b=>`<tr>
      <td class="name" title="${esc(b.game)}">${esc(b.player)}</td>
      <td>${esc(b.prop)}${b.alt?' · ALT':''}</td>
      <td>${b.side==='Anytime'?'TD':`${b.side==='Over'?'O':'U'} ${b.line}`}</td>
      <td>${esc(b.book)}</td>
      <td>${american(b.price)}</td>
      <td class="${Number.isFinite(b.ev)&&b.ev>0?'teal':''}">${pct(b.ev)}</td>
      <td>${pct(b.prob)}</td>
      <td>${pct(b.l5)}</td>
      <td>${pct(b.l10)}</td>
      <td>${pct(b.season)}</td>
      <td>${Number.isFinite(b.usage)?b.usage.toFixed(1):'—'}</td>
      <td>${Number.isFinite(b.defense)?b.defense.toFixed(2)+'×':'—'}</td>
      <td>${esc(b.injury)}</td>
      <td><button class="add" data-add="${esc(b.id)}">+</button></td>
    </tr>`).join('')||'<tr><td colspan="14">No matching bets.</td></tr>';

  document.querySelectorAll('[data-add]').forEach(x=>x.onclick=()=>{
    const b=state.bets.find(y=>y.id===x.dataset.add);
    if(b&&!state.slip.some(y=>y.id===b.id)){
      state.slip.push(b);slip();
    }
  });
}

async function loadStats(){
  try{
    const r=await fetch('/api/stats'),j=await r.json();
    if(!r.ok)throw Error(j.error||'Stats unavailable');
    if(!Array.isArray(j.data))throw Error('Invalid stats response');
    state.logs=j.data;
    rebuildIndexes();
    $('statsStatus').textContent=`nflverse ${j.season}: ${state.logs.length.toLocaleString()} player-week records · updated ${new Date(j.updatedAt).toLocaleString()}`;
    render();
  }catch(e){
    state.statsError=e.message;
    $('statsStatus').textContent=e.message+' · EV and hit rates will show —';
  }
}

$('scan').onclick=async()=>{
  const btn=$('scan');
  btn.disabled=true;
  state.bets=[];
  invalidateAnalytics();
  try{
    const chosen=[...document.querySelectorAll('#markets input:checked')].map(x=>x.value);
    if(!chosen.length)throw Error('Choose a prop market');
    const all=[...chosen,...($('alts').checked?chosen.filter(x=>x!=='player_anytime_td').map(x=>x+'_alternate'):[])];
    const chunks=[];
    for(let i=0;i<all.length;i+=10)chunks.push(all.slice(i,i+10));
    const events=(await api({kind:'events'})).filter(e=>new Date(e.commence_time)>new Date());

    $('game').innerHTML='<option value="all">All upcoming games</option>'+
      events.map(e=>`<option value="${esc(e.id)}">${esc(e.away_team)} @ ${esc(e.home_team)}</option>`).join('');

    const errors=[];
    for(let i=0;i<events.length;i++){
      $('status').textContent=`Scanning game ${i+1}/${events.length}`;
      for(const chunk of chunks)try{
        state.bets.push(...parse(await api({
          kind:'props',
          eventId:events[i].id,
          markets:chunk.join(','),
          bookmakers:$('book').value
        })));
      }catch(e){errors.push(e.message)}
    }
    state.page=0;
    invalidateAnalytics();
    render();
    $('status').textContent=`Loaded ${state.bets.length.toLocaleString()} odds rows${errors.length?` · ${errors.length} failed requests: ${errors[0]}`:''}`;
  }catch(e){
    $('status').textContent=e.message;
  }finally{
    btn.disabled=false;
  }
};

['game','alts','player','minhit','pageSize'].forEach(id=>
  $(id).addEventListener(['player','minhit'].includes(id)?'input':'change',()=>{
    state.page=0;render();
  })
);
$('prev').onclick=()=>{state.page--;render()};
$('next').onclick=()=>{state.page++;render()};
$('stake').oninput=slip;

render();
slip();
loadStats();

$('injuries').onchange=async e=>{
  try{
    const data=JSON.parse(await e.target.files[0].text());
    if(!Array.isArray(data)||!data.every(x=>
      typeof x.player==='string'&&
      typeof x.status==='string'&&
      typeof x.checkedAt==='string'&&
      typeof x.source==='string'
    ))throw Error('Expected [{player,status,checkedAt,source}]');

    state.injuries=data;
    rebuildIndexes();
    $('injuryStatus').textContent=`Loaded ${data.length} user-supplied injury statuses; check timestamps and sources before relying on them.`;
    render();
  }catch(e){
    $('injuryStatus').textContent=e.message;
  }
};

