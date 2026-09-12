const SUPABASE_URL="https://ifufmrgoknrqwbtxydmr.supabase.co";
const SUPABASE_KEY="sb_publishable_KXTCeSGR9LIpvqr15TOXBw_fIK9X1Rx";
const db=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=id=>document.getElementById(id); const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function main(){
 const id=Number(new URLSearchParams(location.search).get("id"));
 if(!id){$("levelPage").innerHTML='<div class="panel">Missing level ID.</div>';return}
 const lq=await db.from("levels").select("*").eq("id",id).maybeSingle();
 if(lq.error||!lq.data){$("levelPage").innerHTML='<div class="panel">Level not found.</div>';return}
 let l=lq.data, api={};
 try{const r=await fetch(`https://gdbrowser.com/api/level/${id}`);if(r.ok)api=await r.json()}catch{}
 const v=await db.from("completions").select("player_id,players(username),youtube_url").eq("level_id",id).eq("status","approved").order("created_at",{ascending:true});
 $("levelPage").innerHTML=`<section class="panel"><p class="eyebrow">LEVEL #${id}</p><h1>${esc(api.name||l.name)}</h1><p class="muted">by ${esc(api.author||l.creator||"Unknown creator")} · The List rating ${Math.round(l.rating)}</p>
 <div class="profile-card"><div class="stat"><span class="muted">Difficulty</span><b>${esc(api.difficulty||"Unknown")}</b></div><div class="stat"><span class="muted">Song</span><b>${esc(api.songName||"Unknown")}</b></div></div>
 <h2>Description</h2><p>${esc(api.description||"No description available from the level lookup.")}</p>
 <h2>Victors</h2>${v.data?.length?v.data.map(x=>`<div class="victor"><a href="player.html?id=${x.player_id}">${esc(x.players?.username||"Player")}</a><a href="${esc(x.youtube_url)}" target="_blank" rel="noopener">Watch proof ↗</a></div>`).join(""):'<div class="empty">No verified victors yet.</div>'}</section>`;
}
main();