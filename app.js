const SUPABASE_URL="https://ifufmrgoknrqwbtxydmr.supabase.co";
const SUPABASE_KEY="sb_publishable_KXTCeSGR9LIpvqr15TOXBw_fIK9X1Rx";
const db=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
let levels=[]; let comparePair=null; let history=new Set(); let owner=false;

const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pairKey=(a,b)=>[a,b].sort((x,y)=>x-y).join(":");

async function loadLevels(){
  const {data,error}=await db.from("levels").select("*").order("rating",{ascending:false});
  if(error){$("levelList").innerHTML=`<div class="empty">${esc(error.message)}</div>`;return}
  levels=data||[]; $("levelCount").textContent=`${levels.length} levels`;
  renderList(); renderCompare(); renderOwnerTools();
}
function renderList(){
  const q=($("levelSearch").value||"").toLowerCase();
  const filtered=levels.filter(l=>`${l.name} ${l.id}`.toLowerCase().includes(q));
  $("levelList").innerHTML=filtered.map((l,i)=>`<div class="level-row">
    <div class="rank">#${levels.indexOf(l)+1}</div>
    <div class="level-main"><h3><a href="level.html?id=${l.id}">${esc(l.name)}</a></h3>
    <div class="level-meta">ID ${l.id} · ${esc(l.creator||"Unknown creator")} · ${Math.round(l.rating)} rating · ${l.comparisons||0} comparisons</div></div>
  </div>`).join("")||`<div class="empty">No levels found.</div>`;
}
function chooseComparison(){
  if(levels.length<2)return null;
  const weighted=levels.map(level=>({level,weight:1/Math.sqrt((level.comparisons||0)+1)}));
  const total=weighted.reduce((s,x)=>s+x.weight,0); let roll=Math.random()*total; let target=weighted[weighted.length-1].level;
  for(const x of weighted){roll-=x.weight;if(roll<=0){target=x.level;break}}
  const opponents=levels.filter(x=>x.id!==target.id).map(level=>{
    const distance=Math.abs(level.rating-target.rating);
    const repeated=history.has(pairKey(target.id,level.id));
    return {level,score:(1/(1+distance/120))*(1+180/Math.sqrt((target.comparisons+1)*(level.comparisons+1)))*(repeated?.08:1),distance};
  }).sort((a,b)=>b.score-a.score||a.distance-b.distance);
  return [target,opponents[0].level];
}
function renderCompare(){
  comparePair=chooseComparison();
  if(!comparePair){$("compareArea").innerHTML='<div class="empty">Add at least two levels.</div>';return}
  const [a,b]=comparePair;
  $("compareArea").innerHTML=`<div class="compare-grid">
    ${compareCard(a)}<div class="muted">VS</div>${compareCard(b)}
  </div>`;
}
function compareCard(l){return `<div class="compare-card"><h3>${esc(l.name)}</h3><div class="level-meta">#${levels.indexOf(l)+1} · ${Math.round(l.rating)} rating</div><button data-win="${l.id}">This is harder</button></div>`}
async function vote(winner){
  if(!comparePair)return;
  const [a,b]=comparePair;
  const {error}=await db.rpc("submit_comparison",{p_level_a:a.id,p_level_b:b.id,p_winner:Number(winner)});
  if(error){alert(error.message);return}
  history.add(pairKey(a.id,b.id)); await loadLevels();
}
async function addLevel(){
  const id=Number($("addLevelId").value);
  if(!Number.isInteger(id)||id<=0){$("addLevelStatus").textContent="Enter a valid level ID.";return}
  $("addLevelStatus").textContent="Looking up level...";
  try{
    const r=await fetch(`https://gdbrowser.com/api/level/${id}`);
    if(!r.ok)throw new Error("That level could not be found.");
    const d=await r.json();
    const {error}=await db.from("levels").insert({id,name:d.name||`Level ${id}`,creator:d.author||"Unknown",rating:1500,comparisons:0});
    if(error)throw error;
    $("addLevelStatus").textContent=`Added ${d.name||id}.`;
    $("addLevelId").value=""; await loadLevels();
  }catch(e){$("addLevelStatus").textContent=e.message||"Lookup failed."}
}
async function ownerLogin(){
  const {data,error}=await db.auth.signInWithPassword({email:$("ownerEmail").value,password:$("ownerPassword").value});
  if(error){$("ownerStatus").textContent=error.message;return}
  const check=await db.from("owner_users").select("user_id").eq("user_id",data.user.id).maybeSingle();
  owner=!!check.data; $("ownerStatus").textContent=owner?"Owner access granted.":"That account is not an owner.";
  $("ownerTools").classList.toggle("hidden",!owner);
  if(owner){const ok=await refreshOwnerLevels();if(ok)renderOwnerTools();}
}
async function deleteLevel(id){
  if(!owner||!confirm(`Delete level ${id}? This also removes its related ranking/completion data.`))return;
  const {error}=await db.rpc("delete_level",{p_level_id:id});
  if(error)alert(error.message); else await loadLevels();
}
async function refreshOwnerLevels(){
  const {data,error}=await db.from("levels").select("*").order("rating",{ascending:false});
  if(error){$("ownerStatus").textContent="Could not refresh levels: "+error.message;return false;}
  levels=data||[];
  return true;
}
function renderOwnerTools(){
  if(!owner)return;
  $("deleteLevelList").innerHTML=levels.map(l=>`<div class="level-row"><div class="level-main"><b>${esc(l.name)}</b><div class="level-meta">ID ${l.id}</div></div><button class="danger" data-delete="${l.id}">Delete</button></div>`).join("");
  $("baselineList").innerHTML=levels.map(l=>`<div class="baseline-item" draggable="true" data-id="${l.id}">${esc(l.name)} <span class="muted">(${l.id})</span></div>`).join("");
  let drag;
  document.querySelectorAll(".baseline-item").forEach(el=>{
    el.addEventListener("dragstart",()=>drag=el);
    el.addEventListener("dragover",e=>e.preventDefault());
    el.addEventListener("drop",()=>{if(drag&&drag!==el)el.parentNode.insertBefore(drag,el)});
  });
}
async function saveBaseline(){
  if(!owner)return;
  await refreshOwnerLevels();
  renderOwnerTools();
  const ids=[...document.querySelectorAll(".baseline-item")].map(x=>Number(x.dataset.id));
  const {error}=await db.rpc("set_owner_baseline",{p_level_ids:ids});
  $("ownerStatus").textContent=error?error.message:"Baseline saved!";
  await loadLevels();
}
$("levelSearch").addEventListener("input",renderList);
$("refreshBtn").onclick=loadLevels;
$("addLevelBtn").onclick=addLevel;
$("compareArea").addEventListener("click",e=>{if(e.target.dataset.win)vote(e.target.dataset.win)});
$("deleteLevelList").addEventListener("click",e=>{if(e.target.dataset.delete)deleteLevel(Number(e.target.dataset.delete))});
$("ownerLoginBtn").onclick=ownerLogin;
$("ownerLogoutBtn").onclick=async()=>{await db.auth.signOut();owner=false;$("ownerTools").classList.add("hidden")};
$("saveBaselineBtn").onclick=saveBaseline;
loadLevels();

function wireOwnerLogin(){
  const email=document.getElementById("owner-email");
  const password=document.getElementById("owner-password");
  const signIn=document.getElementById("owner-signin");
  const message=document.getElementById("owner-login-message");
  const state=document.getElementById("owner-login-state");

  if(!signIn || signIn.dataset.wired) return;
  signIn.dataset.wired="1";

  signIn.onclick=async()=>{
    message.textContent="Signing in…";
    const {error}=await db.auth.signInWithPassword({
      email:email.value.trim(),
      password:password.value
    });
    if(error){
      message.textContent=error.message;
      return;
    }
    message.textContent="Logged in!";
    await refreshOwnerLogin();
  };
}

async function refreshOwnerLogin(){
  const panel=document.getElementById("owner-login-panel");
  const email=document.getElementById("owner-email");
  const password=document.getElementById("owner-password");
  const button=document.getElementById("owner-signin");
  const message=document.getElementById("owner-login-message");
  const state=document.getElementById("owner-login-state");
  if(!panel) return;

  const {data:{user}}=await db.auth.getUser();
  if(!user){
    email.classList.remove("hidden");
    password.classList.remove("hidden");
    button.classList.remove("hidden");
    state.classList.add("hidden");
    return;
  }

  const {data:owner}=await db.from("owner_users")
    .select("user_id")
    .eq("user_id",user.id)
    .maybeSingle();

  if(owner){
    email.classList.add("hidden");
    password.classList.add("hidden");
    button.classList.add("hidden");
    state.classList.remove("hidden");
    state.innerHTML='<div class="owner-bar"><strong>✅ Owner mode active</strong><button id="owner-signout" class="secondary">Log Out</button></div>';
    document.getElementById("owner-signout").onclick=async()=>{
      await db.auth.signOut();
      await refreshOwnerLogin();
      if(typeof loadLevels==="function") await loadLevels();
    };
  }else{
    message.textContent="This account is not registered as the owner.";
  }
}

wireOwnerLogin();
refreshOwnerLogin();

async function ownerIsActive(){
  const {data:{user}}=await db.auth.getUser();
  if(!user) return false;
  const {data,error}=await db.from("owner_users")
    .select("user_id")
    .eq("user_id",user.id)
    .maybeSingle();
  return !error && !!data;
}

async function ownerDeleteLevel(id){
  if(!(await ownerIsActive())) throw new Error("Owner login required");
  const {error}=await db.rpc("delete_level",{p_level_id:Number(id)});
  if(error) throw error;
  await loadLevels();
}

