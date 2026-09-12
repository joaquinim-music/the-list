const SUPABASE_URL="https://ifufmrgoknrqwbtxydmr.supabase.co";
const SUPABASE_KEY="sb_publishable_KXTCeSGR9LIpvqr15TOXBw_fIK9X1Rx";
const db=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

let levels=[];
let baseline=[];let draggingRow=null;

const $=id=>document.getElementById(id);
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function money(){return ""}

async function isOwner(){
  const {data:{user}}=await db.auth.getUser();
  if(!user) return false;
  const {data}=await db.from("owner_users").select("user_id").eq("user_id",user.id).maybeSingle();
  return !!data;
}

function showTab(name){
  document.querySelectorAll(".admin-tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===name));
  document.querySelectorAll(".admin-tab-content").forEach(x=>x.classList.toggle("hidden",x.id!=="tab-"+name));
  if(name==="levels") renderLevels();
  if(name==="completions") loadCompletions();
  if(name==="baseline") renderBaseline();
}

async function loadLevels(){
  const {data,error}=await db.from("levels").select("*").order("rating",{ascending:false});
  if(error){$("admin-status").textContent=error.message;return;}
  levels=data||[];
  baseline=[...levels].filter(x=>x.baseline_rank).sort((a,b)=>a.baseline_rank-b.baseline_rank);
  renderStats();
  renderLevels();
  renderBaseline();
}

function renderStats(){const totalComparisons=Math.round(levels.reduce((n,x)=>n+(x.comparisons||0),0)/2);$('admin-stats').innerHTML=`<div class="stat-card"><strong>${levels.length}</strong><span>Total Levels</span></div><div class="stat-card"><strong>${totalComparisons}</strong><span>Comparisons</span></div><div class="stat-card"><strong>${baseline.length}</strong><span>Baseline Levels</span></div>`;loadAdminCounts()}
async function loadAdminCounts(){const q=await db.from('completions').select('id',{count:'exact',head:true}).eq('status','pending');const card=document.createElement('div');card.className='stat-card';card.innerHTML=`<strong>${q.count||0}</strong><span>Pending Completions</span>`;if(!$('admin-stats').querySelector('.pending-stat')){card.classList.add('pending-stat');$('admin-stats').appendChild(card)}}

function renderLevels(){
  const q=($("level-filter").value||"").trim().toLowerCase();
  const list=levels.filter(l=>
    !q || String(l.id).includes(q) ||
    String(l.name||"").toLowerCase().includes(q) ||
    String(l.creator||"").toLowerCase().includes(q)
  );
  $("level-count").textContent=`${list.length} shown`;
  $("admin-level-list").innerHTML=list.map(l=>`
    <div class="admin-row">
      <div class="admin-main">
        <strong>${esc(l.name)}</strong>
        <span class="muted">ID ${l.id} · ${esc(l.creator||"Unknown")} · Rating ${Number(l.rating).toFixed(0)} · ${l.comparisons||0} comparisons</span>
      </div>
      <div class="admin-actions">
        <a class="secondary button-link" href="level.html?id=${encodeURIComponent(l.id)}">View</a>
        <button class="danger delete-level" data-id="${l.id}">Delete</button>
      </div>
    </div>`).join("") || `<p class="muted">No levels found.</p>`;

  document.querySelectorAll(".delete-level").forEach(btn=>{
    btn.onclick=async()=>{
      const id=Number(btn.dataset.id);
      const level=levels.find(x=>x.id===id);
      if(!confirm(`Delete "${level?.name||id}"? This also removes its comparisons, completions, and baseline entry.`)) return;
      const {error}=await db.rpc("delete_level",{p_level_id:id});
      if(error){alert(error.message);return;}
      await loadLevels();
      await loadCompletions();
    };
  });
}

async function loadCompletions(){
  const {data,error}=await db.from("completions")
    .select("id,player_id,level_id,youtube_url,status,created_at,players(username),levels(name,rating)")
    .eq("status","pending")
    .order("created_at",{ascending:true});
  if(error){$("admin-completion-list").innerHTML=`<p class="muted">${esc(error.message)}</p>`;return;}
  const rows=data||[];
  $("pending-count").textContent=`${rows.length} pending`;
  $("admin-completion-list").innerHTML=rows.map(c=>`
    <div class="admin-row completion-row">
      <div class="admin-main">
        <strong>${esc(c.players?.username||"Unknown player")} → ${esc(c.levels?.name||"Unknown level")}</strong>
        <span class="muted">Rating ${Number(c.levels?.rating||0).toFixed(0)} · Submitted ${new Date(c.created_at).toLocaleString()}</span>
        <a class="proof-link" target="_blank" rel="noopener noreferrer" href="${esc(c.youtube_url||"#")}">▶ Watch YouTube proof</a>
      </div>
      <div class="admin-actions">
        <button class="primary review-completion" data-id="${c.id}" data-status="approved">Approve</button>
        <button class="danger review-completion" data-id="${c.id}" data-status="rejected">Reject</button>
      </div>
    </div>`).join("") || `<p class="muted">🎉 No pending completion submissions.</p>`;

  document.querySelectorAll(".review-completion").forEach(btn=>{
    btn.onclick=async()=>{
      const id=Number(btn.dataset.id), status=btn.dataset.status;
      const {error}=await db.rpc("review_completion",{p_completion_id:id,p_status:status});
      if(error){alert(error.message);return;}
      await loadCompletions();
    };
  });
}

function renderBaseline(){const el=$("admin-baseline-list");if(!el)return;el.innerHTML=baseline.map((l,i)=>`<div class="admin-row baseline-admin-row" draggable="true" data-id="${l.id}"><span class="drag-grip">☰</span><span class="baseline-rank">#${i+1}</span><div class="admin-main"><strong>${esc(l.name)}</strong><span class="muted">ID ${l.id} · Rating ${Number(l.rating).toFixed(0)}</span></div></div>`).join('')||`<p class="muted">No baseline levels yet.</p>`;el.querySelectorAll('.baseline-admin-row').forEach(row=>{row.addEventListener('dragstart',()=>{draggingRow=row;row.classList.add('dragging')});row.addEventListener('dragend',()=>{row.classList.remove('dragging');draggingRow=null;rebuildBaselineFromDom()});row.addEventListener('dragover',e=>{e.preventDefault();if(!draggingRow||draggingRow===row)return;const r=row.getBoundingClientRect();if(e.clientY>r.top+r.height/2)row.after(draggingRow);else row.before(draggingRow)});row.addEventListener('drop',e=>{e.preventDefault();rebuildBaselineFromDom();renderBaseline()})})}
function rebuildBaselineFromDom(){baseline=[...document.querySelectorAll('#admin-baseline-list .baseline-admin-row')].map(r=>levels.find(l=>Number(l.id)===Number(r.dataset.id))).filter(Boolean)}

$("save-admin-baseline").onclick=async()=>{
  const ids=baseline.map(x=>Number(x.id));
  const {error}=await db.rpc("set_owner_baseline",{p_level_ids:ids});
  $("baseline-message").textContent=error?error.message:"Baseline saved!";
  if(!error) await loadLevels();
};

$("level-filter").oninput=renderLevels;
document.querySelectorAll(".admin-tab").forEach(b=>b.onclick=()=>showTab(b.dataset.tab));
document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>showTab(b.dataset.go));

$("admin-signin").onclick=async()=>{
  $("admin-login-message").textContent="Signing in…";
  const {error}=await db.auth.signInWithPassword({
    email:$("admin-email").value.trim(),
    password:$("admin-password").value
  });
  if(error){$("admin-login-message").textContent=error.message;return;}
  await boot();
};

async function boot(){
  if(!(await isOwner())){
    $("admin-app").classList.add("hidden");
    $("admin-login").classList.remove("hidden");
    $("admin-status").textContent="Owner login required.";
    return;
  }
  $("admin-login").classList.add("hidden");
  $("admin-app").classList.remove("hidden");
  $("admin-status").textContent="✅ Owner access granted.";
  await loadLevels();
  await loadCompletions();
}

boot();
