const SUPABASE_URL="https://ifufmrgoknrqwbtxydmr.supabase.co";
const SUPABASE_KEY="sb_publishable_KXTCeSGR9LIpvqr15TOXBw_fIK9X1Rx";
const db=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
let user=null, player=null, owner=false;
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function youtubeOk(url){try{const u=new URL(url);return /(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(u.hostname)}catch{return false}}
async function setup(){
  const s=await db.auth.getSession(); user=s.data.session?.user||null;
  if(user)await restore(); else $("authStatus").textContent="Not logged in.";
  await loadLeaderboard(); await loadReview();
}
async function restore(){
  const q=await db.from("players").select("*").eq("user_id",user.id).maybeSingle();
  player=q.data||null; $("logoutBtn").classList.remove("hidden");
  if(player?.username){$("profileSummary").innerHTML=`<div class="profile-card"><div class="stat"><span class="muted">Username</span><b>${esc(player.username)}</b></div><div class="stat"><span class="muted">Account</span><b>Verified</b></div></div>`;$("usernameArea").classList.add("hidden")}
  else {$("usernameArea").classList.remove("hidden");$("profileSummary").innerHTML='<p class="muted">Choose a username to start submitting completions.</p>'}
  await loadMine();
}
async function signup(){
  const {data,error}=await db.auth.signUp({email:$("playerEmail").value,password:$("playerPassword").value});
  if(error){$("authStatus").textContent=error.message;return}
  $("authStatus").textContent=data.session?"Account created!":"Check your email to confirm your account.";
  if(data.session){user=data.user;await restore()}
}
async function login(){
  const {data,error}=await db.auth.signInWithPassword({email:$("playerEmail").value,password:$("playerPassword").value});
  if(error){$("authStatus").textContent=error.message;return}
  user=data.user;$("authStatus").textContent="Logged in.";await restore();await loadReview();
}
async function logout(){await db.auth.signOut();user=null;player=null;$("logoutBtn").classList.add("hidden");$("usernameArea").classList.add("hidden");$("profileSummary").innerHTML="";$("myCompletions").textContent="Log in to see your submissions."}
async function saveUsername(){
  const {data,error}=await db.rpc("set_player_username",{p_username:$("usernameInput").value});
  if(error){$("authStatus").textContent=error.message;return}
  player=data;$("authStatus").textContent="Username saved.";await restore();await loadLeaderboard();
}
async function submitCompletion(){
  if(!user){$("completionStatus").textContent="Log in first.";return}
  if(!player?.username){$("completionStatus").textContent="Choose a username first.";return}
  const levelId=Number($("completionLevelId").value), url=$("youtubeUrl").value.trim();
  if(!Number.isInteger(levelId)||levelId<=0||!youtubeOk(url)){ $("completionStatus").textContent="Enter a valid level ID and YouTube link.";return}
  const {error}=await db.rpc("submit_completion",{p_level_id:levelId,p_youtube_url:url});
  $("completionStatus").textContent=error?error.message:"Submitted! It is now pending owner review.";
  if(!error){$("completionLevelId").value="";$("youtubeUrl").value="";await loadMine()}
}
async function loadMine(){
  if(!user){return}
  const q=await db.from("completions").select("*,levels(name,rating),completion_reviews(status)").eq("player_id",player?.id||0).order("created_at",{ascending:false});
  if(q.error){$("myCompletions").textContent=q.error.message;return}
  $("myCompletions").innerHTML=q.data.length?q.data.map(c=>`<div class="submission"><b>${esc(c.levels?.name||c.level_id)}</b><div class="level-meta">${esc(c.status)} · submitted ${new Date(c.created_at).toLocaleDateString()}</div><a href="${esc(c.youtube_url)}" target="_blank" rel="noopener">Watch proof</a></div>`).join(""):'<div class="empty">No submissions yet.</div>';
}
async function loadLeaderboard(){
  const q=await db.from("player_leaderboard").select("*").order("difficulty_score",{ascending:false}).limit(100);
  if(q.error){$("playerLeaderboard").textContent=q.error.message;return}
  $("playerLeaderboard").innerHTML=q.data.length?q.data.map((p,i)=>`<div class="leader-row"><b>#${i+1}</b><a href="player.html?id=${p.player_id}"><b>${esc(p.username)}</b></a><span>${p.levels_beaten} verified</span><span>${Math.round(p.difficulty_score)} pts</span></div>`).join(""):'<div class="empty">No players yet.</div>';
}
async function findVictors(){
  const id=Number($("victorLevelId").value); if(!id)return;
  const q=await db.from("completions").select("player_id,players(username),youtube_url").eq("level_id",id).eq("status","approved").order("created_at",{ascending:true});
  if(q.error){$("victorResults").textContent=q.error.message;return}
  $("victorResults").innerHTML=q.data.length?q.data.map(v=>`<div class="victor"><a href="player.html?id=${v.player_id}">${esc(v.players?.username||"Player")}</a><a href="${esc(v.youtube_url)}" target="_blank" rel="noopener">Proof ↗</a></div>`).join(""):'<div class="empty">No verified victors yet.</div>';
}
async function loadReview(){
  if(!user)return;
  const o=await db.from("owner_users").select("user_id").eq("user_id",user.id).maybeSingle(); owner=!!o.data;
  if(!owner){$("reviewPanel").classList.add("hidden");return}
  $("reviewPanel").classList.remove("hidden");
  const q=await db.from("completions").select("*,players(username),levels(name)").eq("status","pending").order("created_at",{ascending:true});
  if(q.error){$("pendingSubmissions").textContent=q.error.message;return}
  $("pendingSubmissions").innerHTML=q.data.length?q.data.map(c=>`<div class="submission"><b>${esc(c.players?.username||"Player")} — ${esc(c.levels?.name||c.level_id)}</b><div class="level-meta">${new Date(c.created_at).toLocaleString()}</div><div class="submission-actions"><a href="${esc(c.youtube_url)}" target="_blank" rel="noopener"><button>Watch Proof</button></a><button data-approve="${c.id}">Accept</button><button class="danger" data-reject="${c.id}">Reject</button></div></div>`).join(""):'<div class="empty">No pending submissions.</div>';
}
async function review(id,status){
  const {error}=await db.rpc("review_completion",{p_completion_id:Number(id),p_status:status});
  if(error)alert(error.message); else {await loadReview();await loadLeaderboard()}
}
$("signUpBtn").onclick=signup;$("loginBtn").onclick=login;$("logoutBtn").onclick=logout;$("saveUsernameBtn").onclick=saveUsername;$("submitCompletionBtn").onclick=submitCompletion;$("findVictorsBtn").onclick=findVictors;
$("pendingSubmissions").addEventListener("click",e=>{if(e.target.dataset.approve)review(e.target.dataset.approve,"approved");if(e.target.dataset.reject)review(e.target.dataset.reject,"rejected")});
db.auth.onAuthStateChange(async()=>setup());
setup();