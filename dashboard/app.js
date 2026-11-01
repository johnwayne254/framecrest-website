(() => {
  const cfg = window.FRAMECREST_CONFIG || {};
  const configured = cfg.supabaseUrl && cfg.supabaseAnonKey && !cfg.supabaseUrl.includes("YOUR_") && !cfg.supabaseAnonKey.includes("YOUR_");
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  let db, user, profile, projects = [], clients = [], editors = [], qaReviewers = [], finances = [], team = [], projectRequests = [];
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
    $("#welcome-subtitle").textContent=p.role==="client"?"A clear view of your projects, progress and anything that needs your attention.":p.role==="editor"?"Your assigned projects, production briefs and delivery deadlines.":"Here is what's happening across your workspace.";
    $("#today-label").textContent=new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"});
    $$(".admin-only").forEach(el=>el.classList.toggle("hidden",!isAdmin()));
    $$(".client-only").forEach(el=>el.classList.toggle("hidden",role()!=="client"));
    $("#clients-view").classList.toggle("hidden",!isAdmin());
    showApp(); await refresh();
  }
  async function refreshClients(){
    if(!isAdmin()) return;
    const {data,error}=await db.from("clients").select("*").order("name");
    if(error){toast("Could not load clients: "+error.message);console.error("FrameCrest clients load:",error);return false;}
    clients=data||[];
    renderClients(); fillSelects();
    return true;
  }
  async function refresh(){
    const jobs=[db.from("projects").select("id,project_code,name,client_id,service,quantity,editor_id,qa_id,due_date,status,qa_status,created_at,brief,folder_url,clients(name),profiles!projects_editor_id_fkey(full_name),qa_profile:profiles!projects_qa_id_fkey(full_name)").order("created_at",{ascending:false})];
    jobs.push(db.from("project_financials").select("project_id,quote_usd,paid_usd"));
    if(isAdmin()) jobs.push(db.from("profiles").select("id,full_name").eq("role","editor").order("full_name"));
    const results=await Promise.all(jobs);
    const pr=results[0];
    if(pr.error){toast("Could not load projects: "+pr.error.message);console.error("FrameCrest projects load:",pr.error);}
    else projects=pr.data||[];
    finances=results[1].data||[];
    if(results[1].error) console.error("FrameCrest project finances:",results[1].error);
    if(isAdmin()){
      editors=results[2].data||[];
      if(results[2].error) console.error("FrameCrest editors load:",results[2].error);
      await refreshClients();
      const [teamResult,qaResult]=await Promise.all([db.from("profiles").select("id,full_name,role,client_id,account_type,is_active").eq("account_type","staff").neq("role","admin").order("full_name"),db.from("profiles").select("id,full_name").eq("role","qa").order("full_name")]);
      team=teamResult.data||[];qaReviewers=qaResult.data||[];renderTeam();fillSelects();
      const balance=finances.reduce((a,x)=>a+Number(x.quote_usd||0)-Number(x.paid_usd||0),0);
      $("#stat-balance").textContent=money(balance);
      renderFinance();
      await refreshProjectRequests();
    }else if(role()==="client"){
      await refreshProjectRequests();
      renderFinance();
    }
    renderProjects(); renderOverview();
  }
  function renderOverview(){
    const active=projects.filter(p=>["Awaiting files","In progress","Revisions"].includes(p.status)).length;
    const inQA=projects.filter(p=>p.status==="In QA").length;
    const delivered=projects.filter(p=>p.status==="Delivered").length;
    const attention=projects.filter(p=>p.status==="Revisions"||p.qa_status==="Changes required").length;
    $("#stat-active").textContent=active; $("#stat-qa").textContent=inQA;
    $("#stat-delivered").textContent=delivered;
    if(role()==="client"){
      $("#stat-active").previousElementSibling.textContent="Active projects";
      $("#stat-active").nextElementSibling.textContent="Projects currently being handled";
      $("#stat-qa").previousElementSibling.textContent="In quality review";
      $("#stat-qa").nextElementSibling.textContent="Being checked before delivery";
      $("#stat-delivered").previousElementSibling.textContent="Completed projects";
      $("#stat-delivered").nextElementSibling.textContent="Ready or already delivered";
      $("#stat-balance").closest(".stat-card").classList.add("hidden");
      let attentionCard=$("#stat-attention");
      if(!attentionCard){
        const card=document.createElement("article");
        card.className="stat-card";
        card.innerHTML='<span>Needs your attention</span><strong id="stat-attention">0</strong><small>Projects with requested changes</small>';
        $("#stats-grid").append(card);
        attentionCard=$("#stat-attention");
      }
      attentionCard.textContent=attention;
      $("#overview-view .card-heading h3").textContent="Your recent projects";
      $("#overview-view .card-heading .eyebrow").textContent="PROJECT UPDATES";
      $("#overview-view .card-heading .text-button").textContent="View all projects →";
    }else{
      const attentionCard=$("#stat-attention");
      if(attentionCard) attentionCard.closest(".stat-card").remove();
      $("#stat-balance").closest(".stat-card").classList.toggle("hidden",!isAdmin());
      $("#overview-view .card-heading h3").textContent="Recent projects";
      $("#overview-view .card-heading .eyebrow").textContent="LATEST ACTIVITY";
      $("#overview-view .card-heading .text-button").textContent="View all →";
    }
    $("#recent-projects").innerHTML=projects.slice(0,6).map(projectRow).join("")||'<tr><td colspan="4" class="empty">No projects yet.</td></tr>';
  }
  function projectRow(p){return '<tr><td><strong>'+safe(p.project_code||"—")+'</strong><small class="subline">'+safe(p.name)+'</small></td><td>'+safe(p.service)+'</td><td>'+date(p.due_date)+'</td><td><span class="status '+statusClass(p.status)+'">'+safe(p.status)+'</span></td></tr>';}
  async function refreshTeam(){
    if(!isAdmin())return;
    const {data,error}=await db.from("profiles").select("id,full_name,role").neq("role","admin").order("full_name");
    if(error){toast("Could not load team: "+error.message);return;}
    team=data||[];renderTeam();
  }
  function renderTeam(){
    const counts={};projects.forEach(p=>{if(p.editor_id)counts[p.editor_id]=(counts[p.editor_id]||0)+1;if(p.qa_id)counts[p.qa_id]=(counts[p.qa_id]||0)+1;});
    $("#team-table").innerHTML=team.map(m=>`<tr><td><strong>${safe(m.full_name||"Unnamed team member")}</strong></td><td><select class="inline-select team-role" data-id="${m.id}">${["editor","qa"].map(r=>`<option value="${r}" ${m.role===r?"selected":""}>${r==="qa"?"QA":r[0].toUpperCase()+r.slice(1)}</option>`).join("")}</select></td><td>${counts[m.id]||0}</td><td><span class="status ${m.is_active===false?"cancelled":"delivered"}">${m.is_active===false?"Disabled":"Active"}</span></td><td><button class="btn secondary team-save" data-id="${m.id}" type="button">Save role</button> <button class="btn secondary team-toggle" data-id="${m.id}" data-active="${m.is_active===false?"false":"true"}" type="button">${m.is_active===false?"Enable":"Disable"}</button> <button class="btn secondary team-delete" data-id="${m.id}" type="button">Delete</button></td></tr>`).join("")||'<tr><td colspan="5" class="empty">No team accounts found.</td></tr>';
    $$(".team-save").forEach(btn=>btn.addEventListener("click",async()=>{const select=$(`.team-role[data-id="${btn.dataset.id}"]`);btn.disabled=true;const {error}=await db.from("profiles").update({role:select.value}).eq("id",btn.dataset.id);btn.disabled=false;if(error){toast("Could not update role: "+error.message);return;}toast("Team role updated.");await refresh();}));
    $$(".team-toggle").forEach(btn=>btn.addEventListener("click",async()=>{
      const member=team.find(x=>x.id===btn.dataset.id);if(!member)return;
      const disabling=btn.dataset.active==="true",action=disabling?"disable":"enable";
      if(!window.confirm((disabling?"Disable":"Enable")+" "+(member.full_name||"this team member")+"?"))return;
      btn.disabled=true;
      try{const {data,error}=await db.functions.invoke("manage-team-account",{body:{user_id:member.id,action}});if(error)throw error;if(data?.error)throw new Error(data.error);toast(disabling?"Staff account disabled.":"Staff account enabled.");await refresh();}
      catch(err){toast("Could not "+action+" account: "+(err.message||"Please try again."));console.error("FrameCrest staff account:",err);}
      finally{btn.disabled=false;}
    }));
    $$(".team-delete").forEach(btn=>btn.addEventListener("click",async()=>{
      const member=team.find(x=>x.id===btn.dataset.id);if(!member)return;
      const assigned=counts[member.id]||0;
      const warning='Permanently delete '+(member.full_name||"this team member")+'? This removes their login and profile. '+(assigned?assigned+" assigned project(s) will become unassigned. ":"")+'This cannot be undone.';
      if(!window.confirm(warning))return;
      btn.disabled=true;
      try{const {data,error}=await db.functions.invoke("manage-team-account",{body:{user_id:member.id,action:"delete"}});if(error)throw error;if(data?.error)throw new Error(data.error);toast("Staff account deleted.");await refresh();}
      catch(err){toast("Could not delete account: "+(err.message||"Please try again."));console.error("FrameCrest staff deletion:",err);}
      finally{btn.disabled=false;}
    }));
  }
  function renderProjects(){
    const term=($("#project-search")?.value||"").toLowerCase();
    const clientView=role()==="client";
    const rows=projects.filter(p=>(p.name+" "+p.project_code+" "+p.service+" "+(p.clients?.name||"")).toLowerCase().includes(term));
    const allowedStatuses=isAdmin()?["Awaiting files","In progress","In QA","Revisions","Delivered","Cancelled"]:["In progress","In QA","Revisions"];
    $("#projects-view h2").textContent=clientView?"Your projects":role()==="editor"?"Assigned projects":"Project register";
    $("#projects-view .toolbar p").textContent=clientView?"Follow each project's progress, deadline, instructions and delivery.":role()==="editor"?"Your assigned work, briefs, QA feedback and delivery deadlines.":"Track briefs, production, quality checks and delivery.";
    const headers=clientView?["PROJECT","SERVICE","DUE DATE","PRODUCTION STATUS","QUALITY CHECK","ACTIONS"]:["PROJECT","CLIENT","SERVICE","EDITOR","QA REVIEWER","DUE DATE","STATUS","QA","ACTION"];
    $("#projects-table").closest("table").querySelector("thead").innerHTML="<tr>"+headers.map(h=>"<th>"+h+"</th>").join("")+"</tr>";
    $("#projects-table").innerHTML=rows.map(p=>{
      const project='<td><strong>'+safe(p.project_code||"—")+'</strong><small class="subline">'+safe(p.name)+'</small></td>';
      const status='<td><span class="status '+statusClass(p.status)+'">'+safe(p.status)+'</span></td>';
      const qa='<td><span class="status '+statusClass(p.qa_status)+'">'+safe(p.qa_status||"Not started")+'</span></td>';
      const actions='<td><button class="btn secondary project-details" data-id="'+p.id+'" type="button">View details</button> <button class="btn secondary project-activity" data-id="'+p.id+'" type="button">Updates</button></td>';
      if(clientView)return '<tr>'+project+'<td>'+safe(p.service)+'</td><td>'+date(p.due_date)+'</td>'+status+qa+actions+'</tr>';
      return '<tr>'+project+'<td>'+safe(p.clients?.name||"—")+'</td><td>'+safe(p.service)+'</td><td>'+safe(p.profiles?.full_name||"Unassigned")+'</td><td>'+safe(p.qa_profile?.full_name||"Unassigned")+'</td><td>'+date(p.due_date)+'</td><td>'+(isAdmin()||role()==="editor" ? '<select class="inline-select status-change" data-id="'+p.id+'">'+allowedStatuses.map(x=>'<option '+(x===p.status?'selected':'')+'>'+x+'</option>').join("")+'</select>' : status.slice(4,-5))+'</td><td>'+(isAdmin()||role()==="qa"?'<select class="inline-select qa-change" data-id="'+p.id+'">'+["Not started","Pending review","Passed","Changes required"].map(x=>'<option '+(x===p.qa_status?'selected':'')+'>'+x+'</option>').join("")+'</select>':qa.slice(4,-5))+'</td><td>'+(isAdmin()?'<button class="btn secondary project-edit" data-id="'+p.id+'" type="button">Edit</button> ':'')+'<button class="btn secondary project-details" data-id="'+p.id+'" type="button">Details</button> <button class="btn secondary project-activity" data-id="'+p.id+'" type="button">Activity</button></td></tr>';
    }).join("")||'<tr><td colspan="'+(clientView?6:9)+'" class="empty">No matching projects.</td></tr>';
    $$(".status-change").forEach(el=>el.addEventListener("change",async()=>{const {error}=await db.from("projects").update({status:el.value}).eq("id",el.dataset.id);if(error)toast(error.message);else{toast("Project status updated.");await refresh();}}));
    $$(".qa-change").forEach(el=>el.addEventListener("change",async()=>{const {error}=await db.from("projects").update({qa_status:el.value}).eq("id",el.dataset.id);if(error)toast(error.message);else{toast("QA status updated.");await refresh();}}));
    $$(".project-details").forEach(btn=>btn.addEventListener("click",()=>openProjectDetails(btn.dataset.id)));
    $$(".project-activity").forEach(btn=>btn.addEventListener("click",()=>openProjectActivity(btn.dataset.id)));
    $$(".project-edit").forEach(btn=>btn.addEventListener("click",()=>{
      const p=projects.find(x=>x.id===btn.dataset.id);if(!p)return;
      const form=$("#project-form");form.dataset.editId=p.id;
      ["name","client_id","service","quantity","due_date","editor_id","qa_id","brief","folder_url"].forEach(k=>{form.elements[k].value=p[k]??"";});
      $("#project-modal h2").textContent="Edit project";
      $("#project-modal .eyebrow").textContent="PROJECT DETAILS";
      form.querySelector('button[type="submit"]').textContent="Save changes";
      $("#project-message").textContent="";$("#project-modal").classList.remove("hidden");
    }));
  }
  function openProjectDetails(projectId){
    const p=projects.find(x=>x.id===projectId);if(!p)return;
    $("#details-title").textContent=p.name;
    $("#details-code").textContent=p.project_code||"Project";
    $("#details-client").textContent=p.clients?.name||"—";
    $("#details-service").textContent=p.service||"—";
    $("#details-due").textContent=date(p.due_date);
    $("#details-status").textContent=p.status||"—";
    $("#details-qa").textContent=p.qa_status||"Not started";
    $("#details-editor").textContent=p.profiles?.full_name||"Not assigned";
    $("#details-qa-reviewer").textContent=p.qa_profile?.full_name||"Not assigned";
    $("#details-editor").parentElement.classList.toggle("hidden",role()==="client");
    $("#details-qa-reviewer").parentElement.classList.toggle("hidden",role()==="client");
    $("#details-brief").textContent=p.brief||"No additional instructions provided.";
    const url=String(p.folder_url||"").trim();
    $("#details-file-wrap").innerHTML=url&&/^https?:\/\//i.test(url)
      ?'<a class="btn primary" href="'+safe(url)+'" target="_blank" rel="noopener noreferrer">Open project files / delivery folder ↗</a>'
      :'<p class="muted">No project folder or delivery link has been added yet.</p>';
    $("#details-activity-open").dataset.id=p.id;
    $("#details-revision-open").dataset.id=p.id;
    $("#details-revision-open").classList.toggle("hidden",role()!=="client"||p.status==="Delivered"||p.status==="Cancelled");
    $("#details-message-open").dataset.id=p.id;
    $("#details-message-open").classList.toggle("hidden",role()==="editor");
    $("#project-details-modal").classList.remove("hidden");
  }
  $("#details-revision-open").addEventListener("click",()=>{
    const p=projects.find(x=>x.id===$("#details-revision-open").dataset.id);if(!p)return;
    $("#project-details-modal").classList.add("hidden");
    const form=$("#revision-form");form.reset();form.project_id.value=p.id;
    $("#revision-project-label").textContent=p.project_code+" · "+p.name;
    $("#revision-message").textContent="";$("#revision-modal").classList.remove("hidden");
  });
  $("#revision-form").addEventListener("submit",async e=>{
    e.preventDefault();const form=e.currentTarget,submit=form.querySelector('button[type="submit"]');if(submit.disabled)return;
    const project=projects.find(p=>p.id===form.project_id.value);if(!project||role()!=="client")return;
    const message=String(form.message.value||"").trim();if(!message){$("#revision-message").textContent="Please describe the change you need.";return;}
    submit.disabled=true;submit.textContent="Submitting…";$("#revision-message").textContent="Sending your request…";
    try{const {error}=await db.from("project_feedback").insert({project_id:project.id,client_id:profile.client_id,message});if(error)throw error;$("#revision-modal").classList.add("hidden");toast("Your change request has been sent.");}
    catch(err){$("#revision-message").textContent="Could not submit request: "+(err.message||"Please try again.");}
    finally{submit.disabled=false;submit.textContent="Submit request";}
  });
  $("#details-message-open").addEventListener("click",()=>{const id=$("#details-message-open").dataset.id;$("#project-details-modal").classList.add("hidden");openProjectMessages(id);});
  async function openProjectMessages(projectId){
    const p=projects.find(x=>x.id===projectId);if(!p)return;
    $("#messages-title").textContent=p.project_code+" · "+p.name;
    $("#message-form").reset();$("#message-form").elements.project_id.value=projectId;
    $("#message-feedback").textContent="";$("#messages-list").innerHTML='<p class="muted">Loading conversation…</p>';$("#messages-modal").classList.remove("hidden");
    await loadProjectMessages(projectId);
  }
  async function loadProjectMessages(projectId){
    const {data,error}=await db.from("project_messages").select("id,message,sender_id,created_at,profiles(full_name,role)").eq("project_id",projectId).order("created_at",{ascending:true});
    if(error){$("#messages-list").innerHTML='<p class="message">Could not load messages: '+safe(error.message)+'</p>';return;}
    $("#messages-list").innerHTML=(data||[]).map(m=>{const own=m.sender_id===user.id;const who=own?"You":m.profiles?.full_name||(m.profiles?.role==="client"?"Client":"FrameCrest team");return '<article class="activity-entry"><div><strong>'+safe(who)+'</strong><p style="white-space:pre-wrap">'+safe(m.message)+'</p><p>'+new Date(m.created_at).toLocaleString("en-US",{dateStyle:"medium",timeStyle:"short"})+'</p></div></article>';}).join("")||'<p class="empty">No messages yet. Start the conversation below.</p>';
    $("#messages-list").scrollTop=$("#messages-list").scrollHeight;
  }
  $("#message-form").addEventListener("submit",async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button[type="submit"]');if(b.disabled)return;const projectId=f.elements.project_id.value,message=String(f.elements.message.value||"").trim();if(!message)return;b.disabled=true;b.textContent="Sending…";
    try{const {error}=await db.from("project_messages").insert({project_id:projectId,sender_id:user.id,message});if(error)throw error;f.elements.message.value="";$("#message-feedback").textContent="Message sent.";await loadProjectMessages(projectId);}
    catch(err){$("#message-feedback").textContent="Could not send message: "+(err.message||"Please try again.");}finally{b.disabled=false;b.textContent="Send message";}
  });
  $("#details-activity-open").addEventListener("click",()=>{
    const id=$("#details-activity-open").dataset.id;
    $("#project-details-modal").classList.add("hidden");openProjectActivity(id);
  });
  async function openProjectActivity(projectId){
    const project=projects.find(p=>p.id===projectId);if(!project)return;
    $("#activity-title").textContent=project.project_code+" · "+project.name;
    $("#activity-summary").textContent=project.clients?.name||"Project history";
    $("#activity-list").innerHTML='<p class="muted">Loading activity…</p>';
    $("#activity-modal").classList.remove("hidden");
    const {data,error}=await db.from("project_activity").select("id,actor_name,activity_type,message,created_at").eq("project_id",projectId).order("created_at",{ascending:false});
    if(error){
      $("#activity-list").innerHTML='<p class="message">Could not load project history. Please make sure the project activity database setup has been run in Supabase.</p>';
      console.error("FrameCrest project activity:",error);return;
    }
    let entries=(data||[]).map(x=>({...x,entry_kind:"activity"}));
    if(isAdmin()||role()==="client"){
      const {data:feedback,error:feedbackError}=await db.from("project_feedback").select("id,message,status,created_at").eq("project_id",projectId).order("created_at",{ascending:false});
      if(feedbackError){console.error("FrameCrest project feedback:",feedbackError);}
      else entries=entries.concat((feedback||[]).map(x=>({...x,entry_kind:"feedback",activity_type:"revision_requested",actor_name:role()==="client"?"You":"Client",message:"Client request: "+x.message+" · "+x.status})));
    }
    entries.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    const revisions=entries.filter(x=>x.entry_kind==="feedback").length+entries.filter(x=>x.activity_type==="revision_requested"&&x.entry_kind!=="feedback").length;
    $("#activity-summary").textContent=(project.clients?.name||"Project")+" · "+revisions+" revision request"+(revisions===1?"":"s");
    $("#activity-list").innerHTML=entries.map(x=>'<article class="activity-entry"><span class="activity-dot '+safe(x.activity_type)+'"></span><div><strong>'+safe(x.message)+'</strong><p>'+(x.entry_kind==="feedback"?(role()==="client"?"Submitted by you":"Submitted by client"):role()==="client"?"Project update":safe(x.actor_name||"Team member"))+' · '+new Date(x.created_at).toLocaleString("en-US",{dateStyle:"medium",timeStyle:"short"})+'</p></div></article>').join("")||'<p class="empty">No activity recorded yet.</p>';
  }
  function renderFinance(){
    const clientView=role()==="client";
    $("#finance-subtitle").textContent=clientView?"View quotes, payments and balances for your projects.":"Track quotes, payments and outstanding balances.";
    const rows=projects.map(p=>{const f=finances.find(x=>x.project_id===p.id)||{quote_usd:0,paid_usd:0};return {p,f,balance:Number(f.quote_usd||0)-Number(f.paid_usd||0)};});
    $("#finance-table").innerHTML=rows.map(({p,f,balance})=>'<tr><td><strong>'+safe(p.project_code)+'</strong><small class="subline">'+safe(p.name)+'</small></td>'+(clientView?'':'<td>'+safe(p.clients?.name||"—")+'</td>')+'<td>'+money(f.quote_usd)+'</td><td>'+money(f.paid_usd)+'</td><td><strong>'+money(balance)+'</strong></td><td>'+(clientView?'<button class="btn secondary payment-history" data-id="'+p.id+'" type="button">Payment history</button>':'<button class="btn secondary finance-edit" data-id="'+p.id+'" type="button">Quote</button> <button class="btn secondary payment-add" data-id="'+p.id+'" type="button">Add payment</button> <button class="btn secondary payment-history" data-id="'+p.id+'" type="button">History</button>')+'</td></tr>').join("")||'<tr><td colspan="6" class="empty">No projects to show.</td></tr>';
    const heads=clientView?["PROJECT","QUOTE (USD)","PAID (USD)","OUTSTANDING","PAYMENTS"]:["PROJECT","CLIENT","QUOTE (USD)","PAID (USD)","OUTSTANDING","ACTION"];
    $("#finance-table").closest("table").querySelector("thead").innerHTML="<tr>"+heads.map(x=>"<th>"+x+"</th>").join("")+"</tr>";
    $$(".finance-edit").forEach(btn=>btn.addEventListener("click",()=>{
      const f=finances.find(x=>x.project_id===btn.dataset.id)||{quote_usd:0};
      const form=$("#finance-form");form.project_id.value=btn.dataset.id;form.quote_usd.value=f.quote_usd||0;
      $("#finance-modal").classList.remove("hidden");
    }));
    $$(".payment-add").forEach(btn=>btn.addEventListener("click",()=>{
      const p=projects.find(x=>x.id===btn.dataset.id);if(!p)return;
      const form=$("#payment-form");form.reset();form.project_id.value=p.id;
      form.payment_date.value=new Date().toISOString().slice(0,10);
      $("#payment-title").textContent="Add payment · "+p.project_code;
      $("#payment-message").textContent="";$("#payment-modal").classList.remove("hidden");
    }));
    $$(".payment-history").forEach(btn=>btn.addEventListener("click",()=>openPaymentHistory(btn.dataset.id)));
  }
  async function openPaymentHistory(projectId){
    const p=projects.find(x=>x.id===projectId);if(!p)return;
    $("#payments-history-title").textContent=p.project_code+" · "+p.name;
    $("#payments-history-summary").textContent=p.clients?.name||"Payment records";
    $("#payments-history-list").innerHTML='<p class="muted">Loading payments…</p>';
    $("#payments-history-modal").classList.remove("hidden");
    const {data,error}=await db.from("project_payments").select("id,amount_usd,payment_date,payment_method,reference,notes,created_at").eq("project_id",projectId).order("payment_date",{ascending:false}).order("created_at",{ascending:false});
    if(error){
      $("#payments-history-list").innerHTML='<p class="message">Could not load payments. Please make sure the payment history database setup has been run in Supabase.</p>';
      console.error("FrameCrest payment history:",error);return;
    }
    const rows=data||[],total=rows.reduce((sum,x)=>sum+Number(x.amount_usd||0),0);
    $("#payments-history-summary").textContent=rows.length+" payment record"+(rows.length===1?"":"s")+" · "+money(total)+" received";
    $("#payments-history-list").innerHTML=rows.map(x=>'<article class="activity-entry"><span class="activity-dot project_created"></span><div><strong>'+money(x.amount_usd)+' · '+safe(x.payment_method)+'</strong><p>'+date(x.payment_date)+' · '+safe(x.reference||"No reference")+(x.notes?" · "+safe(x.notes):"")+'</p></div></article>').join("")||'<p class="empty">No payments recorded yet.</p>';
  }
    async function refreshProjectRequests(){
    const selection=isAdmin()?"id,client_id,project_name,service,quantity,property_address,preferred_due_date,brief,status,created_at,clients(name)":"id,client_id,project_name,service,quantity,property_address,preferred_due_date,brief,status,created_at";
    const {data,error}=await db.from("project_requests").select(selection).order("created_at",{ascending:false});
    if(error){console.error("FrameCrest project requests:",error);toast("Could not load project requests: "+error.message);return;}
    projectRequests=data||[];renderProjectRequests();
  }
  function renderProjectRequests(){
    if(role()==="client"){
      $("#client-requests-table").innerHTML=projectRequests.map(r=>'<tr><td><strong>'+safe(r.project_name)+'</strong></td><td>'+safe(r.service)+'</td><td>'+r.quantity+'</td><td>'+date(String(r.created_at).slice(0,10))+'</td><td><span class="status '+statusClass(r.status)+'">'+safe(r.status)+'</span></td></tr>').join("")||'<tr><td colspan="5" class="empty">You have not submitted any requests yet.</td></tr>';
    }
    if(isAdmin()){
      $("#requests-table").innerHTML=projectRequests.map(r=>'<tr><td>'+safe(r.clients?.name||"Client")+'</td><td><strong>'+safe(r.project_name)+'</strong><small class="subline">'+safe(r.property_address||"No property address")+'</small></td><td>'+safe(r.service)+'</td><td>'+r.quantity+'</td><td>'+date(r.preferred_due_date)+'</td><td><button class="btn secondary request-details" data-id="'+r.id+'" type="button">View brief</button></td><td><select class="inline-select request-status" data-id="'+r.id+'">'+["Submitted","Under review","Approved","Declined"].map(x=>'<option '+(x===r.status?'selected':'')+'>'+x+'</option>').join("")+'</select></td><td>'+(r.status==="Approved"?'<span class="muted">Project created</span>':r.status==="Declined"?'—':'<button class="btn primary request-create" data-id="'+r.id+'" type="button">Review & create</button>')+'</td></tr>').join("")||'<tr><td colspan="8" class="empty">No project requests received yet.</td></tr>';
      $$(".request-status").forEach(el=>el.addEventListener("change",async()=>{const {error}=await db.from("project_requests").update({status:el.value,reviewed_at:new Date().toISOString()}).eq("id",el.dataset.id);if(error){toast("Could not update request: "+error.message);return;}toast("Request status updated.");await refreshProjectRequests();}));
      $$(".request-details").forEach(btn=>btn.addEventListener("click",()=>{const r=projectRequests.find(x=>x.id===btn.dataset.id);if(!r)return;window.alert("Project: "+r.project_name+"\nClient: "+(r.clients?.name||"")+"\nService: "+r.service+"\nQuantity: "+r.quantity+"\nProperty: "+(r.property_address||"Not supplied")+"\nPreferred deadline: "+(r.preferred_due_date||"Not supplied")+"\n\nBrief:\n"+(r.brief||"No additional instructions."));}));
      $$(".request-create").forEach(btn=>btn.addEventListener("click",()=>{
        const r=projectRequests.find(x=>x.id===btn.dataset.id);if(!r)return;
        const form=$("#project-form");resetProjectForm();form.dataset.requestId=r.id;
        form.elements.name.value=r.project_name;form.elements.client_id.value=r.client_id;
        form.elements.service.value=r.service;form.elements.quantity.value=r.quantity;
        form.elements.due_date.value=r.preferred_due_date||"";
        form.elements.brief.value=(r.property_address?"Property: "+r.property_address+"\n\n":"")+(r.brief||"");
        $("#project-modal h2").textContent="Approve & create project";
        $("#project-modal .eyebrow").textContent="CLIENT REQUEST REVIEW";
        form.querySelector('button[type="submit"]').textContent="Approve & create project";
        $("#project-modal").classList.remove("hidden");
      }));
    }
  }
  $("#client-request-form").addEventListener("submit",async e=>{
    e.preventDefault();if(role()!=="client"||!profile.client_id){$("#client-request-message").textContent="Your account is not linked to a client record. Please contact FrameCrest.";return;}
    const form=e.currentTarget,submit=form.querySelector('button[type="submit"]'),raw=Object.fromEntries(new FormData(form).entries());
    const payload={client_id:profile.client_id,project_name:String(raw.project_name||"").trim(),service:raw.service,quantity:Number(raw.quantity),preferred_due_date:raw.preferred_due_date||null,property_address:String(raw.property_address||"").trim()||null,brief:String(raw.brief||"").trim()||null};
    submit.disabled=true;submit.textContent="Submitting…";$("#client-request-message").textContent="Sending your request…";
    const {error}=await db.from("project_requests").insert(payload);
    if(error){$("#client-request-message").textContent="Could not submit request: "+error.message;}
    else{form.reset();form.elements.quantity.value=1;$("#client-request-message").textContent="Your request has been sent to FrameCrest for review.";toast("Project request submitted.");await refreshProjectRequests();}
    submit.disabled=false;submit.textContent="Submit project request";
  });
  function renderClients(){
    $("#clients-table").innerHTML=clients.map(c=>'<tr><td><strong>'+safe(c.name)+'</strong></td><td>'+safe(c.contact_name||"—")+'</td><td>'+safe(c.email||"—")+'</td><td>'+safe(c.location||"—")+'</td><td>'+projects.filter(p=>p.client_id===c.id).length+'</td><td><button class="btn secondary client-edit" data-id="'+c.id+'" type="button">Edit</button> <button class="btn secondary client-delete" data-id="'+c.id+'" type="button">Delete</button></td></tr>').join("")||'<tr><td colspan="6" class="empty">No clients added yet.</td></tr>';
    $$(".client-edit").forEach(btn=>btn.addEventListener("click",()=>{
      const c=clients.find(x=>x.id===btn.dataset.id);if(!c)return;
      const f=$("#client-form");f.dataset.editId=c.id;
      ["name","contact_name","email","phone","location","website"].forEach(k=>f.elements[k].value=c[k]||"");
      $("#client-modal h2").textContent="Edit client";f.querySelector('button[type="submit"]').textContent="Save changes";
      $("#client-message").textContent="";$("#client-modal").classList.remove("hidden");
    }));
    $$(".client-delete").forEach(btn=>btn.addEventListener("click",async()=>{
      const client=clients.find(c=>c.id===btn.dataset.id);
      if(!client) return;
      if(!window.confirm('Delete "'+client.name+'"? This cannot be undone.')) return;
      btn.disabled=true;
      try{
        const {count,error:countError}=await db.from("projects").select("id",{count:"exact",head:true}).eq("client_id",client.id);
        if(countError) throw countError;
        if((count||0)>0){toast("This client has existing projects. Reassign or remove those projects before deleting the client.");btn.disabled=false;return;}
        const {error}=await db.from("clients").delete().eq("id",client.id);
        if(error) throw error;
        clients=clients.filter(c=>c.id!==client.id);
        renderClients();fillSelects();toast("Client deleted.");
      }catch(error){
        toast("Could not delete client: "+(error.message||"Please try again."));
        console.error("FrameCrest client delete:",error);
        btn.disabled=false;
      }
    }));
  }
  function fillSelects(){
    $("#project-client").innerHTML='<option value="">Select a client</option>'+clients.map(c=>'<option value="'+c.id+'">'+safe(c.name)+'</option>').join("");
    $("#project-editor").innerHTML='<option value="">Unassigned</option>'+editors.map(e=>'<option value="'+e.id+'">'+safe(e.full_name||"Unnamed editor")+'</option>').join("");
    $("#project-qa").innerHTML='<option value="">Unassigned</option>'+qaReviewers.map(e=>'<option value="'+e.id+'">'+safe(e.full_name||"Unnamed QA reviewer")+'</option>').join("");
  }
  function setView(view){
    $$(".view").forEach(el=>el.classList.add("hidden")); $("#"+view+"-view").classList.remove("hidden");
    $(".nav-item").forEach(el=>el.classList.toggle("active",el.dataset.view===view));
    $("#page-title").textContent=view==="team"?"Team directory":view.charAt(0).toUpperCase()+view.slice(1);
  }
  $$(".nav-item").forEach(b=>b.addEventListener("click",()=>{setView(b.dataset.view);if(b.dataset.view==="finance")renderFinance();}));
  $$("[data-goto]").forEach(b=>b.addEventListener("click",()=>setView(b.dataset.goto)));
  $("#project-search").addEventListener("input",renderProjects);
  function resetProjectForm(){
    const form=$("#project-form");form.reset();delete form.dataset.editId;delete form.dataset.requestId;
    $("#project-modal h2").textContent="Create a project";
    $("#project-modal .eyebrow").textContent="PROJECT INTAKE";
    form.querySelector('button[type="submit"]').textContent="Create project";
    $("#project-message").textContent="";
  }
  $("#new-project-open").addEventListener("click",()=>{resetProjectForm();$("#project-modal").classList.remove("hidden");});
  function resetClientForm(){
    const form=$("#client-form");
    form.reset();delete form.dataset.editId;
    $("#client-modal h2").textContent="Add a client";
    form.querySelector('button[type="submit"]').textContent="Save client";
    $("#client-message").textContent="";
  }
  $("#new-client-open").addEventListener("click",()=>{resetClientForm();$("#client-modal").classList.remove("hidden");});
  $("#new-team-open").addEventListener("click",()=>{$("#team-invite-form").reset();$("#team-invite-message").textContent="";$("#team-invite-modal").classList.remove("hidden");});
  $("#team-invite-form").addEventListener("submit",async e=>{
    e.preventDefault();
    if(!isAdmin())return;
    const form=e.currentTarget,submit=form.querySelector('button[type="submit"]');
    const payload={full_name:form.full_name.value.trim(),email:form.email.value.trim(),role:form.role.value};
    submit.disabled=true;submit.textContent="Sending invitation…";
    $("#team-invite-message").textContent="Creating a separate staff account…";
    try{
      const {data,error}=await db.functions.invoke("invite-team-member",{body:payload});
      if(error)throw error;
      if(data?.error)throw new Error(data.error);
      $("#team-invite-message").textContent="Invitation sent to "+payload.email+".";
      toast("Team invitation sent.");
      form.reset();await refresh();
      setTimeout(()=>$("#team-invite-modal").classList.add("hidden"),1200);
    }catch(err){
      $("#team-invite-message").textContent=err.message||"Could not send the invitation.";
      console.error("FrameCrest team invitation:",err);
    }finally{submit.disabled=false;submit.textContent="Send invitation";}
  });

  $$("[data-close]").forEach(b=>b.addEventListener("click",()=>{
    if(b.dataset.close==="client-modal") resetClientForm();
    if(b.dataset.close==="project-modal") resetProjectForm();
    $("#"+b.dataset.close).classList.add("hidden");
  }));
  $("#client-form").addEventListener("submit",async e=>{
    e.preventDefault();const form=e.currentTarget,submit=form.querySelector('button[type="submit"]');if(submit.disabled)return;
    const raw=Object.fromEntries(new FormData(form).entries()),obj={name:String(raw.name||"").trim()};
    ["contact_name","email","phone","location","website"].forEach(k=>{const v=String(raw[k]||"").trim();if(v)obj[k]=v;});
    if(!obj.name){$("#client-message").textContent="Please enter a client or company name.";return;}
    const editId=form.dataset.editId;submit.disabled=true;submit.textContent="Saving…";$("#client-message").textContent=editId?"Updating client…":"Saving client…";
    try{
      const result=editId?await db.from("clients").update(obj).eq("id",editId).select("*").single():await db.from("clients").insert(obj).select("*").single();
      if(result.error)throw result.error;
      clients=clients.filter(c=>c.id!==result.data.id).concat(result.data).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
      renderClients();fillSelects();form.reset();delete form.dataset.editId;$("#client-modal h2").textContent="Add a client";$("#client-modal").classList.add("hidden");toast(editId?"Client updated.":"Client saved.");
    }catch(err){$("#client-message").textContent="Could not save client: "+(err.message||"Please try again.");}
    finally{submit.disabled=false;submit.textContent=form.dataset.editId?"Save changes":"Save client";}
  });
  $("#project-form").addEventListener("submit",async e=>{
    e.preventDefault();const form=e.currentTarget,submit=form.querySelector('button[type="submit"]');
    if(submit.disabled)return;
    const f=Object.fromEntries(new FormData(form).entries());
    const quote=Number(f.quote_usd);if(!Number.isFinite(quote)||quote<=0){$("#project-message").textContent="Enter an agreed project quote greater than zero.";return;}
    const obj={name:String(f.name||"").trim(),client_id:f.client_id,service:f.service,quantity:Number(f.quantity),due_date:f.due_date||null,editor_id:f.editor_id||null,qa_id:f.qa_id||null,brief:String(f.brief||"").trim()||null,folder_url:String(f.folder_url||"").trim()||null};
    const editId=form.dataset.editId,requestId=form.dataset.requestId;submit.disabled=true;submit.textContent="Saving…";
    $("#project-message").textContent=editId?"Updating project…":requestId?"Approving request and creating project…":"Creating project…";
    try{
      const result=editId
        ?await db.from("projects").update(obj).eq("id",editId).select("id").single()
        :await db.from("projects").insert({...obj,status:"Awaiting files",qa_status:"Not started"}).select("id").single();
      if(result.error)throw result.error;
      const projectId=result.data.id;
      const {error:financeError}=await db.from("project_financials").upsert({project_id:projectId,quote_usd:quote,updated_at:new Date().toISOString()},{onConflict:"project_id"});
      if(financeError)throw financeError;
      if(requestId){const {error:requestError}=await db.from("project_requests").update({status:"Approved",reviewed_at:new Date().toISOString()}).eq("id",requestId);if(requestError)throw requestError;}
      resetProjectForm();$("#project-modal").classList.add("hidden");
      toast(editId?"Project details updated.":requestId?"Request approved and project created.":"Project created.");await refresh();
    }catch(err){$("#project-message").textContent="Could not save project: "+(err.message||"Please try again.");}
    finally{submit.disabled=false;submit.textContent=form.dataset.editId?"Save changes":"Create project";}
  });

    $("#finance-form").addEventListener("submit",async e=>{
    e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget).entries());
    const quote=Number(f.quote_usd);
    const {error}=await db.from("project_financials").upsert({project_id:f.project_id,quote_usd:quote,updated_at:new Date().toISOString()},{onConflict:"project_id"});
    if(error){$("#finance-message").textContent=error.message;return;}
    $("#finance-modal").classList.add("hidden");toast("Project quote saved.");await refresh();
  });
  $("#payment-form").addEventListener("submit",async e=>{
    e.preventDefault();const form=e.currentTarget,submit=form.querySelector('button[type="submit"]');
    if(submit.disabled)return;
    const f=Object.fromEntries(new FormData(form).entries()),amount=Number(f.amount_usd);
    if(!Number.isFinite(amount)||amount<=0){$("#payment-message").textContent="Enter a payment amount greater than zero.";return;}
    submit.disabled=true;submit.textContent="Saving…";$("#payment-message").textContent="Recording payment…";
    try{
      const {error}=await db.from("project_payments").insert({project_id:f.project_id,amount_usd:amount,payment_date:f.payment_date,payment_method:f.payment_method,reference:String(f.reference||"").trim()||null,notes:String(f.notes||"").trim()||null,created_by:user.id});
      if(error)throw error;
      const projectId=f.project_id;$("#payment-modal").classList.add("hidden");
      toast("Payment recorded.");await refresh();await openPaymentHistory(projectId);
    }catch(err){$("#payment-message").textContent="Could not record payment: "+(err.message||"Please try again.");}
    finally{submit.disabled=false;submit.textContent="Save payment";}
  });
  boot();
})();