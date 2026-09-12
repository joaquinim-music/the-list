const SUPABASE_URL="https://ifufmrgoknrqwbtxydmr.supabase.co";
const SUPABASE_KEY="sb_publishable_KXTCeSGR9LIpvqr15TOXBw_fIK9X1Rx";
const db=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

let levels=[], baselineOrder=[], currentMatch=null;
let playerUser=null, playerProfile=null, ownerUser=null;
let playerCompletions=[];

const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pairKey=(a,b)=>[Number(a),Number(b)].sort((x,y)=>x-y).join(":");

function rankOf(id){
  const arr=[...levels].sort((a,b)=>b.rating-a.rating);
  const i=arr.findIndex(x=>Number(x.id)===Number(id));
  return i<0?"—":i+1;
}
function confidence(c){
  c=Number(c||0);
  return c<3?"New":c<10?"Low":c<25?"Medium":"High";
}
function sortedLevels(){
  const q=$("searchInput").value.trim().toLowerCase();
  let arr=levels.filter(l=>!q||l.name.toLowerCase().includes(q)||String(l.id).includes(q));
  const sort=$("sortSelect").value;
  if(sort==="rating")arr.sort((a,b)=>b.rating-a.rating);
  else if(sort==="newest")arr.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  else if(sort==="comparisons")arr.sort((a,b)=>(b.comparisons||0)-(a.comparisons||0));
  else arr.sort((a,b)=>b.rating-a.rating);
  return arr;
}

async function loadLevels(){
  const {data,error}=await db.from("levels").select("id,name,rating,comparisons,baseline_rank,created_at").order("rating",{ascending:false});
  if(error)throw error;
  levels=(data||[]).map(x=>({...x,id:Number(x.id),rating:Number(x.rating),comparisons:Number(x.comparisons||0)}));
}
function renderList(){
  const arr=sortedLevels();
  $("stats").textContent=`${levels.length} levels • ${levels.reduce((n,l)=>n+(l.comparisons||0),0)/2|0} total comparisons`;
  $("list").innerHTML=arr.length?arr.map(l=>`
    <div class="level-row">
      <div class="rank">#${rankOf(l.id)}</div>
      <div><b>${esc(l.name)}</b><div class="meta">ID ${l.id} • ${l.comparisons||0} comparisons • ${confidence(l.comparisons)}</div></div>
      <div class="rating">${Math.round(l.rating)}</div>
      <div class="conf">${l.baseline_rank?"Baseline #"+l.baseline_rank:confidence(l.comparisons)}</div>
    </div>`).join(""):'<div class="empty">No levels found.</div>';
}

async function chooseComparison(){
  if(levels.length<2)return null;
  const weighted=levels.map(l=>({l,w:1/Math.sqrt((l.comparisons||0)+1)*(l.baseline_rank?1.15:1)}));
  let roll=Math.random()*weighted.reduce((s,x)=>s+x.w,0),target=weighted.at(-1).l;
  for(const x of weighted){roll-=x.w;if(roll<=0){target=x.l;break}}
  const {data}=await db.from("comparisons").select("level_a,level_b").or(`level_a.eq.${target.id},level_b.eq.${target.id}`).limit(80);
  const history=new Set((data||[]).map(x=>pairKey(x.level_a,x.level_b)));
  const candidates=levels.filter(l=>l.id!==target.id).map(l=>{
    const distance=Math.abs(l.rating-target.rating);
    const repeated=history.has(pairKey(target.id,l.id));
    const low=1+180/Math.sqrt((target.comparisons+1)*(l.comparisons+1));
    return {l,score=(1/(1+distance/110))*low*(repeated?.12:1),distance};
  }).sort((a,b)=>b.score-a.score||a.distance-b.distance);
  return [target,candidates[0].l];
}
async function renderCompare(){
  currentMatch=await chooseComparison();
  if(!currentMatch){$("compareArea").innerHTML='<div class="empty">Add at least two levels to start comparing.</div>';return}
  const [a,b]=currentMatch;
  $("compareArea").innerHTML=`<div class="compare-grid">
    <button class="compare-card" data-winner="${a.id}">
      <div class="name">${esc(a.name)}</div><div class="rank">#${rankOf(a.id)} • ${Math.round(a.rating)} rating</div>
    </button>
    <div class="vs">VS</div>
    <button class="compare-card" data-winner="${b.id}">
      <div class="name">${esc(b.name)}</div><div class="rank">#${rankOf(b.id)} • ${Math.round(b.rating)} rating</div>
    </button>
  </div>`;
  $("compareArea").querySelectorAll("[data-winner]").forEach(btn=>btn.onclick=()=>submitComparison(Number(btn.dataset.winner)));
}
async function submitComparison(winner){
  if(!currentMatch)return;
  $("compareHint").textContent="Saving vote...";
  const [a,b]=currentMatch;
  const {error}=await db.rpc("submit_comparison",{p_level_a:a.id,p_level_b:b.id,p_winner:winner});
  if(error){$("compareHint").textContent="Could not save vote: "+error.message;return}
  $("compareHint").textContent="Vote saved! Loading another close matchup...";
  await refresh();
}

async function addLevel(){
  const name=$("nameInput").value.trim(), id=Number($("idInput").value);
  if(!name||!Number.isInteger(id)||id<=0){$("addStatus").textContent="Enter a level name and valid numeric ID.";return}
  $("addStatus").textContent="Adding...";
  const {error}=await db.from("levels").insert({id,name,rating:1500,comparisons:0,baseline_rank:null});
  if(error){$("addStatus").textContent="Could not add level: "+error.message;return}
  $("nameInput").value="";$("idInput").value="";
  $("addStatus").textContent="Level added!";
  await refresh();
}

async function playerSignUp(){
  const email=$("playerEmail").value.trim(),password=$("playerPassword").value;
  if(!email||!password){$("playerAuthStatus").textContent="Enter an email and password.";return}
  $("playerAuthStatus").textContent="Creating account...";
  const {data,error}=await db.auth.signUp({email,password});
  if(error){$("playerAuthStatus").textContent="Signup failed: "+error.message;return}
  if(data.session){await setupPlayer(data.user);$("playerAuthStatus").textContent=""}
  else $("playerAuthStatus").textContent="Account created. Check your email if confirmation is required, then log in.";
}
async function playerSignIn(){
  const email=$("playerEmail").value.trim(),password=$("playerPassword").value;
  if(!email||!password){$("playerAuthStatus").textContent="Enter an email and password.";return}
  $("playerAuthStatus").textContent="Logging in...";
  const {data,error}=await db.auth.signInWithPassword({email,password});
  if(error){$("playerAuthStatus").textContent="Login failed: "+error.message;return}
  await setupPlayer(data.user);$("playerAuthStatus").textContent="";
}
async function setupPlayer(user){
  playerUser=user;
  const {data,error}=await db.from("players").select("id,username").eq("user_id",user.id).maybeSingle();
  if(error){$("playerAuthStatus").textContent="Could not load profile: "+error.message;return}
  playerProfile=data||null;
  $("playerAuthArea").hidden=true;$("playerArea").hidden=false;
  $("usernameInput").value=data?.username||"";
  $("playerNameDisplay").textContent=data?.username||"Choose a username";
  await loadPlayerData();
}
async function saveUsername(){
  const username=$("usernameInput").value.trim();
  if(!/^[A-Za-z0-9_ -]{2,24}$/.test(username)){ $("playerStatus").textContent="Username must be 2–24 characters using letters, numbers, spaces, _ or -.";return}
  const {data,error}=await db.rpc("set_player_username",{p_username:username});
  if(error){$("playerStatus").textContent="Could not save username: "+error.message;return}
  playerProfile=data;$("playerNameDisplay").textContent=data.username;$("playerStatus").textContent="Username saved!";
  await loadPlayerData();
}
async function playerLogout(){await db.auth.signOut();resetPlayerUI()}
function resetPlayerUI(){
  playerUser=null;playerProfile=null;playerCompletions=[];
  $("playerArea").hidden=true;$("playerAuthArea").hidden=false;$("playerAuthStatus").textContent="Logged out.";
}

async function loadPlayerData(){
  if(!playerProfile){
    $("playerStats").innerHTML=`<div class="stat"><b>—</b>Completions</div><div class="stat"><b>—</b>Score</div><div class="stat"><b>—</b>Best rank</div><div class="stat"><b>—</b>Avg rank</div>`;
    $("myCompletions").innerHTML='<div class="empty">Choose a username to start recording completions.</div>';
    return;
  }
  const {data,error}=await db.from("completions").select("id,level_id,created_at").eq("player_id",playerProfile.id).order("created_at",{ascending:false});
  if(error){$("playerStatus").textContent="Could not load completions: "+error.message;return}
  playerCompletions=data||[];
  const ls=playerCompletions.map(c=>levels.find(l=>l.id===Number(c.level_id))).filter(Boolean);
  const ranks=ls.map(l=>rankOf(l.id));
  const score=ls.reduce((s,l)=>s+Math.max(0,2000-l.rating),0);
  const best=ranks.length?Math.min(...ranks):null;
  const avg=ranks.length?Math.round(ranks.reduce((a,b)=>a+b,0)/ranks.length):null;
  $("playerStats").innerHTML=[
    ["#"+ls.length,"Completions"],
    [Math.round(score),"Difficulty score"],
    [best? "#"+best:"—","Best rank"],
    [avg? "#"+avg:"—","Average rank"]
  ].map(x=>`<div class="stat"><b>${x[0]}</b>${x[1]}</div>`).join("");
  $("myCompletions").innerHTML=ls.length?ls.map(l=>`
    <div class="completion-row"><div><b>${esc(l.name)}</b><div class="meta">ID ${l.id} • Current rank #${rankOf(l.id)}</div></div>
    <button class="danger" onclick="removeCompletion(${l.id})">Remove</button></div>`).join(""):'<div class="empty">You have not recorded any completions yet.</div>';
}
async function markCompletion(levelId){
  if(!playerUser){alert("Log in first.");return}
  if(!playerProfile){alert("Choose a username first.");return}
  const {error}=await db.rpc("add_completion",{p_level_id:Number(levelId)});
  if(error){alert("Could not record completion: "+error.message);return}
  await loadPlayerData();await renderCompletionSearch();await loadLeaderboard();
}
async function removeCompletion(levelId){
  const {error}=await db.rpc("remove_completion",{p_level_id:Number(levelId)});
  if(error){alert("Could not remove completion: "+error.message);return}
  await loadPlayerData();await renderCompletionSearch();await loadLeaderboard();
}
async function renderCompletionSearch(){
  const q=$("completionSearch").value.trim().toLowerCase(),out=$("completionSearchResults");
  if(!q){out.innerHTML="";return}
  const shown=levels.filter(l=>l.name.toLowerCase().includes(q)||String(l.id).includes(q)).slice(0,10);
  if(!shown.length){out.innerHTML='<div class="empty">No levels found.</div>';return}
  const ids=shown.map(l=>l.id);
  const {data,error}=await db.from("completions").select("level_id,players(username)").in("level_id",ids).order("created_at",{ascending:false});
  if(error){out.innerHTML='<div class="status">Could not load completion data.</div>';return}
  const grouped=new Map();
  (data||[]).forEach(c=>{const id=Number(c.level_id);if(!grouped.has(id))grouped.set(id,[]);if(c.players?.username)grouped.get(id).push(c.players.username)});
  out.innerHTML=shown.map(l=>{const names=grouped.get(l.id)||[];return `<div class="completion-row"><div><b>${esc(l.name)}</b><div class="meta">ID ${l.id} • #${rankOf(l.id)} • ${names.length} recorded completion${names.length===1?"":"s"}</div><div class="meta">${names.slice(0,20).map(esc).join(" • ")||"Nobody yet"}</div></div>${playerUser?`<button class="primary" onclick="markCompletion(${l.id})">✓ I beat it</button>`:""}</div>`}).join("");
}

async function loadLeaderboard(){
  const {data,error}=await db.from("completions").select("player_id,level_id,players(username)");
  if(error){$("leaderboard").innerHTML='<div class="empty">Could not load player leaderboard.</div>';return}
  const map=new Map();
  (data||[]).forEach(c=>{
    const id=Number(c.player_id), l=levels.find(x=>x.id===Number(c.level_id));
    if(!l)return;
    if(!map.has(id))map.set(id,{username:c.players?.username||"Unknown",count:0,score:0,best:999999});
    const p=map.get(id);p.count++;p.score+=Math.max(0,2000-l.rating);p.best=Math.min(p.best,rankOf(l.id));
  });
  let rows=[...map.values()];
  rows.sort($("leaderboardSort").value==="count"?(a,b)=>b.count-a.count||b.score-a.score:(a,b)=>b.score-a.score||b.count-a.count);
  $("leaderboard").innerHTML=rows.length?rows.slice(0,100).map((p,i)=>`
    <div class="player-row"><div class="player-rank">#${i+1}</div><div><b>${esc(p.username)}</b><div class="meta">${p.count} level${p.count===1?"":"s"} beaten • Best current rank ${p.best<999999?"#"+p.best:"—"}</div></div><div class="player-score">${Math.round(p.score)}</div><div class="meta">score</div></div>`).join(""):'<div class="empty">No player completions have been recorded yet.</div>';
}

async function restorePlayerSession(){
  const {data}=await db.auth.getSession();
  if(!data.session)return;
  // Don't require a player row to restore auth; the user can create their username later.
  await setupPlayer(data.session.user);
}

async function ownerLogin(){
  const email=$("ownerEmail").value.trim(),password=$("ownerPassword").value;
  $("ownerLoginStatus").textContent="Signing in...";
  const {data,error}=await db.auth.signInWithPassword({email,password});
  if(error){$("ownerLoginStatus").textContent="Login failed: "+error.message;return}
  const {data:owner}=await db.from("owner_users").select("user_id").eq("user_id",data.user.id).maybeSingle();
  if(!owner){await db.auth.signOut();$("ownerLoginStatus").textContent="This account is not authorized as the owner.";return}
  ownerUser=data.user;$("ownerLoginArea").hidden=true;$("ownerEditor").hidden=false;$("ownerLoginStatus").textContent="";
  await loadBaseline();
}
async function ownerLogout(){await db.auth.signOut();ownerUser=null;$("ownerEditor").hidden=true;$("ownerLoginArea").hidden=false;$("ownerLoginStatus").textContent="Logged out."}
async function loadBaseline(){
  const {data,error}=await db.from("owner_baseline").select("level_id,baseline_rank").order("baseline_rank",{ascending:true});
  if(error){$("baselineStatus").textContent="Could not load baseline: "+error.message;return}
  baselineOrder=(data||[]).map(x=>Number(x.level_id));renderBaselineEditor();$("baselineStatus").textContent="Shared baseline loaded.";
}
function renderBaselineEditor(){
  const byId=new Map(levels.map(l=>[l.id,l])), ordered=[],seen=new Set();
  baselineOrder.forEach(id=>{const l=byId.get(id);if(l&&!seen.has(id)){ordered.push(l);seen.add(id)}});
  levels.forEach(l=>{if(!seen.has(l.id)){ordered.push(l);seen.add(l.id)}});
  $("baselineCount").textContent=`${ordered.length} levels shown. Drag to reorder.`;
  $("baselineList").innerHTML=ordered.length?ordered.map((l,i)=>`<div class="baseline-item" draggable="true" data-id="${l.id}"><div class="drag-handle">☰</div><div><b>${esc(l.name)}</b><div class="meta">ID ${l.id}${baselineOrder.includes(l.id)?" • saved":" • new"}</div></div><div class="baseline-position">#${i+1}</div></div>`).join(""):'<div class="empty">No levels yet.</div>';
  attachDrag();
}
function attachDrag(){
  let dragged=null;
  $("baselineList").querySelectorAll(".baseline-item").forEach(item=>{
    item.addEventListener("dragstart",()=>{dragged=item;item.classList.add("dragging")});
    item.addEventListener("dragend",()=>{item.classList.remove("dragging");dragged=null;rebuildBaselineOrder()});
    item.addEventListener("dragover",e=>{e.preventDefault();if(!dragged||dragged===item)return;const r=item.getBoundingClientRect();e.clientY>r.top+r.height/2?item.after(dragged):item.before(dragged)});
  });
}
function rebuildBaselineOrder(){
  baselineOrder=[...$("baselineList").querySelectorAll(".baseline-item")].map(x=>Number(x.dataset.id));
  [...$("baselineList").querySelectorAll(".baseline-position")].forEach((x,i)=>x.textContent="#"+(i+1));
}
async function saveBaseline(){
  rebuildBaselineOrder();
  const ids=baselineOrder.filter(id=>levels.some(l=>l.id===id));
  if(!ids.length)return;
  $("baselineStatus").textContent="Saving...";
  const {data,error}=await db.rpc("set_owner_baseline",{p_level_ids:ids});
  if(error){$("baselineStatus").textContent="Could not save: "+error.message;return}
  $("baselineStatus").textContent=`Saved ${data.count} baseline positions.`;
  await refresh();
  await loadBaseline();
}

async function refresh(){
  try{
    await loadLevels();
    $("connectionDot").classList.add("online");
    $("connectionText").textContent="Connected to the shared ranking";
    renderList();
    await renderCompare();
    await loadLeaderboard();
    await renderCompletionSearch();
    if(ownerUser)renderBaselineEditor();
    if(playerUser)await loadPlayerData();
  }catch(e){
    $("connectionDot").classList.remove("online");
    $("connectionText").textContent="Database connection failed";
    $("stats").textContent="Could not load the shared ranking.";
    $("list").innerHTML='<div class="empty">Could not connect to Supabase. Check the SQL setup and project settings.</div>';
    console.error(e);
  }
}

$("nextMatchBtn").onclick=renderCompare;
$("addLevelBtn").onclick=addLevel;
$("searchInput").oninput=renderList;
$("sortSelect").onchange=renderList;
$("signupBtn").onclick=playerSignUp;
$("loginBtn").onclick=playerSignIn;
$("logoutBtn").onclick=playerLogout;
$("saveUsernameBtn").onclick=saveUsername;
$("completionSearch").oninput=renderCompletionSearch;
$("leaderboardSort").onchange=loadLeaderboard;
$("ownerLoginBtn").onclick=ownerLogin;
$("ownerLogoutBtn").onclick=ownerLogout;
$("saveBaselineBtn").onclick=saveBaseline;

db.auth.onAuthStateChange(async(event,session)=>{
  if(event==="SIGNED_OUT"){
    ownerUser=null;
    resetPlayerUI();
    $("ownerEditor").hidden=true;
    $("ownerLoginArea").hidden=false;
  }
});

(async()=>{await refresh();await restorePlayerSession();})();
