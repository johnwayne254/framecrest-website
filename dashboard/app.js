(() => {
  const cfg = window.FRAMECREST_CONFIG || {};
  const configured = cfg.supabaseUrl && cfg.supabaseAnonKey && !cfg.supabaseUrl.includes("YOUR_") && !cfg.supabaseAnonKey.includes("YOUR_");
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  let db, user, profile, projects = [], clients = [], editors = [], qaReviewers = [], finances = [], team = [], projectRequests = [], inboxRows = [], paymentRecords = [], invoiceRecords = [], qualityReviews = [];
  const money = n => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2}).format(Number(n||0));
  const safe = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const date = v => v ? new Date(v+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : "—";
  const toast = msg => { const el=$("#toast"); el.textContent=msg; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),3200); };
  let notificationChannel=null, notificationTimer=null, notificationTarget=null, notificationAudioContext=null;
  const soundPreferenceKey="framecrest_notification_sound";
  function playNotificationSound(){
    if(!$("#notification-sound")?.checked)return;
    try{
      const ctx=notificationAudioContext;if(!ctx||ctx.state!=="running")return;
      const osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.type="sine";osc.frequency.setValueAtTime(740,ctx.currentTime);
      osc.frequency.setValueAtTime(980,ctx.currentTime+0.12);
      gain.gain.setValueAtTime(0.0001,ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12,ctx.currentTime+0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+0.32);
      osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+0.34);
    }catch(e){console.warn("Notification sound unavailable",e);}
  }
  function showNotification(title,message,projectId=null,isMessage=false){
    $("#notification-title").textContent=title;
    $("#notification-message").textContent=message;
    notificationTarget=projectId?{projectId,isMessage}:null;
    const popup=$("#notification-popup");popup.classList.add("show");
    clearTimeout(notificationTimer);notificationTimer=setTimeout(()=>popup.classList.remove("show"),7500);
    playNotificationSound();
  }
  $("#notification-sound").checked=localStorage.getItem(soundPreferenceKey)==="on";
  $("#notification-sound").addEventListener("change",e=>{localStorage.setItem(soundPreferenceKey,e.target.checked?"on":"off");if(e.target.checked){const AudioContextClass=window.AudioContext||window.webkitAudioContext;if(AudioContextClass){notificationAudioContext=notificationAudioContext||new AudioContextClass();notificationAudioContext.resume();}}});
  document.addEventListener("click",()=>{if($("#notification-sound").checked){const AudioContextClass=window.AudioContext||window.webkitAudioContext;if(AudioContextClass){notificationAudioContext=notificationAudioContext||new AudioContextClass();notificationAudioContext.resume();}}},{once:true});
  $("#notification-dismiss").addEventListener("click",()=>$("#notification-popup").classList.remove("show"));
  $("#notification-popup").addEventListener("click",e=>{
    if(e.target.id==="notification-dismiss"||!notificationTarget)return;
    const target=notificationTarget;$("#notification-popup").classList.remove("show");
    if(target.isMessage)openProjectMessages(target.projectId);else setView("projects");
  });
  async function subscribeToNotifications(){
    if(notificationChannel){await db.removeChannel(notificationChannel);notificationChannel=null;}
    if(role()==="editor")return;
    const projectSnapshot=new Map(projects.map(p=>[p.id,{status:p.status,qa_status:p.qa_status,due_date:p.due_date,name:p.name,project_code:p.project_code}]));
    notificationChannel=db.channel("framecrest-notifications-"+user.id)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"project_messages"},payload=>{
        const msg=payload.new;if(!msg||msg.sender_id===user.id)return;
        const project=projects.find(p=>p.id===msg.project_id);if(!project)return;
        const sender=msg.sender_id===project.client_id?"Client":"Project team";
        showNotification("New project message",sender+" · "+project.name+": "+String(msg.message||"").slice(0,115),project.id,true);
        refreshMessageInbox();
      })
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"projects"},payload=>{
        const next=payload.new;if(!next||!projects.some(p=>p.id===next.id))return;
        const previous=projectSnapshot.get(next.id);
        projectSnapshot.set(next.id,{status:next.status,qa_status:next.qa_status,due_date:next.due_date,name:next.name,project_code:next.project_code});
        if(!previous)return;
        const changes=[];
        if(previous.status!==next.status)changes.push("status: "+(next.status||"updated"));
        if(previous.qa_status!==next.qa_status)changes.push("quality check: "+(next.qa_status||"updated"));
        if(previous.due_date!==next.due_date)changes.push("due date changed");
        if(previous.name!==next.name)changes.push("project details changed");
        if(changes.length)showNotification("Project updated",(next.project_code||"Project")+" · "+(next.name||"")+". "+changes.join(", "),next.id,false);
      })
      .subscribe(status=>{if(status==="CHANNEL_ERROR"||status==="TIMED_OUT")console.warn("FrameCrest live notifications:",status);});
  }
  const adminReportCategories=[
    ["business","Business overview","Revenue trends, project growth and overall studio activity."],
    ["financial","Financial reports","Payments received, invoices, quotes and outstanding balances."],
    ["projects","Project reports","Project volumes, service mix, status and completion trends."],
    ["clients","Client reports","New and repeat clients, account activity and client value."],
    ["team","Team performance","Assignments, workload, completed work and QA activity."],
    ["delivery","Delivery reports","On-time delivery, turnaround times and overdue projects."],
    ["quality","Quality assurance","QA outcomes, approval rates and revision patterns."],
    ["communication","Communication reports","Project messages, client feedback and response activity."],
    ["profitability","Profitability reports","Revenue and direct production costs by project and service."]
  ];
  const clientReportCategories=[
    ["account","Account overview","A summary of your projects and account activity."],
    ["projects","Project reports","Your project history, service mix and progress."],
    ["financial","Financial statements","Your quotes, invoices, payments and balances."],
    ["delivery","Delivery reports","Your completed projects and delivery timelines."],
    ["quality","Quality reports","Quality review outcomes and requested revisions."],
    ["feedback","Feedback reports","Your submitted feedback and change requests."]
  ];
  function reportCategories(){return isAdmin()?adminReportCategories:role()==="client"?clientReportCategories:[];}
  function reportDateRange(){
    const start=$("#report-start-date").value,end=$("#report-end-date").value;
    if(start&&end&&start>end)return {start,end,valid:false,label:"Start date must be before end date"};
    return {start,end,valid:true,label:(start||"Beginning")+" to "+(end||"Today")};
  }
  function renderReportWorkspace(){
    const categories=reportCategories(),select=$("#report-category"),current=select.value;
    select.innerHTML='<option value="">Choose a report</option>'+categories.map(([id,name])=>'<option value="'+id+'">'+safe(name)+'</option>').join("");
    if(categories.some(x=>x[0]===current))select.value=current;
    $("#reports-intro").textContent=isAdmin()?"Business-wide reporting across finance, projects, clients and operations.":"Reports and statements for your FrameCrest account.";
    const selected=categories.find(x=>x[0]===select.value);
    $("#report-category-grid").innerHTML=categories.map(([id,name,description])=>'<button type="button" class="report-category-card '+(id===select.value?"selected":"")+'" data-report-category="'+id+'"><strong>'+safe(name)+'</strong><span>'+safe(description)+'</span><small>Open report →</small></button>').join("");
    $("#report-category-grid").querySelectorAll("[data-report-category]").forEach(button=>button.addEventListener("click",()=>{select.value=button.dataset.reportCategory;renderReportWorkspace();}));
    $("#report-title").textContent=selected?selected[1]:"Select a report category";
    $("#report-period-label").textContent=reportDateRange().label;
    renderReportOutput();
  }
  function renderReportOutput(){
    const id=$("#report-category").value,range=reportDateRange(),host=$("#report-workspace");
    let output=host.querySelector(".report-output");
    if(!output){output=document.createElement("div");output.className="report-output";host.append(output);}
    if(!range.valid){output.innerHTML='<p class="message">Please correct the selected date range.</p>';return;}
    if(!id){output.innerHTML='<div class="report-empty"><span class="report-empty-icon">▥</span><strong>Your reports will appear here</strong><p>Select a report category to view real dashboard data for the chosen period.</p></div>';return;}
    const within=(v)=>{if(!v)return false;const d=String(v).slice(0,10);return (!range.start||d>=range.start)&&(!range.end||d<=range.end);};
    const periodProjects=projects.filter(p=>within(p.created_at));
    const periodPayments=paymentRecords.filter(p=>within(p.payment_date));
    const projectSet=periodProjects;
    const total=(arr,key)=>arr.reduce((sum,x)=>sum+Number(x[key]||0),0);
    const stat=(label,value)=>'<article class="stat-card"><span>'+safe(label)+'</span><strong>'+safe(value)+'</strong></article>';
    const table=(headers,rows)=>'<div class="table-wrap"><table><thead><tr>'+headers.map(x=>'<th>'+safe(x)+'</th>').join("")+'</tr></thead><tbody>'+ (rows.length?rows.map(row=>'<tr>'+row.map(cell=>'<td>'+cell+'</td>').join("")+'</tr>').join(""):'<tr><td class="empty" colspan="'+headers.length+'">No records for this period.</td></tr>')+'</tbody></table></div>';
    const bars=(items)=>{const max=Math.max(1,...items.map(x=>x[1]));return '<div class="finance-chart">'+items.map(([label,value])=>'<div class="finance-bar-row"><span>'+safe(label)+'</span><div class="finance-bar-track"><i style="width:'+Math.max(0,value/max*100)+'%"></i></div><strong>'+safe(value)+'</strong></div>').join("")+'</div>';};
    let html="";
    if(id==="business"||id==="account"){
      const revenue=total(periodPayments,"amount_usd"),quotes=projectSet.reduce((sum,p)=>sum+Number((finances.find(x=>x.project_id===p.id)||{}).quote_usd||0),0);
      html='<div class="stats-grid">'+stat("Projects created",projectSet.length)+stat("Payments received",money(revenue))+stat("Invoices issued",invoiceRecords.filter(x=>within(x.issue_date)).length)+stat("Delivered projects",projectSet.filter(p=>p.status==="Delivered").length)+'</div>'+table(["PERFORMANCE","RESULT"],[["Active projects",projectSet.filter(p=>!["Delivered","Cancelled"].includes(p.status)).length],["Quoted value",money(quotes)],["Payments recorded",periodPayments.length],["Clients with projects",new Set(projectSet.map(p=>p.client_id)).size]]);
    }else if(id==="financial"){
      const quotes=projects.reduce((sum,p)=>sum+Number((finances.find(x=>x.project_id===p.id)||{}).quote_usd||0),0),paid=projects.reduce((sum,p)=>sum+Number((finances.find(x=>x.project_id===p.id)||{}).paid_usd||0),0);
      html='<div class="stats-grid">'+stat("Payments in period",money(total(periodPayments,"amount_usd")))+stat("Payment entries",periodPayments.length)+stat("Outstanding balance",money(Math.max(0,quotes-paid)))+stat("Invoices in period",invoiceRecords.filter(x=>within(x.issue_date)).length)+'</div>'+table(["DATE","PROJECT","METHOD","AMOUNT"],periodPayments.map(x=>[safe(date(x.payment_date)),safe(projects.find(p=>p.id===x.project_id)?.project_code||"—"),safe(x.payment_method||"—"),money(x.amount_usd)]));
    }else if(id==="projects"){
      const counts=["Awaiting files","In progress","In QA","Revisions","Delivered","Cancelled"].map(s=>[s,projectSet.filter(p=>p.status===s).length]);
      html='<div class="stats-grid">'+stat("Projects",projectSet.length)+stat("In progress",projectSet.filter(p=>p.status==="In progress").length)+stat("In QA",projectSet.filter(p=>p.status==="In QA").length)+stat("Delivered",projectSet.filter(p=>p.status==="Delivered").length)+'</div><h4>Projects by status</h4>'+bars(counts)+table(["PROJECT","CLIENT","SERVICE","STATUS","CREATED"],projectSet.map(p=>[safe(p.project_code||p.name),safe(p.clients?.name||"—"),safe(p.service),safe(p.status),safe(date(String(p.created_at||"").slice(0,10)))]));
    }else if(id==="clients"){
      const rows=clients.map(c=>{const ps=projects.filter(p=>p.client_id===c.id&&within(p.created_at));return {c,ps};}).filter(x=>x.ps.length);
      html='<div class="stats-grid">'+stat("Active client accounts",clients.length)+stat("Clients with projects",rows.length)+stat("Projects in period",periodProjects.length)+stat("Repeat clients",rows.filter(x=>x.ps.length>1).length)+'</div>'+table(["CLIENT","PROJECTS","QUOTED VALUE"],rows.map(({c,ps})=>[safe(c.name),ps.length,money(ps.reduce((sum,p)=>sum+Number((finances.find(f=>f.project_id===p.id)||{}).quote_usd||0),0))]));
    }else if(id==="team"){
      const people=[...team,...(qaReviewers.filter(q=>!team.some(t=>t.id===q.id)).map(q=>({...q,role:"qa"})))];
      html='<div class="stats-grid">'+stat("Staff accounts",people.length)+stat("Projects assigned",projectSet.filter(p=>p.editor_id||p.qa_id).length)+stat("Editor assignments",projectSet.filter(p=>p.editor_id).length)+stat("QA assignments",projectSet.filter(p=>p.qa_id).length)+'</div>'+table(["TEAM MEMBER","ROLE","EDITOR ASSIGNMENTS","QA ASSIGNMENTS"],people.map(m=>[safe(m.full_name||"Team member"),safe(m.role||"—"),projectSet.filter(p=>p.editor_id===m.id).length,projectSet.filter(p=>p.qa_id===m.id).length]));
    }else if(id==="delivery"){
      const today=new Date().toISOString().slice(0,10),overdue=projects.filter(p=>p.due_date&&p.due_date<today&&!["Delivered","Cancelled"].includes(p.status));
      html='<div class="stats-grid">'+stat("Projects due in period",projectSet.filter(p=>within(p.due_date)).length)+stat("Delivered",projectSet.filter(p=>p.status==="Delivered").length)+stat("Currently overdue",overdue.length)+stat("Awaiting files",projectSet.filter(p=>p.status==="Awaiting files").length)+'</div>'+table(["PROJECT","DUE DATE","STATUS"],projectSet.filter(p=>within(p.due_date)||p.status==="Delivered").map(p=>[safe(p.project_code||p.name),safe(date(p.due_date)),safe(p.status)]));
    }else if(id==="quality"){
      const qa=["Not started","Pending review","Passed","Changes required"].map(s=>[s,projectSet.filter(p=>p.qa_status===s).length]);
      html='<div class="stats-grid">'+stat("Projects reviewed",projectSet.filter(p=>p.qa_status==="Passed").length+projectSet.filter(p=>p.qa_status==="Changes required").length)+stat("Pending review",projectSet.filter(p=>p.qa_status==="Pending review").length)+stat("Passed",projectSet.filter(p=>p.qa_status==="Passed").length)+stat("Changes required",projectSet.filter(p=>p.qa_status==="Changes required").length)+'</div><h4>QA status breakdown</h4>'+bars(qa);
    }else if(id==="communication"){
      html='<div class="report-empty"><span class="report-empty-icon">✉</span><strong>Communication data is not connected to reports yet</strong><p>Project messaging and client feedback are working. The next reporting update will connect those records here.</p></div>';
    }else if(id==="profitability"){
      const quote=projectSet.reduce((sum,p)=>sum+Number((finances.find(f=>f.project_id===p.id)||{}).quote_usd||0),0),received=projectSet.reduce((sum,p)=>sum+Number((finances.find(f=>f.project_id===p.id)||{}).paid_usd||0),0);
      html='<div class="stats-grid">'+stat("Quoted value",money(quote))+stat("Payments received",money(received))+stat("Projects",projectSet.length)+'</div><div class="report-empty"><strong>Profit cannot be calculated yet</strong><p>Direct production costs and freelancer payments are not currently recorded in the dashboard. These figures show sales and collections, not profit.</p></div>';
    }else if(id==="feedback"){
      html='<div class="report-empty"><strong>Feedback reports are not available in this workspace yet</strong><p>Client feedback summaries will be connected in the next reporting update.</p></div>';
    }
    output.innerHTML=html;
  }
  $("#report-category").addEventListener("change",renderReportWorkspace);
  $("#report-start-date").addEventListener("change",renderReportWorkspace);
  $("#report-end-date").addEventListener("change",renderReportWorkspace);
  $("#report-reset-dates").addEventListener("click",()=>{$("#report-start-date").value="";$("#report-end-date").value="";renderReportWorkspace();});
  function reportExportRows(){
    const output=$("#report-workspace .report-output"),rows=[];
    if(!output||!$("#report-category").value)throw new Error("Choose a report category first.");
    output.querySelectorAll("table").forEach((table,index)=>{
      if(index)rows.push([]);
      table.querySelectorAll("tr").forEach(tr=>rows.push([...tr.querySelectorAll("th,td")].map(cell=>cell.innerText.trim())));
    });
    if(!rows.length){
      output.querySelectorAll(".stat-card").forEach(card=>rows.push([card.querySelector("span")?.innerText||"Metric",card.querySelector("strong")?.innerText||""]));
    }
    if(!rows.length)throw new Error("There is no report data to export for this category.");
    return rows;
  }
  function previousMonthRange(){
    const now=new Date(),first=new Date(now.getFullYear(),now.getMonth()-1,1),last=new Date(now.getFullYear(),now.getMonth(),0);
    const iso=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
    return {from:iso(first),to:iso(last),label:first.toLocaleDateString("en-US",{month:"long",year:"numeric"})};
  }
  async function generateMonthlySummary(){
    if(!isAdmin())return;
    const button=$("#generate-monthly-summary"),range=previousMonthRange();
    button.disabled=true;button.textContent="Generating summary…";
    try{
      const inPeriod=value=>{if(!value)return false;const d=String(value).slice(0,10);return d>=range.from&&d<=range.to;};
      const periodProjects=projects.filter(p=>inPeriod(p.created_at));
      const delivered=projects.filter(p=>p.status==="Delivered"&&inPeriod(p.due_date));
      const periodPayments=paymentRecords.filter(p=>inPeriod(p.payment_date));
      const periodInvoices=invoiceRecords.filter(i=>inPeriod(i.issue_date));
      const activeClients=new Set(periodProjects.map(p=>p.client_id).filter(Boolean)).size;
      const qaPassed=periodProjects.filter(p=>p.qa_status==="Passed").length;
      const changes=periodProjects.filter(p=>p.qa_status==="Changes required"||p.status==="Revisions").length;
      const overdue=projects.filter(p=>p.due_date&&p.due_date>=range.from&&p.due_date<=range.to&&p.status!=="Delivered"&&p.status!=="Cancelled").length;
      const revenue=periodPayments.reduce((sum,p)=>sum+Number(p.amount_usd||0),0);
      const quoted=periodProjects.reduce((sum,p)=>sum+Number((finances.find(f=>f.project_id===p.id)||{}).quote_usd||0),0);
      const rows=[
        ["METRIC","RESULT"],
        ["Reporting month",range.label],
        ["New projects",periodProjects.length],
        ["Projects delivered (due in month)",delivered.length],
        ["Clients with new projects",activeClients],
        ["Payments received (USD)",money(revenue)],
        ["Invoices issued",periodInvoices.length],
        ["Quoted value of new projects (USD)",money(quoted)],
        ["QA passed among new projects",qaPassed],
        ["Projects needing changes among new projects",changes],
        ["Projects overdue at month-end (based on due date)",overdue]
      ];
      const title="Monthly business summary · "+range.label;
      const {error}=await db.from("report_archives").insert({title,category:"business",date_from:range.from,date_to:range.to,report_data:rows,created_by:user.id,client_id:null});
      if(error)throw error;
      $("#report-category").value="business";$("#report-start-date").value=range.from;$("#report-end-date").value=range.to;
      setView("reports");
      renderReportWorkspace();
      const output=$("#report-workspace .report-output");
      output.innerHTML='<div class="report-empty"><strong>Monthly summary saved</strong><p>'+safe(range.label)+' · This is a saved monthly snapshot based on the records currently available in FrameCrest.</p></div><div class="table-wrap"><table><tbody>'+rows.map((row,i)=>'<tr>'+row.map(cell=>i===0?'<th>'+safe(cell)+'</th>':'<td>'+safe(cell)+'</td>').join("")+'</tr>').join("")+'</tbody></table></div>';
      $("#report-title").textContent=title;
      $("#report-period-label").textContent=range.from+" to "+range.to;
      await loadReportArchives();
      toast("Monthly business summary saved.");
    }catch(error){toast("Could not generate summary: "+(error.message||"Please try again."));}
    finally{button.disabled=false;button.textContent="Generate last month's summary";}
  }
  $("#generate-monthly-summary").addEventListener("click",generateMonthlySummary);
  function savedReportTable(rows){
    return '<div class="table-wrap"><table><tbody>'+(rows||[]).map((row,i)=>'<tr>'+row.map(cell=>i===0?'<th>'+safe(cell)+'</th>':'<td>'+safe(cell)+'</td>').join("")+'</tr>').join("")+'</tbody></table></div>';
  }
  function showSavedReport(item){
    setView("reports");
    $("#report-category").value=item.category;
    $("#report-start-date").value=item.date_from||"";
    $("#report-end-date").value=item.date_to||"";
    renderReportWorkspace();
    const rows=Array.isArray(item.report_data)?item.report_data:[];
    const output=$("#report-workspace .report-output");
    output.innerHTML='<div class="report-empty"><strong>Saved report snapshot</strong><p>Saved on '+safe(new Date(item.created_at).toLocaleString("en-US"))+'. This snapshot does not change when live project records are updated.</p></div>'+savedReportTable(rows);
    $("#report-title").textContent=item.title+" · Saved snapshot";
    $("#report-period-label").textContent=(item.date_from||"Beginning")+" to "+(item.date_to||"Today");
    $("#report-workspace").scrollIntoView({behavior:"smooth",block:"start"});
  }
  function exportSavedReport(item,format){
    const rows=Array.isArray(item.report_data)?item.report_data:[];
    if(!rows.length)throw new Error("This saved report has no exportable data.");
    const filename="FrameCrest-"+String(item.title||"saved-report").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
    if(format==="csv"){
      const csv=rows.map(row=>row.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\r\n");
      downloadReport(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"}),filename+".csv");
      toast("Saved report exported as CSV.");return;
    }
    const esc=v=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    if(format==="excel"){
      const excelRows=[["FrameCrest Studios"],[item.title],[(item.date_from||"Beginning")+" to "+(item.date_to||"Today")],[],...rows];
      const xml='<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Report"><Table>'+excelRows.map(row=>"<Row>"+row.map(v=>'<Cell><Data ss:Type="String">'+esc(v)+'</Data></Cell>').join("")+"</Row>").join("")+'</Table></Worksheet></Workbook>';
      downloadReport(new Blob([xml],{type:"application/vnd.ms-excel"}),filename+".xls");
      toast("Saved report exported for Excel.");return;
    }
    if(format==="pdf"){
      const w=window.open("","_blank");
      if(!w)throw new Error("Allow pop-ups for this dashboard to print or save the PDF.");
      const table=savedReportTable(rows);
      w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>'+esc(item.title)+'</title><style>body{font:13px Arial,sans-serif;color:#263746;padding:32px}h1{color:#14283F}p{color:#78858E}table{border-collapse:collapse;width:100%;margin:18px 0}th,td{text-align:left;border:1px solid #ddd;padding:9px;font-size:11px}th{background:#F4F2ED;color:#14283F}@media print{body{padding:0}}</style></head><body><h1>FrameCrest Studios</h1><p>REPORT · '+esc((item.date_from||"Beginning")+" to "+(item.date_to||"Today"))+'</p><h2>'+esc(item.title)+'</h2>'+table+'</body></html>');
      w.document.close();w.focus();w.print();toast("Print window opened. Choose Save as PDF.");return;
    }
    throw new Error("Choose CSV, Excel or PDF.");
  }
  async function loadReportArchives(){
    const body=$("#report-history-list");
    if(!body)return;
    body.innerHTML='<tr><td colspan="5" class="empty">Loading saved reports…</td></tr>';
    const {data,error}=await db.from("report_archives").select("id,title,category,date_from,date_to,report_data,created_at").order("created_at",{ascending:false}).limit(50);
    if(error){body.innerHTML='<tr><td colspan="5" class="empty">Report history is unavailable. Check that report_archives.sql has been run in Supabase.</td></tr>';console.error("FrameCrest report archive:",error);return;}
    body.innerHTML=(data||[]).map(x=>'<tr><td><strong>'+safe(x.title)+'</strong></td><td>'+safe(x.date_from||"Beginning")+' – '+safe(x.date_to||"Today")+'</td><td>'+new Date(x.created_at).toLocaleString("en-US",{dateStyle:"medium",timeStyle:"short"})+'</td><td><button class="btn secondary report-archive-open" data-id="'+safe(x.id)+'" type="button">View</button></td><td><div class="report-archive-export"><select class="inline-select report-archive-format" aria-label="Export format for '+safe(x.title)+'"><option value="csv">CSV</option><option value="excel">Excel</option><option value="pdf">PDF</option></select><button class="btn secondary report-archive-download" data-id="'+safe(x.id)+'" type="button">Download</button></div></td></tr>').join("")||'<tr><td colspan="5" class="empty">No saved reports yet.</td></tr>';
    body.querySelectorAll(".report-archive-open").forEach(button=>button.addEventListener("click",()=>{
      const item=data.find(x=>x.id===button.dataset.id);if(item)showSavedReport(item);
    }));
    body.querySelectorAll(".report-archive-download").forEach(button=>button.addEventListener("click",()=>{
      const item=data.find(x=>x.id===button.dataset.id);if(!item)return;
      const format=button.parentElement.querySelector(".report-archive-format").value;
      try{exportSavedReport(item,format);}catch(e){toast(e.message||"Could not export saved report.");}
    }));
  }
  $("#report-save").addEventListener("click",async()=>{
    const button=$("#report-save");
    try{
      if(!$("#report-category").value)throw new Error("Choose a report category first.");
      const rows=reportExportRows();
      button.disabled=true;button.textContent="Saving…";
      const category=$("#report-category").value,title=$("#report-title").textContent;
      const payload={title,category,date_from:$("#report-start-date").value||null,date_to:$("#report-end-date").value||null,report_data:rows,created_by:user.id,client_id:role()==="client"?profile.client_id:null};
      const {error}=await db.from("report_archives").insert(payload);
      if(error)throw error;
      toast("Report saved to history.");
      await loadReportArchives();
    }catch(e){toast("Could not save report: "+(e.message||"Please try again."));}
    finally{button.disabled=false;button.textContent="Save report";}
  });
  $("#report-history-refresh").addEventListener("click",loadReportArchives);
  function reportFileName(ext){
    const category=$("#report-category").selectedOptions[0]?.textContent||"Report";
    const start=$("#report-start-date").value||"all-time",end=$("#report-end-date").value||"today";
    return "FrameCrest-"+category.toLowerCase().replace(/[^a-z0-9]+/g,"-")+"-"+start+"-to-"+end+"."+ext;
  }
  function downloadReport(blob,name){
    const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);
  }
  $("#report-export-csv").addEventListener("click",()=>{
    try{const csv=reportExportRows().map(row=>row.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\r\n");downloadReport(new Blob(["\\uFEFF"+csv],{type:"text/csv;charset=utf-8"}),reportFileName("csv"));toast("CSV report exported.");}
    catch(e){toast(e.message);}
  });
  $("#report-export-excel").addEventListener("click",()=>{
    try{
      const rows=reportExportRows(),esc=v=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
      const title=$("#report-title").textContent,period=$("#report-period-label").textContent;
      const workbookRows=[["FrameCrest Studios"],[title],[period],[],...rows];
      const xml='<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Report"><Table>'+workbookRows.map(row=>"<Row>"+row.map(v=>'<Cell><Data ss:Type="String">'+esc(v)+'</Data></Cell>').join("")+"</Row>").join("")+"</Table></Worksheet></Workbook>";
      downloadReport(new Blob([xml],{type:"application/vnd.ms-excel"}),reportFileName("xls"));toast("Excel-compatible report exported.");
    }catch(e){toast(e.message);}
  });
  $("#report-export-pdf").addEventListener("click",()=>{
    try{
      if(!$("#report-category").value)throw new Error("Choose a report category first.");
      const title=$("#report-title").textContent,period=$("#report-period-label").textContent,content=$("#report-workspace .report-output").innerHTML;
      const w=window.open("","_blank");if(!w)throw new Error("Please allow pop-ups to print or save the report.");
      w.document.write('<!doctype html><html><head><title>'+safe(title)+'</title><style>body{font:13px Arial,sans-serif;color:#263746;padding:32px}h1{color:#14283F}p{color:#78858E}table{border-collapse:collapse;width:100%;margin:18px 0}th,td{text-align:left;border:1px solid #ddd;padding:9px;font-size:11px}th{background:#F4F2ED;color:#14283F}.stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.stat-card{border:1px solid #ddd;padding:12px}.stat-card strong{display:block;font-size:20px;margin-top:8px}.finance-chart{margin:15px 0}.finance-bar-row{display:flex;justify-content:space-between;padding:7px;border-bottom:1px solid #eee}.finance-bar-track{display:none}.report-empty{padding:20px;border:1px solid #ddd}@media print{body{padding:0}}</style></head><body><h1>FrameCrest Studios</h1><p>REPORT · '+safe(period)+'</p><h2>'+safe(title)+'</h2>'+content+'</body></html>');
      w.document.close();w.focus();w.print();toast("Print window opened. Choose Save as PDF.");
    }catch(e){toast(e.message);}
  });
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
    const firstName=(p.full_name||user.email||"").trim().split(" ")[0].split("@")[0]||"there"; const hour=new Date().getHours(); const greeting=hour<12?"Good morning":hour<17?"Good afternoon":"Good evening"; $("#welcome-title").textContent=greeting+", "+firstName+".";
    $("#welcome-subtitle").textContent=p.role==="client"?"A clear view of your projects, progress and anything that needs your attention.":p.role==="editor"?"Your assigned projects, production briefs and delivery deadlines.":"Here is what's happening across your workspace.";
    $("#today-label").textContent=new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"});
    $$(".admin-only").forEach(el=>el.classList.toggle("hidden",!isAdmin()));
    $$(".client-only").forEach(el=>el.classList.toggle("hidden",role()!=="client"));
    const reportsNav=$("#reports-nav");if(reportsNav)reportsNav.classList.toggle("hidden",!["admin","client"].includes(role()));const monthlySummaryButton=$("#generate-monthly-summary");if(monthlySummaryButton)monthlySummaryButton.classList.toggle("hidden",!isAdmin());
    $("#clients-view").classList.toggle("hidden",!isAdmin());
    $("#messages-nav").classList.toggle("hidden",role()==="editor");
    const financeNav=$(' .nav-item[data-view="finance"]'.trim());if(financeNav)financeNav.classList.toggle("hidden",role()!=="admin"&&role()!=="client");$("#finance-view").classList.toggle("hidden",role()!=="admin"&&role()!=="client");
    showApp(); await refresh(); await subscribeToNotifications();
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
    const reviewResult=await db.from("editor_quality_reviews").select("id,project_id,editor_id,reviewer_id,quality_score,feedback,created_at,updated_at").order("created_at",{ascending:false}); qualityReviews=reviewResult.data||[]; if(reviewResult.error)console.warn("Editor quality reviews:",reviewResult.error.message);
    renderProjects(); renderOverview(); renderEditorQualityPanel();
    const ids=projects.map(p=>p.id);
    if(ids.length){
      const [payResult,invoiceResult]=await Promise.all([
        db.from("project_payments").select("id,project_id,amount_usd,payment_date,payment_method,reference,notes,created_at").in("project_id",ids).order("payment_date",{ascending:false}),
        db.from("project_invoices").select("id,invoice_number,project_id,amount_usd,issue_date,due_date,status,notes,created_at").in("project_id",ids).order("issue_date",{ascending:false})
      ]);
      paymentRecords=payResult.data||[];invoiceRecords=invoiceResult.data||[];
      if(payResult.error)console.error("FrameCrest finance report payments:",payResult.error);
      if(invoiceResult.error)console.error("FrameCrest invoices:",invoiceResult.error);
    }else{paymentRecords=[];invoiceRecords=[];}
    renderFinance(); await refreshMessageInbox();
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
    const total=Math.max(1,projects.length);
    const visualCards=[{id:"stat-active",icon:"◷",value:active},{id:"stat-qa",icon:"◇",value:inQA},{id:"stat-delivered",icon:"✓",value:delivered},{id:role()==="client"?"stat-attention":"stat-balance",icon:role()==="client"?"!":"$",value:role()==="client"?attention:finances.reduce((sum,x)=>sum+Number(x.quote_usd||0)-Number(x.paid_usd||0),0)}];
    visualCards.forEach((item,index)=>{
      const valueEl=$("#"+item.id);if(!valueEl)return;
      const card=valueEl.closest(".stat-card");if(!card)return;
      card.classList.add("overview-stat");
      let icon=card.querySelector(".overview-stat-icon");
      if(!icon){icon=document.createElement("span");icon.className="overview-stat-icon";card.insertBefore(icon,valueEl);}
      icon.textContent=item.icon;
      let meter=card.querySelector(".overview-meter");
      if(!meter){meter=document.createElement("div");meter.className="overview-meter";meter.innerHTML="<i></i>";card.append(meter);}
      const ratio=index===3&&role()!=="client"?Math.min(100,Math.max(0,finances.reduce((sum,x)=>sum+Number(x.quote_usd||0),0)>0?item.value/finances.reduce((sum,x)=>sum+Number(x.quote_usd||0),0)*100:0)):Math.min(100,item.value/total*100);
      meter.querySelector("i").style.width=ratio+"%";
    });
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
    $("#team-table").innerHTML=team.map(m=>`<tr><td><button class="team-name-link" data-history-id="${m.id}" type="button">${safe(m.full_name||"Unnamed team member")}</button></td><td><select class="inline-select team-role" data-id="${m.id}">${["editor","qa"].map(r=>`<option value="${r}" ${m.role===r?"selected":""}>${r==="qa"?"QA":"Editor"}</option>`).join("")}</select></td><td><button class="text-button team-current-work" data-id="${m.id}" type="button">${counts[m.id]||0} · View projects</button></td><td><span class="status ${m.is_active===false?"cancelled":"delivered"}">${m.is_active===false?"Disabled":"Active"}</span></td><td><button class="btn secondary team-edit" data-id="${m.id}" type="button">Edit details</button> <button class="btn secondary team-save" data-id="${m.id}" type="button">Save role</button> <button class="btn secondary team-toggle" data-id="${m.id}" data-active="${m.is_active===false?"false":"true"}" type="button">${m.is_active===false?"Enable":"Disable"}</button> <button class="btn secondary team-delete" data-id="${m.id}" type="button">Delete</button></td></tr>`).join("")||'<tr><td colspan="5" class="empty">No team accounts found.</td></tr>';
    $$(".team-name-link").forEach(btn=>btn.addEventListener("click",()=>openTeamHistory(btn.dataset.historyId)));
    $$(".team-current-work").forEach(btn=>btn.addEventListener("click",()=>openTeamHistory(btn.dataset.id,"all","assigned")));
    $$(".team-edit").forEach(btn=>btn.addEventListener("click",()=>{const m=team.find(x=>x.id===btn.dataset.id);if(!m)return;const f=$("#team-edit-form");f.elements.id.value=m.id;f.elements.full_name.value=m.full_name||"";f.elements.role.value=m.role;$("#team-edit-message").textContent="";$("#team-edit-modal").classList.remove("hidden");}));
    $$(".team-save").forEach(btn=>btn.addEventListener("click",async()=>{const select=$(`.team-role[data-id="${btn.dataset.id}"]`);btn.disabled=true;const {error}=await db.from("profiles").update({role:select.value}).eq("id",btn.dataset.id).eq("account_type","staff");btn.disabled=false;if(error){toast("Could not update role: "+error.message);return;}toast("Team role updated.");await refresh();}));
    $$(".team-toggle").forEach(btn=>btn.addEventListener("click",async()=>{const member=team.find(x=>x.id===btn.dataset.id);if(!member)return;const disabling=btn.dataset.active==="true",action=disabling?"disable":"enable";if(!window.confirm((disabling?"Disable":"Enable")+" "+(member.full_name||"this team member")+"?"))return;btn.disabled=true;try{const {data,error}=await db.functions.invoke("manage-team-account",{body:{user_id:member.id,action}});if(error)throw error;if(data?.error)throw new Error(data.error);toast(disabling?"Staff account disabled.":"Staff account enabled.");await refresh();}catch(err){toast("Could not "+action+" account: "+(err.message||"Please try again."));}finally{btn.disabled=false;}}));
    $$(".team-delete").forEach(btn=>btn.addEventListener("click",async()=>{const member=team.find(x=>x.id===btn.dataset.id);if(!member)return;const assigned=counts[member.id]||0;const warning="Permanently delete "+(member.full_name||"this team member")+"? This removes their login and profile. "+(assigned?assigned+" assigned project(s) will become unassigned. ":"")+"This cannot be undone.";if(!window.confirm(warning))return;btn.disabled=true;try{const {data,error}=await db.functions.invoke("manage-team-account",{body:{user_id:member.id,action:"delete"}});if(error)throw error;if(data?.error)throw new Error(data.error);toast("Staff account deleted.");await refresh();}catch(err){toast("Could not delete account: "+(err.message||"Please try again."));}finally{btn.disabled=false;}}));
  }
  $("#team-edit-form").addEventListener("submit",async e=>{e.preventDefault();if(!isAdmin())return;const f=e.currentTarget,button=f.querySelector('button[type="submit"]');button.disabled=true;try{const {error}=await db.from("profiles").update({full_name:f.elements.full_name.value.trim(),role:f.elements.role.value}).eq("id",f.elements.id.value).eq("account_type","staff");if(error)throw error;$("#team-edit-modal").classList.add("hidden");toast("Staff details updated.");await refresh();}catch(err){$("#team-edit-message").textContent=err.message||"Could not update staff details.";}finally{button.disabled=false;}});
  let teamHistoryMember=null,teamHistoryMode="activity",teamHistoryActivities=[];
  async function openTeamHistory(memberId,period="all",mode="activity"){
    const member=team.find(x=>x.id===memberId);if(!member)return;teamHistoryMember=member;teamHistoryMode=mode;
    $("#team-history-title").textContent=member.full_name||"Team member";$("#team-history-subtitle").textContent=member.role==="qa"?"QA reviewer work history":"Editor work history";
    $("#team-history-period").value=period;$("#team-history-day").value=new Date().toISOString().slice(0,10);$("#team-history-month").value=new Date().toISOString().slice(0,7);$("#team-history-year").value=new Date().getFullYear();
    $("#team-history-modal").classList.remove("hidden");await renderTeamHistory();
  }
  async function renderTeamHistory(){
    if(!teamHistoryMember)return;const period=$("#team-history-period").value;
    ["day","month","year"].forEach(k=>$("#team-history-"+k+"-wrap").classList.toggle("hidden",period!==k));
    const target=teamHistoryMember,assigned=projects.filter(p=>teamHistoryMode==="assigned"?(target.role==="qa"?p.qa_id===target.id:p.editor_id===target.id):(p.editor_id===target.id||p.qa_id===target.id));
    const {data,error}=await db.from("project_activity").select("id,project_id,actor_id,actor_name,activity_type,message,created_at,projects(id,project_code,name,service,status,qa_status,due_date,client_id)").eq("actor_id",target.id).order("created_at",{ascending:false}).limit(500);
    if(error){console.error("Team activity history:",error);$("#team-history-results").innerHTML='<p class="empty">Could not load activity history. Check project activity permissions.</p>';return;}
    let activities=data||[];const inRange=value=>{const d=String(value||"").slice(0,10);if(period==="day")return d===$("#team-history-day").value;if(period==="month")return d.slice(0,7)===$("#team-history-month").value;if(period==="year")return d.slice(0,4)===$("#team-history-year").value;return true;};
    activities=activities.filter(x=>inRange(x.created_at));
    const unique=new Map();activities.forEach(x=>{const p=x.projects;if(p)unique.set(p.id,{...p,lastActivity:x.created_at,activityMessage:x.message,activityType:x.activity_type});});
    const assignedFiltered=assigned.filter(p=>period==="all"||inRange(p.created_at)||inRange(p.due_date));
    const activityProjects=[...unique.values()];
    const projectList=teamHistoryMode==="assigned"?assignedFiltered:activityProjects;
    const activitiesHtml=activities.map(x=>`<div class="team-history-event"><span class="team-history-date">${safe(new Date(x.created_at).toLocaleString("en-US",{dateStyle:"medium",timeStyle:"short"}))}</span><strong>${safe(x.projects?.project_code||"Project")} · ${safe(x.projects?.name||"")}</strong><p>${safe(x.message)}</p></div>`).join("");
    const projectHtml=projectList.map(p=>`<article class="team-history-project"><div><strong>${safe(p.project_code||"Project")} · ${safe(p.name)}</strong><p>${safe(p.service||"")} · Due ${date(p.due_date)} · ${safe(p.status||"")}</p></div><button class="btn secondary team-project-open" data-id="${p.id}" type="button">View details</button></article>`).join("");
    $("#team-history-results").innerHTML=`<div class="team-history-summary"><strong>${projectList.length}</strong> ${teamHistoryMode==="assigned"?"currently assigned projects":"projects with recorded activity"} <span>${activities.length} recorded actions</span></div>${projectHtml||'<p class="empty">No matching projects found for this period.</p>'}${teamHistoryMode==="activity"?'<h3>Recorded work activity</h3>'+(activitiesHtml||'<p class="empty">No recorded actions for this period.</p>'):""}`;
    $$(".team-project-open").forEach(btn=>btn.addEventListener("click",()=>showTeamProject(btn.dataset.id)));
  }
  ["team-history-period","team-history-day","team-history-month","team-history-year"].forEach(id=>$("#"+id).addEventListener("change",renderTeamHistory));
  function showTeamProject(projectId){const p=projects.find(x=>x.id===projectId);if(!p)return;$("#team-project-title").textContent=(p.project_code||"Project")+" · "+p.name;const fields=[["Client",p.clients?.name||"—"],["Service",p.service],["Quantity",p.quantity],["Due date",date(p.due_date)],["Status",p.status],["Quality check",p.qa_status||"Not started"],["Brief",p.brief||"—"],["Project folder / delivery link",p.folder_url||"—"]];$("#team-project-details").innerHTML=fields.map(([label,value])=>`<div><small>${safe(label)}</small><strong>${safe(value)}</strong></div>`).join("");$("#team-project-modal").classList.remove("hidden");}
  let projectStatusFilter="all";
  function renderProjects(){
    const term=($("#project-search")?.value||"").toLowerCase();
    const clientView=role()==="client";
    const today=new Date().toISOString().slice(0,10); const matchesTerm=p=>(p.name+" "+p.project_code+" "+p.service+" "+(p.clients?.name||"")).toLowerCase().includes(term); const rows=projects.filter(p=>matchesTerm(p)&&(projectStatusFilter==="all"||(projectStatusFilter==="overdue"?!!p.due_date&&p.due_date<today&&!["Delivered","Cancelled"].includes(p.status):projectStatusFilter==="revisions"?(p.status==="Revisions"||p.qa_status==="Changes required"):projectStatusFilter==="active"?["Awaiting files","In progress","Revisions"].includes(p.status):projectStatusFilter==="qa"?p.status==="In QA":p.status==="Delivered")));
    const allowedStatuses=isAdmin()?["Awaiting files","In progress","In QA","Revisions","Delivered","Cancelled"]:["In progress","In QA","Revisions"];
    $("#projects-view h2").textContent=clientView?"Your projects":role()==="editor"?"Assigned projects":"Project register";
    $("#projects-view .toolbar p").textContent=clientView?"Follow each project's progress, deadline, instructions and delivery.":role()==="editor"?"Your assigned work, briefs, QA feedback and delivery deadlines.":"Track briefs, production, quality checks and delivery.";
    const total=projects.length;
    const counts={all:total,active:projects.filter(p=>["Awaiting files","In progress","Revisions"].includes(p.status)).length,qa:projects.filter(p=>p.status==="In QA").length,revisions:projects.filter(p=>p.status==="Revisions"||p.qa_status==="Changes required").length,delivered:projects.filter(p=>p.status==="Delivered").length,overdue:projects.filter(p=>p.due_date&&p.due_date<today&&!["Delivered","Cancelled"].includes(p.status)).length};
    const cards=[["all",clientView?"All projects":"Total projects",counts.all,"Across your workspace","▦"],["active","In production",counts.active,"Awaiting files or being edited","◷"],["qa","In quality review",counts.qa,"Awaiting final checks","◇"],["revisions","Needs changes",counts.revisions,"Revisions or QA changes requested","↻"],["delivered","Delivered",counts.delivered,"Completed projects","✓"],["overdue","Overdue",counts.overdue,"Past due date and not completed","!"]];
    $("#project-overview-grid").innerHTML=cards.map(([key,label,value,desc,icon])=>'<button type="button" class="project-overview-card '+(projectStatusFilter===key?"selected":"")+'" data-project-filter="'+key+'"><span class="project-overview-icon">'+icon+'</span><span class="project-overview-label">'+safe(label)+'</span><strong>'+value+'</strong><small>'+safe(desc)+'</small><span class="project-overview-track"><i style="width:'+(total?Math.min(100,value/total*100):0)+'%"></i></span></button>').join("");
    $(".project-overview-card").forEach(btn=>btn.addEventListener("click",()=>{projectStatusFilter=btn.dataset.projectFilter;renderProjects();}));
    $("#project-filter-note").innerHTML=projectStatusFilter==="all"?"Showing all projects":'<span>Filtered by: '+safe(cards.find(x=>x[0]===projectStatusFilter)?.[1]||projectStatusFilter)+'</span> <button type="button" class="text-button" id="project-filter-clear">Clear filter ×</button>';
    $("#project-filter-clear")?.addEventListener("click",()=>{projectStatusFilter="all";renderProjects();});
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
    const {error:readError}=await db.from("project_message_reads").upsert({project_id:projectId,user_id:user.id,last_read_at:new Date().toISOString()},{onConflict:"project_id,user_id"});
    if(readError)console.error("FrameCrest message read state:",readError);
    await refreshMessageInbox();
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
  function financeRange(){
    const period=$("#finance-period").value,raw=$("#finance-date").value||new Date().toISOString().slice(0,10),d=new Date(raw+"T12:00:00");
    let from,to,label;
    if(period==="day"){from=raw;to=raw;label="Daily · "+date(raw);}
    else if(period==="year"){from=d.getFullYear()+"-01-01";to=d.getFullYear()+"-12-31";label="Yearly · "+d.getFullYear();}
    else if(period==="all"){from="0001-01-01";to="9999-12-31";label="All time";}
    else{from=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-01";to=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(new Date(d.getFullYear(),d.getMonth()+1,0).getDate()).padStart(2,"0");label="Monthly · "+d.toLocaleDateString("en-US",{month:"long",year:"numeric"});}
    return {period,from,to,label};
  }
  function renderFinanceReport(){
    const r=financeRange(),filtered=paymentRecords.filter(x=>x.payment_date>=r.from&&x.payment_date<=r.to);
    const revenue=filtered.reduce((s,x)=>s+Number(x.amount_usd||0),0);
    const quoted=projects.reduce((s,p)=>s+Number((finances.find(f=>f.project_id===p.id)||{}).quote_usd||0),0);
    const paid=projects.reduce((s,p)=>s+Number((finances.find(f=>f.project_id===p.id)||{}).paid_usd||0),0);
    const outstanding=Math.max(0,quoted-paid);
    $("#finance-revenue").textContent=money(revenue);$("#finance-outstanding").textContent=money(outstanding);
    $("#finance-quoted").textContent=money(quoted);$("#finance-collection").textContent=(quoted?Math.min(100,paid/quoted*100):0).toFixed(1)+"%";
    $("#finance-range-label").textContent=r.label;$("#finance-payment-count").textContent=filtered.length+" payment"+(filtered.length===1?"":"s");
    const groups=new Map();filtered.forEach(x=>{const key=r.period==="day"?x.payment_date:r.period==="month"?x.payment_date.slice(0,10):x.payment_date.slice(0,7);groups.set(key,(groups.get(key)||0)+Number(x.amount_usd||0));});
    const chartRows=[...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0])).slice(-12),max=Math.max(1,...chartRows.map(x=>x[1]));
    $("#finance-chart-title").textContent=r.period==="day"?"Payments received on selected day":r.period==="month"?"Daily revenue":"Monthly revenue";
    $("#finance-chart").innerHTML=chartRows.length?chartRows.map(([key,value])=>'<div class="finance-bar-row"><span>'+safe(key)+'</span><div class="finance-bar-track"><i style="width:'+Math.max(2,value/max*100)+'%"></i></div><strong>'+money(value)+'</strong></div>').join(""):'<p class="empty">No payments recorded in this period yet.</p>';
    return {range:r,payments:filtered,revenue,quoted,paid,outstanding};
  }
  function renderFinance(){
    const clientView=role()==="client";
    $("#finance-subtitle").textContent=clientView?"Your project costs, payments, invoices and financial summaries.":"Studio revenue, outstanding balances, payment reports and client invoices.";
    $("#invoice-create-open").classList.toggle("hidden",!isAdmin());
    $("#finance-stats").classList.toggle("hidden",role()==="editor");
    $("#finance-export").classList.toggle("hidden",role()==="editor");
    $("#finance-period").onchange=renderFinanceReport;
    $("#finance-date").onchange=renderFinanceReport;
    const rows=projects.map(p=>{const f=finances.find(x=>x.project_id===p.id)||{quote_usd:0,paid_usd:0};return {p,f,balance:Number(f.quote_usd||0)-Number(f.paid_usd||0)};});
    $("#finance-table").innerHTML=rows.map(({p,f,balance})=>'<tr><td><strong>'+safe(p.project_code)+'</strong><small class="subline">'+safe(p.name)+'</small></td>'+(clientView?'':'<td>'+safe(p.clients?.name||"—")+'</td>')+'<td>'+money(f.quote_usd)+'</td><td>'+money(f.paid_usd)+'</td><td><strong>'+money(balance)+'</strong></td><td>'+(clientView?'<button class="btn secondary payment-history" data-id="'+p.id+'" type="button">Payment history</button>':'<button class="btn secondary finance-edit" data-id="'+p.id+'" type="button">Quote</button> <button class="btn secondary payment-add" data-id="'+p.id+'" type="button">Add payment</button> <button class="btn secondary payment-history" data-id="'+p.id+'" type="button">History</button>')+'</td></tr>').join("")||'<tr><td colspan="6" class="empty">No projects to show.</td></tr>';
    const heads=clientView?["PROJECT","QUOTE (USD)","PAID (USD)","OUTSTANDING","PAYMENTS"]:["PROJECT","CLIENT","QUOTE (USD)","PAID (USD)","OUTSTANDING","ACTION"];
    $("#finance-table").closest("table").querySelector("thead").innerHTML="<tr>"+heads.map(x=>"<th>"+x+"</th>").join("")+"</tr>";
    $$(".finance-edit").forEach(btn=>btn.addEventListener("click",()=>{
      const f=finances.find(x=>x.project_id===btn.dataset.id)||{quote_usd:0};
      const form=$("#finance-form");form.project_id.value=btn.dataset.id;form.quote_usd.value=f.quote_usd||0;$("#finance-modal").classList.remove("hidden");
    }));
    $$(".payment-add").forEach(btn=>btn.addEventListener("click",()=>{
      const p=projects.find(x=>x.id===btn.dataset.id);if(!p)return;
      const form=$("#payment-form");form.reset();form.project_id.value=p.id;form.payment_date.value=new Date().toISOString().slice(0,10);
      $("#payment-title").textContent="Add payment · "+p.project_code;$("#payment-message").textContent="";$("#payment-modal").classList.remove("hidden");
    }));
    $$(".payment-history").forEach(btn=>btn.addEventListener("click",()=>openPaymentHistory(btn.dataset.id)));
    renderFinanceReport();renderInvoices();
  }
  function renderInvoices(){
    $("#invoice-summary").textContent=invoiceRecords.length+" invoice"+(invoiceRecords.length===1?"":"s");
    $("#invoices-table").innerHTML=invoiceRecords.map(inv=>{
      const p=projects.find(x=>x.id===inv.project_id);
      const overdue=inv.status==="Issued"&&inv.due_date<new Date().toISOString().slice(0,10);
      return '<tr><td><strong>'+safe(inv.invoice_number)+'</strong></td><td>'+safe(p?.project_code||"Project")+' · '+safe(p?.name||"")+'</td><td>'+date(inv.issue_date)+'</td><td>'+date(inv.due_date)+(overdue?' <span class="status changes-required">Overdue</span>':'')+'</td><td>'+money(inv.amount_usd)+'</td><td><span class="status '+(inv.status==="Paid"?"delivered":inv.status==="Void"?"cancelled":"in-progress")+'">'+safe(inv.status)+'</span></td><td><button class="btn secondary invoice-view" data-id="'+inv.id+'" type="button">View</button>'+(isAdmin()&&inv.status==="Issued"?' <button class="btn secondary invoice-paid" data-id="'+inv.id+'" type="button">Mark paid</button> <button class="btn secondary invoice-void" data-id="'+inv.id+'" type="button">Void</button>':'')+'</td></tr>';
    }).join("")||'<tr><td colspan="7" class="empty">No invoices have been issued yet.</td></tr>';
    $$(".invoice-view").forEach(b=>b.addEventListener("click",()=>previewInvoice(b.dataset.id)));
    $$(".invoice-paid").forEach(b=>b.addEventListener("click",()=>updateInvoiceStatus(b.dataset.id,"Paid")));
    $$(".invoice-void").forEach(b=>b.addEventListener("click",()=>updateInvoiceStatus(b.dataset.id,"Void")));
    const select=$("#invoice-project");select.innerHTML=projects.map(p=>'<option value="'+p.id+'">'+safe(p.project_code)+' · '+safe(p.name)+' — '+safe(p.clients?.name||"Client")+'</option>').join("");
  }
  async function updateInvoiceStatus(id,status){
    if(!isAdmin())return;
    const inv=invoiceRecords.find(x=>x.id===id);if(!inv)return;
    if(status==="Paid"){
      const {error:paymentError}=await db.from("project_payments").insert({project_id:inv.project_id,amount_usd:inv.amount_usd,payment_date:new Date().toISOString().slice(0,10),payment_method:"Other",reference:inv.invoice_number,notes:"Invoice settled: "+inv.invoice_number,created_by:user.id});
      if(paymentError){toast("Could not record invoice payment: "+paymentError.message);return;}
    }
    const {error}=await db.from("project_invoices").update({status,updated_at:new Date().toISOString()}).eq("id",id);
    if(error){toast("Payment was recorded, but invoice status could not be updated: "+error.message);await refresh();return;}
    toast(status==="Paid"?"Invoice settled and payment recorded.":"Invoice voided.");await refresh();
  }
  function invoiceMarkup(inv){
    const p=projects.find(x=>x.id===inv.project_id),client=p?.clients?.name||"Client";
    return '<div class="invoice-paper"><div class="invoice-brand"><strong>FRAMECREST STUDIOS</strong><span>Every Property Deserves a Better Frame.</span></div><div class="invoice-heading"><h1>INVOICE</h1><strong>'+safe(inv.invoice_number)+'</strong></div><div class="invoice-meta"><div><small>BILL TO</small><strong>'+safe(client)+'</strong><span>'+safe(p?.name||"Project")+'</span></div><div><small>ISSUE DATE</small><strong>'+date(inv.issue_date)+'</strong><small>DUE DATE</small><strong>'+date(inv.due_date)+'</strong></div></div><div class="invoice-line"><span>'+safe(p?.service||"Creative production services")+' · '+safe(p?.name||"Project")+'</span><strong>'+money(inv.amount_usd)+'</strong></div><div class="invoice-total"><span>Total due</span><strong>'+money(inv.amount_usd)+'</strong></div><p class="invoice-notes">'+safe(inv.notes||"Thank you for choosing FrameCrest Studios.")+'</p><p class="invoice-footer">FrameCrest Studios · Every Property Deserves a Better Frame.</p></div>';
  }
  function previewInvoice(id){
    const inv=invoiceRecords.find(x=>x.id===id);if(!inv)return;
    $("#invoice-preview-title").textContent=inv.invoice_number;$("#invoice-preview-content").innerHTML=invoiceMarkup(inv);
    $("#invoice-print").dataset.id=id;$("#invoice-preview-modal").classList.remove("hidden");
  }
  $("#invoice-print").addEventListener("click",()=>{
    const inv=invoiceRecords.find(x=>x.id===$("#invoice-print").dataset.id);if(!inv)return;
    const w=window.open("","_blank");if(!w){toast("Allow pop-ups to print this invoice.");return;}
    w.document.write('<!doctype html><html><head><title>'+safe(inv.invoice_number)+'</title><style>body{font-family:Arial,sans-serif;color:#14283f;padding:40px}.invoice-paper{max-width:760px;margin:auto}.invoice-brand strong{display:block;letter-spacing:3px}.invoice-brand span,.invoice-meta small{color:#78909c;font-size:12px}.invoice-heading{display:flex;justify-content:space-between;margin:55px 0 35px}.invoice-heading h1{font-size:32px}.invoice-meta{display:flex;justify-content:space-between;margin-bottom:45px}.invoice-meta div{display:grid;gap:8px}.invoice-line,.invoice-total{display:flex;justify-content:space-between;padding:20px 0;border-bottom:1px solid #ddd}.invoice-total{font-size:22px}.invoice-notes{white-space:pre-wrap;margin-top:40px}.invoice-footer{margin-top:80px;color:#78909c;font-size:12px}</style></head><body>'+invoiceMarkup(inv)+'</body></html>');
    w.document.close();w.focus();w.print();
  });
  $("#invoice-create-open").addEventListener("click",()=>{
    if(!isAdmin())return;
    const form=$("#invoice-form");form.reset();
    const today=new Date().toISOString().slice(0,10);form.issue_date.value=today;form.due_date.value=new Date(Date.now()+14*86400000).toISOString().slice(0,10);
    form.invoice_number.value="FC-"+new Date().getFullYear()+"-"+String(invoiceRecords.length+1).padStart(3,"0");
    const first=projects[0];if(first){form.project_id.value=first.id;const f=finances.find(x=>x.project_id===first.id)||{};form.amount_usd.value=Math.max(0,Number(f.quote_usd||0)-Number(f.paid_usd||0)).toFixed(2);}
    $("#invoice-message").textContent="";$("#invoice-modal").classList.remove("hidden");
  });
  $("#invoice-project").addEventListener("change",e=>{
    const f=finances.find(x=>x.project_id===e.target.value)||{};$("#invoice-form").amount_usd.value=Math.max(0,Number(f.quote_usd||0)-Number(f.paid_usd||0)).toFixed(2);
  });
  $("#invoice-form").addEventListener("submit",async e=>{
    e.preventDefault();if(!isAdmin())return;
    const form=e.currentTarget,f=Object.fromEntries(new FormData(form).entries());
    if(f.due_date<f.issue_date){$("#invoice-message").textContent="Due date cannot be before the issue date.";return;}
    const {error}=await db.from("project_invoices").insert({project_id:f.project_id,invoice_number:f.invoice_number.trim(),amount_usd:Number(f.amount_usd),issue_date:f.issue_date,due_date:f.due_date,status:"Issued",notes:f.notes.trim()||null,created_by:user.id});
    if(error){$("#invoice-message").textContent=error.message;return;}
    $("#invoice-modal").classList.add("hidden");toast("Invoice created.");await refresh();
  });
  $("#finance-export").addEventListener("click",()=>{
    const report=renderFinanceReport(),lines=[["FrameCrest Studios Finance Report",report.range.label],["Revenue received",report.revenue],["Total quoted",report.quoted],["Total paid to date",report.paid],["Outstanding",report.outstanding],[],["Payment date","Project","Amount USD","Method","Reference"]];
    report.payments.forEach(x=>{const p=projects.find(y=>y.id===x.project_id);lines.push([x.payment_date,p?.project_code||"",x.amount_usd,x.payment_method,x.reference||""]);});
    const csv=lines.map(row=>row.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\r\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"}),url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download="framecrest-finance-"+report.range.from+"-to-"+report.range.to+".csv";a.click();URL.revokeObjectURL(url);
  });
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
  async function refreshMessageInbox(){
    if(role()==="editor"){inboxRows=[];return;}
    const ids=projects.map(p=>p.id);
    if(!ids.length){inboxRows=[];renderMessageInbox();return;}
    const results=await Promise.all([
      db.from("project_messages").select("id,project_id,message,sender_id,created_at").in("project_id",ids).order("created_at",{ascending:false}),
      db.from("project_message_reads").select("project_id,last_read_at").eq("user_id",user.id).in("project_id",ids)
    ]);
    const mr=results[0],rr=results[1];
    if(mr.error){console.error(mr.error);toast("Could not load messages: "+mr.error.message);return;}
    if(rr.error){console.error(rr.error);toast("Could not load read status: "+rr.error.message);return;}
    const reads=new Map((rr.data||[]).map(x=>[x.project_id,new Date(x.last_read_at).getTime()]));
    const latest=new Map();(mr.data||[]).forEach(m=>{if(!latest.has(m.project_id))latest.set(m.project_id,m);});
    inboxRows=projects.filter(p=>latest.has(p.id)).map(p=>{const last=latest.get(p.id),readAt=reads.get(p.id)||0;const unread=(mr.data||[]).filter(m=>m.project_id===p.id&&new Date(m.created_at).getTime()>readAt&&m.sender_id!==user.id).length;return {project:p,last,unread};}).sort((x,y)=>new Date(y.last.created_at)-new Date(x.last.created_at));
    renderMessageInbox();
  }
  function renderMessageInbox(){
    const count=inboxRows.reduce((n,x)=>n+x.unread,0);$("#messages-unread-count").textContent=count>99?"99+":count;$("#messages-unread-count").classList.toggle("hidden",count===0);
    $("#messages-inbox-table").innerHTML=inboxRows.map(x=>'<tr><td><strong>'+safe(x.project.project_code)+' · '+safe(x.project.name)+'</strong></td><td>'+safe(x.project.clients?.name||"—")+'</td><td class="'+(x.unread?"inbox-unread":"")+'">'+safe(x.last.message.length>100?x.last.message.slice(0,100)+"…":x.last.message)+'</td><td>'+new Date(x.last.created_at).toLocaleString("en-US",{dateStyle:"medium",timeStyle:"short"})+'</td><td>'+(x.unread?'<span class="status in-progress">'+x.unread+' new</span>':"—")+'</td><td><button class="btn secondary inbox-open" data-id="'+x.project.id+'" type="button">Open</button></td></tr>').join("")||'<tr><td colspan="6" class="empty">No conversations yet. Messages will appear here when someone starts a project conversation.</td></tr>';
    $$(".inbox-open").forEach(b=>b.addEventListener("click",()=>openProjectMessages(b.dataset.id)));
  }
  $("#messages-refresh").addEventListener("click",refreshMessageInbox);
  function setView(view){
    if(view==="reports"&&!["admin","client"].includes(role()))return;
    if(view==="finance"&&!["admin","client"].includes(role()))return;
    $$(".view").forEach(el=>el.classList.add("hidden"));$("#"+view+"-view").classList.remove("hidden");
    $$(".nav-item").forEach(el=>el.classList.toggle("active",el.dataset.view===view));
    $("#page-title").textContent=view==="team"?"Team directory":view.charAt(0).toUpperCase()+view.slice(1);
    if(view==="inbox")refreshMessageInbox();
    if(view==="reports"){renderReportWorkspace();loadReportArchives();}
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