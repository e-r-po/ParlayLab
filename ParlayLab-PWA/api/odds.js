const BASE='https://api.the-odds-api.com/v4';
const ALLOWED=new Set(['americanfootball_nfl','basketball_nba','baseball_mlb','icehockey_nhl','americanfootball_ncaaf','basketball_ncaab']);
const MARKETS=new Set(['h2h','spreads','totals','player_anytime_td','player_pass_yds','player_rush_yds','player_receptions','player_reception_yds','player_points','player_rebounds','player_assists','batter_home_runs']);
const isId=s=>/^[a-zA-Z0-9_-]{8,100}$/.test(s);
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'GET only'});
 const key=process.env.ODDS_API_KEY;
 if(!key)return res.status(503).json({error:'ODDS_API_KEY is not configured on the server.'});
 const {sport,kind='events',eventId,markets='h2h',bookmakers='draftkings,fanduel,betmgm'}=req.query;
 if(!ALLOWED.has(sport))return res.status(400).json({error:'Unsupported sport'});
 const selected=markets.split(',').filter(m=>MARKETS.has(m));
 if(!selected.length||selected.length>6)return res.status(400).json({error:'Invalid markets'});
 const books=bookmakers.split(',').filter(x=>/^[a-z0-9_]{2,30}$/.test(x)).slice(0,8).join(',');
 if(!books)return res.status(400).json({error:'Invalid bookmakers'});
 let path;
 if(kind==='events')path=`/sports/${sport}/events`;
 else if(kind==='odds')path=`/sports/${sport}/odds`;
 else if(kind==='props'&&eventId&&isId(eventId))path=`/sports/${sport}/events/${eventId}/odds`;
 else return res.status(400).json({error:'Invalid request'});
 const url=new URL(BASE+path);url.searchParams.set('apiKey',key);
 if(kind!=='events'){url.searchParams.set('regions','us');url.searchParams.set('oddsFormat','american');url.searchParams.set('markets',selected.join(','));url.searchParams.set('bookmakers',books)}
 try{const r=await fetch(url,{signal:AbortSignal.timeout(11000)});const body=await r.text();let data;try{data=JSON.parse(body)}catch{data={error:'Unexpected odds provider response'}};
  const remaining=r.headers.get('x-requests-remaining');if(remaining)res.setHeader('X-Odds-Requests-Remaining',remaining);
  if(!r.ok)return res.status(r.status===429?429:502).json({error:data.message||data.error||`Provider returned ${r.status}`});
  return res.status(200).json({data,remaining:remaining||null,updatedAt:new Date().toISOString()});
 }catch(e){return res.status(502).json({error:'Odds service unavailable or timed out'})}
}
