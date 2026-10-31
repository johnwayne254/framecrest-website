(() => {
  const cfg = window.FRAMECREST_CONFIG || {};
  const configured = cfg.supabaseUrl && cfg.supabaseAnonKey && !cfg.supabaseUrl.includes("YOUR_") && !cfg.supabaseAnonKey.includes("YOUR_");
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  let db, user, profile, projects = [], clients = [], editors = [], finances = [];
  const money = n => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2}).format(Number(n||0));
  const safe = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const date = v => v ? new Date(v+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : "—";
  const toast = msg => { const el=$("#toast"); el.textContent=msg; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),3200); };
  const role = () => profile?.role || "client";
  const isAdmin = () => role()==="admin";
  const statusClass = s => String(s||"").toLowerCase().replaceAll(" ","-");
  function showLogin(msg="") { $("#login-screen").classList.remove("hidden"); $("#app").classList.add("hidden"); $("#login-message").textContent=msg; }
  function showApp() { $("#login-screen").classList.add("hidden"); $("#app").classList.remove("hidden"); }
  async function boot() {
    if(!configured || !window.supabase){ showLogin("Setup required: connect your Supabase project using the setup guide."); return; }
    db=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
    const {data:{session}}=await db.auth.getSession();
    if(session) await loadWorkspace(session.user);
    db.auth.onAuthStateChange((_event,session)=>{ if(session) setTimeout(()=>loadWorkspace(session.user),0); else showLogin(); });
  }
  $("#login-form").addEventListener("submit",async e=>{
    e.preventDefault(); $("#login-message").textContent="Signing in…";
    const {error}=await db.auth.signInWithPassword({email:$("#email").value,password:$("#password").value});
    if(error) $("#login-message").textContent=error.message;
  });
  $("#sign-out").addEventListener("click",()=>db.auth.signOut());
  async function loadWorkspace(authUser){
    user=authUser;
    const {data:p,error}=await db.from("profiles").select("id,full_name,role,client_id").eq("id",user.id).single();
    if(error||!p){showLogin("Your account profile is not ready. Ask the administrator to check your access.");return;}
    profile=p;
    $("#user-name").textContent=p.full_name||user.email; $("#user-role").textContent=p.role; $("#avatar").textContent=(p.full_name||user.email||"F").slice(0,1).toUpperCase();
    $("#welcome-title").textContent="Good to have you here, "+((p.full_name||"").split(" ")[0]||"");
    $("#today-label").textContent=new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"});
    $$(".admin-only").forEach(el=>el.classList.toggle("hidden",!isAdmin()));
    $("#clients-view").classList.toggle("hidden",!isAdmin());
    showApp(); await refresh();
  }
  async function refresh(){
    let q=db.from("projects").select("id,project_code,name,client_id,service,quantity,editor_id,due_date,status,qa_status,created_at,brief,folder_url,clients(name),profiles!projects_editor_id_fkey(full_name)").order("created_at",{ascending:false});
    const {data,error}=await q;
    if(error){toast(error.message);return;} projects=data||[];
    if(isAdmin()){
      const [cr,er,fr]=await Promise.all([
        db.from("clients").select("*").order("name"),
        db.from("profiles").select("id,full_name").eq("role","editor").order("full_name"),
        db.from("project_financials").select("project_id,quote_usd,paid_usd")
      ]);
      clients=cr.data||[]; editors=er.data||[]; finances=fr.data||[];
      const balance=finances.reduce((a,x)=>a+Number(x.quote_usd||0)-Number(x.paid_usd||0),0);
      $("#stat-balance").textContent=money(balance);
      renderClients(); fillSelects(); renderFinance();
    }
    renderProjects(); renderOverview();
  }
  function renderOverview(){
    const active=projects.filter(p=>["Awaiting files","In progress","Revisions"].includes(p.status)).length;
    $("#stat-active").textContent=active; $("#stat-qa").textContent=projects.filter(p=>p.status==="In QA").length;
    $("#stat-delivered").textContent=projects.filter(p=>p.status==="Delivered").length;
    $("#recent-projects").innerHTML=projects.slice(0,6).map(projectRow).join("")||'<tr><td colspan="4" class="empty">No projects yet.</td></tr>';
  }
  function projectRow(p){return '<tr><td><strong>'+safe(p.project_code||"—")+'</strong><small class="subline">'+safe(p.name)+'</small></td><td>'+safe(p.service)+'</td><td>'+date(p.due_date)+'</td><td><span class="status '+statusClass(p.status)+'">'+safe(p.status)+'</span></td></tr>';}
  function renderProjects(){
    const term=($("#project-search")?.value||"").toLowerCase();
    const rows=projects.filter(p=>(p.name+" "+p.project_code+" "+p.service+" "+(p.clients?.name||"")).toLowerCase().includes(term));
    const allowedStatuses=isAdmin()?["Awaiting files","In progress","In QA","Revisions","Delivered","Cancelled"]:["In progress","In QA","Revisions"];
    $("#projects-table").innerHTML=rows.map(p=>'<tr><td><strong>'+safe(p.project_code)+'</strong><small class="subline">'+safe(p.name)+'</small></td><td>'+safe(p.clients?.name||"Your project")+'</td><td>'+safe(p.service)+'</td><td>'+safe(p.profiles?.full_name||"Unassigned")+'</td><td>'+date(p.due_date)+'</td><td>'+ (isAdmin()||role()==="editor" ? '<select class="inline-select status-change" data-id="'+p.id+'">'+allowedStatuses.map(s=>'<option '+(s===p.status?'selected':'')+'>'+s+'</option>').join("")+'</select>' : '<span class="status '+statusClass(p.status)+'">'+safe(p.status)+'</span>')+'</td><td>'+ (isAdmin()?'<select class="inline-select qa-change" data-id="'+p.id+'">'+["Not started","Pending review","Passed","Changes required"].map(s=>'<option '+(s===p.qa_status?'selected':'')+'>'+s+'</option>').join("")+'</select>':'<span class="status '+statusClass(p.qa_status)+'">'+safe(p.qa_status||"Not started")+'</span>')+'</td></tr>').join("")||'<tr><td colspan="7" class="empty">No matching projects.</td></tr>';
    $$(".status-change").forEach(el=>el.addEventListener("change",async()=>{const {error}=await db.from("projects").update({status:el.value}).eq("id",el.dataset.id);if(error)toast(error.message);else{toast("Project status updated.");await refresh();}}));
    $$(".qa-change").forEach(el=>el.addEventListener("change",async()=>{const {error}=await db.from("projects").update({qa_status:el.value}).eq("id",el.dataset.id);if(error)toast(error.message);else{toast("QA status updated.");await refresh();}}));
  }
  function renderFinance(){
    if(!isAdmin()) return;
    const rows=projects.map(p=>{const f=finances.find(x=>x.project_id===p.id)||{quote_usd:0,paid_usd:0};return {p,f,balance:Number(f.quote_usd||0)-Number(f.paid_usd||0)};});
    $("#finance-table").innerHTML=rows.map(({p,f,balance})=>'<tr><td><strong>'+safe(p.project_code)+'</strong><small class="subline">'+safe(p.name)+'</small></td><td>'+safe(p.clients?.name||"—")+'</td><td>'+money(f.quote_usd)+'</td><td>'+money(f.paid_usd)+'</td><td><strong>'+money(balance)+'</strong></td><td><button class="btn secondary finance-edit" data-id="'+p.id+'">Edit</button></td></tr>').join("")||'<tr><td colspan="6" class="empty">No projects to show.</td></tr>';
    $$(".finance-edit").forEach(btn=>btn.addEventListener("click",()=>{const f=finances.find(x=>x.project_id===btn.dataset.id)||{quote_usd:0,paid_usd:0};const form=$("#finance-form");form.project_id.value=btn.dataset.id;form.quote_usd.value=f.quote_usd||0;form.paid_usd.value=f.paid_usd||0;$("#finance-modal").classList.remove("hidden");}));
  }
  function renderClients(){
    $("#clients-table").innerHTML=clients.map(c=>'<tr><td><strong>'+safe(c.name)+'</strong></td><td>'+safe(c.contact_name||"—")+'</td><td>'+safe(c.email||"—")+'</td><td>'+safe(c.location||"—")+'</td><td>'+projects.filter(p=>p.client_id===c.id).length+'</td></tr>').join("")||'<tr><td colspan="5" class="empty">No clients added yet.</td></tr>';
  }
  function fillSelects(){
    $("#project-client").innerHTML='<option value="">Select a client</option>'+clients.map(c=>'<option value="'+c.id+'">'+safe(c.name)+'</option>').join("");
    $("#project-editor").innerHTML='<option value="">Unassigned</option>'+editors.map(e=>'<option value="'+e.id+'">'+safe(e.full_name)+'</option>').join("");
  }
  function setView(view){
    $$(".view").forEach(el=>el.classList.add("hidden")); $("#"+view+"-view").classList.remove("hidden");
    $$(".nav-item").forEach(el=>el.classList.toggle("active",el.dataset.view===view));
    $("#page-title").textContent=view.charAt(0).toUpperCase()+view.slice(1);
  }
  $$(".nav-item").forEach(b=>b.addEventListener("click",()=>setView(b.dataset.view)));
  $$("[data-goto]").forEach(b=>b.addEventListener("click",()=>setView(b.dataset.goto)));
  $("#project-search").addEventListener("input",renderProjects);
  $("#new-project-open").addEventListener("click",()=>$("#project-modal").classList.remove("hidden"));
  $("#new-client-open").addEventListener("click",()=>$("#client-modal").classList.remove("hidden"));
  $$("[data-close]").forEach(b=>b.addEventListener("click",()=>$("#"+b.dataset.close).classList.add("hidden")));
  $("#client-form").addEventListener("submit",async e=>{
    e.preventDefault();const obj=Object.fromEntries(new FormData(e.currentTarget).entries());
    const {error}=await db.from("clients").insert(obj);if(error){$("#client-message").textContent=error.message;return;}
    e.currentTarget.reset();$("#client-modal").classList.add("hidden");toast("Client saved.");await refresh();
  });
  $("#project-form").addEventListener("submit",async e=>{
    e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget).entries());
    const obj={name:f.name,client_id:f.client_id,service:f.service,quantity:Number(f.quantity),due_date:f.due_date,editor_id:f.editor_id||null,brief:f.brief,folder_url:f.folder_url,status:"Awaiting files",qa_status:"Not started"};
    const {data,error}=await db.from("projects").insert(obj).select("id").single();
    if(error){$("#project-message").textContent=error.message;return;}
    e.currentTarget.reset();$("#project-modal").classList.add("hidden");toast("Project created.");await refresh();
  });

  $("#finance-form").addEventListener("submit",async e=>{
    e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget).entries());
    const quote=Number(f.quote_usd), paid=Number(f.paid_usd);
    if(paid>quote){$("#finance-message").textContent="Amount paid cannot exceed the quoted amount.";return;}
    const {error}=await db.from("project_financials").upsert({project_id:f.project_id,quote_usd:quote,paid_usd:paid,updated_at:new Date().toISOString()},{onConflict:"project_id"});
    if(error){$("#finance-message").textContent=error.message;return;}
    $("#finance-modal").classList.add("hidden");toast("Project finances saved.");await refresh();
  });
  boot();
})();