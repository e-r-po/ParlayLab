export function americanToDecimal(o){const n=Number(o);return !Number.isFinite(n)||n===0?NaN:n>0?1+n/100:1+100/Math.abs(n)}
export function decimalToAmerican(d){return !Number.isFinite(d)||d<=1?null:d>=2?Math.round((d-1)*100):-Math.round(100/(d-1))}
export function formatAmerican(o){return o==null||!Number.isFinite(Number(o))?'—':`${Number(o)>0?'+':''}${Math.round(Number(o))}`}
export function impliedProbability(o){const d=americanToDecimal(o);return Number.isFinite(d)?1/d:NaN}
export function combineLegs(legs){const decimal=legs.reduce((v,l)=>v*americanToDecimal(l.price),1);return {decimal,american:decimalToAmerican(decimal),implied:1/decimal}}
export function poissonAtLeastOne(rate){return 1-Math.exp(-Math.max(0,rate))}
export function estimateAnytimeTd({opportunitiesPerGame,tdPerOpportunity,teamTdMultiplier=1}){const a=Number(opportunitiesPerGame),b=Number(tdPerOpportunity),c=Number(teamTdMultiplier);if(![a,b,c].every(Number.isFinite)||a<0||b<0||b>1||c<0)return NaN;return poissonAtLeastOne(a*b*c)}
export function noSameEvent(legs){return new Set(legs.map(l=>l.eventId)).size===legs.length}
export function parlayCandidates(legs,minOdds=1000,maxLegs=3,maxResults=30){const result=[];function walk(start,picked){if(picked.length>=2){const stats=combineLegs(picked);if(stats.american>=minOdds&&noSameEvent(picked))result.push({legs:[...picked],...stats})}if(picked.length>=maxLegs)return;for(let i=start;i<legs.length;i++){if(picked.some(x=>x.eventId===legs[i].eventId))continue;walk(i+1,[...picked,legs[i]])}}walk(0,[]);return result.sort((a,b)=>a.american-b.american).slice(0,maxResults)}
