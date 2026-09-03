const DEFAULT_CATEGORIES = [
  ["Rent","bi-house-door"],["Ooredoo Bill","bi-phone"],["Vodafone Broadband","bi-wifi"],
  ["Kahramaa Bill","bi-lightning-charge"],["EMI","bi-credit-card"],["Petrol","bi-fuel-pump"],
  ["Car Wash","bi-car-front"],["Gym","bi-activity"],["Medical","bi-heart-pulse"],
  ["Grocery-Lulu","bi-cart3"],["Cinema","bi-film"],["Food","bi-egg-fried"],
  ["Baraha","bi-cup-straw"],["Other","bi-three-dots"]
];

const money = n => new Intl.NumberFormat("en-QA",{style:"currency",currency:"QAR",maximumFractionDigits:2}).format(Number(n||0));
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
const state = { transactions: [], categories: [], familyId: null, user: null, channel: null, loading: false, page: 1, balanceVisible: false };
const PAGE_SIZE = 10;
let db = null;

function escapeHtml(v){return String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
function iconFor(name){return state.categories.find(c=>c.name===name)?.icon||"bi-three-dots";}
function show(id){const e=document.getElementById(id);if(e)e.classList.remove("d-none");}
function hide(id){const e=document.getElementById(id);if(e)e.classList.add("d-none");}
function setBusy(button,busy,label){if(!button)return;button.disabled=busy;button.dataset.originalText ||= button.textContent;button.textContent=busy?label:button.dataset.originalText;}

function showSkeleton(showIt){
  const list=document.querySelector("#transactions");
  if(!list)return;
  if(showIt){
    list.innerHTML = `<div class="skeleton-list">${Array.from({length:4},()=>`<div class="skeleton-row"><span class="skeleton-circle"></span><span class="skeleton-lines"><i></i><i></i></span><span class="skeleton-amount"></span></div>`).join("")}</div>`;
  }
}

function toast(message){
  const el=document.querySelector("#appToast");
  if(!el)return;
  el.querySelector(".toast-body").textContent=message;
  bootstrap.Toast.getOrCreateInstance(el).show();
}

function showModal(id){const el=document.getElementById(id);if(el)bootstrap.Modal.getOrCreateInstance(el).show();}
function hideModal(id){const el=document.getElementById(id);if(el)bootstrap.Modal.getOrCreateInstance(el).hide();}

async function signIn(email,password){
  const button=document.querySelector("#loginForm button[type=submit]");
  setBusy(button,true,"Signing in…");
  const {error}=await db.auth.signInWithPassword({email,password});
  setBusy(button,false,"Sign in");
  if(error) throw error;
}

async function signOut(){
  await db.auth.signOut();
}

async function getFamilyId(userId){
  const {data,error}=await db.from("family_members").select("family_id").eq("user_id",userId).limit(1).maybeSingle();
  if(error) throw error;
  if(!data?.family_id) throw new Error("This account is not connected to the Family Finance family.");
  return data.family_id;
}

async function loadCategories(){
  const {data,error}=await db.from("categories").select("id,name,icon,created_at").eq("family_id",state.familyId).order("created_at",{ascending:true});
  if(error) throw error;
  state.categories=data||[];
  if(!state.categories.length){
    const rows=DEFAULT_CATEGORIES.map(([name,icon])=>({family_id:state.familyId,name,icon}));
    const {data:created,error:insertError}=await db.from("categories").insert(rows).select("id,name,icon,created_at");
    if(insertError) throw insertError;
    state.categories=created||[];
  }
  renderCategoryChips();
}

async function loadTransactions(){
  const {data,error}=await db.from("transactions").select("id,type,amount,category,description,transaction_date,created_at,user_id").eq("family_id",state.familyId).order("transaction_date",{ascending:false}).order("created_at",{ascending:false});
  if(error) throw error;
  state.transactions=data||[];
}

function renderCategoryChips(filter=""){
  const wrap=document.querySelector("#categoryChips");
  if(!wrap)return;
  const q=filter.trim().toLowerCase();
  const categories=state.categories.filter(c=>!q||c.name.toLowerCase().includes(q));
  const selected=document.querySelector("#category")?.value || "";
  wrap.innerHTML=categories.map(c=>`<button type="button" class="category-chip ${c.name===selected?"selected":""}" data-category="${escapeHtml(c.name)}"><i class="bi ${escapeHtml(c.icon||"bi-three-dots")}"></i><span>${escapeHtml(c.name)}</span></button>`).join("");
  if(!categories.length) wrap.innerHTML=`<div class="category-empty">No matching category.</div>`;
  wrap.querySelectorAll(".category-chip").forEach(btn=>btn.addEventListener("click",()=>selectCategory(btn.dataset.category)));
}

function selectCategory(name){
  const hidden=document.querySelector("#category");
  if(hidden) hidden.value=name;
  document.querySelector("#categorySearch").value="";
  renderCategoryChips();
}


const REPORT_GROUPS = {
  "Supermarket": ["Grocery-Lulu", "Baraha"]
};

function reportMonthOptions(){
  const months = new Set();
  state.transactions.filter(t=>t.type==="expense").forEach(t=>{ if(t.transaction_date) months.add(String(t.transaction_date).slice(0,7)); });
  months.add(today().slice(0,7));
  return [...months].sort((a,b)=>b.localeCompare(a));
}

function formatMonth(key){
  const [y,m]=key.split("-");
  return new Intl.DateTimeFormat("en-US",{month:"long",year:"numeric"}).format(new Date(Number(y),Number(m)-1,1));
}

function renderReport(){
  const select=document.querySelector("#reportMonth");
  const list=document.querySelector("#reportCategories");
  if(!select||!list)return;
  const options=reportMonthOptions();
  const current=select.value && options.includes(select.value) ? select.value : today().slice(0,7);
  select.innerHTML=options.map(m=>`<option value="${m}">${formatMonth(m)}</option>`).join("");
  select.value=current;

  const monthExpenses=state.transactions.filter(t=>t.type==="expense"&&String(t.transaction_date||"").startsWith(current));
  const total=monthExpenses.reduce((sum,t)=>sum+Number(t.amount||0),0);
  document.querySelector("#reportTotal").textContent=money(total);
  document.querySelector("#reportExpenseCount").textContent=`${monthExpenses.length} expense${monthExpenses.length===1?"":"s"}`;

  const grouped=new Map();
  const groupedSource=new Map();
  monthExpenses.forEach(t=>{
    let group=t.category||"Other";
    for(const [name,cats] of Object.entries(REPORT_GROUPS)) if(cats.includes(group)) group=name;
    grouped.set(group,(grouped.get(group)||0)+Number(t.amount||0));
    if(!groupedSource.has(group))groupedSource.set(group,{});
    const source=t.category||"Other";
    groupedSource.get(group)[source]=(groupedSource.get(group)[source]||0)+Number(t.amount||0);
  });

  const rows=[...grouped.entries()].sort((a,b)=>b[1]-a[1]);
  if(!rows.length){list.innerHTML=`<div class="report-empty"><i class="bi bi-bar-chart fs-4 d-block mb-2"></i>No expenses for ${formatMonth(current)}.</div>`;document.querySelector("#supermarketDetail")?.classList.add("d-none");return;}
  list.innerHTML=rows.map(([name,amount])=>{
    const pct=total?amount/total*100:0;
    const icon=name==="Supermarket"?"bi-cart3":iconFor(name);
    const clickable=name==="Supermarket";
    return `<div class="report-category ${clickable?"clickable":""}" ${clickable?'data-report-group="Supermarket"':''}>
      <div class="report-category-main"><div class="report-cat-icon"><i class="bi ${escapeHtml(icon)}"></i></div><div class="report-cat-copy"><div class="report-cat-name">${escapeHtml(name)}</div><div class="report-cat-meta">${pct.toFixed(1)}% of spending${clickable?" · Tap for split":""}</div></div><div class="report-cat-amount">${money(amount)}</div></div>
      <div class="report-bar"><span style="width:${pct}%"></span></div>
    </div>`;
  }).join("");

  list.querySelector('[data-report-group="Supermarket"]')?.addEventListener("click",()=>renderSupermarketSplit(groupedSource.get("Supermarket")||{}));
}

function renderSupermarketSplit(source){
  const box=document.querySelector("#supermarketDetail");
  const wrap=document.querySelector("#supermarketSplit");
  if(!box||!wrap)return;
  const rows=Object.entries(source).sort((a,b)=>b[1]-a[1]);
  const total=rows.reduce((s,[,v])=>s+v,0);
  document.querySelector("#supermarketTotal").textContent=money(total);
  wrap.innerHTML=rows.map(([name,amount])=>{
    const pct=total?amount/total*100:0;
    return `<div class="supermarket-row"><div class="supermarket-copy"><div class="supermarket-name">${escapeHtml(name)}</div><div class="supermarket-bar"><span style="width:${pct}%"></span></div></div><div class="supermarket-amount">${money(amount)}<div class="report-cat-meta">${pct.toFixed(1)}%</div></div></div>`;
  }).join("");
  box.classList.remove("d-none");
}

function showHome(){
  document.querySelector("main.app-container")?.classList.remove("d-none");
  document.querySelector("#reportsView")?.classList.add("d-none");
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",!b.dataset.nav));
}
function showReports(){
  document.querySelector("main.app-container")?.classList.add("d-none");
  document.querySelector("#reportsView")?.classList.remove("d-none");
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.nav==="reports"));
  renderReport();
}

function render(){
  const funds=state.transactions.filter(t=>t.type==="income").reduce((s,t)=>s+Number(t.amount||0),0);
  const expenses=state.transactions.filter(t=>t.type==="expense").reduce((s,t)=>s+Number(t.amount||0),0);
  const month=today().slice(0,7);
  const monthExpenses=state.transactions.filter(t=>t.type==="expense"&&String(t.transaction_date).startsWith(month)).reduce((s,t)=>s+Number(t.amount||0),0);
  const pct=funds?Math.min(100,Math.max(0,expenses/funds*100)):0;
  const balanceEl = document.querySelector("#balance");
const incomeEl = document.querySelector("#incomeTotal");

if (state.balanceVisible) {
  balanceEl.textContent = money(balance);
  incomeEl.textContent = `${money(funds)} income`;
} else {
  balanceEl.textContent = "QAR ••••••••";
  incomeEl.textContent = "QAR •••••••• income";
}
  document.querySelector("#expenseTotal").textContent=`${money(expenses)} spent`;
  document.querySelector("#incomeStat").textContent=money(funds);
  document.querySelector("#monthStat").textContent=money(monthExpenses);
  document.querySelector("#spendProgress").style.width=`${pct}%`;
  document.querySelector("#progressLabel").textContent=funds?`${pct.toFixed(1)}% of income spent`:"Add income to start tracking spending";

  const listEl=document.querySelector("#transactions");
  const ordered=[...state.transactions].sort((a,b)=>String(b.transaction_date||"").localeCompare(String(a.transaction_date||""))||String(b.created_at||"").localeCompare(String(a.created_at||"")));
  const totalPages=Math.max(1,Math.ceil(ordered.length/PAGE_SIZE));
  state.page=Math.min(Math.max(1,state.page),totalPages);
  const pageItems=ordered.slice((state.page-1)*PAGE_SIZE,state.page*PAGE_SIZE);

  listEl.innerHTML=pageItems.length?pageItems.map(t=>{
    const mine=state.user && t.user_id===state.user.id;
    return `<div class="transaction">
      <div class="tx-icon"><i class="bi ${t.type==="income"?"bi-arrow-down-left":iconFor(t.category)}"></i></div>
      <div class="tx-main"><div class="tx-name">${escapeHtml(t.category)}</div>
      <div class="tx-desc">${escapeHtml(t.description||"No description")} · ${escapeHtml(t.transaction_date)}</div></div>
      <div class="tx-amount ${t.type==="income"?"tx-income":""}">${t.type==="income"?"+":"-"} ${money(t.amount)}</div>
      ${mine?`<button type="button" class="tx-menu-btn" data-tx-menu="${escapeHtml(t.id)}" aria-label="Transaction actions"><i class="bi bi-three-dots"></i></button>`:""}
    </div>`;
  }).join(""):`<div class="text-center text-secondary py-5">No transactions yet.</div>`;

  listEl.querySelectorAll("[data-tx-menu]").forEach(btn=>btn.addEventListener("click",()=>openTransactionActions(btn.dataset.txMenu)));
  renderPagination(totalPages);
  if(!document.querySelector("#reportsView")?.classList.contains("d-none")) renderReport();
}

function renderPagination(totalPages){
  let nav=document.querySelector("#transactionPagination");
  if(!nav){nav=document.createElement("div");nav.id="transactionPagination";nav.className="transaction-pagination";document.querySelector("#transactions")?.after(nav);}
  if(totalPages<=1){nav.innerHTML="";return;}
  let buttons="";
  for(let i=1;i<=totalPages;i++) buttons+=`<button type="button" class="page-btn ${i===state.page?"active":""}" data-page="${i}">${i}</button>`;
  nav.innerHTML=`<button type="button" class="page-arrow" data-page="${state.page-1}" ${state.page===1?"disabled":""} aria-label="Previous"><i class="bi bi-chevron-left"></i></button>${buttons}<button type="button" class="page-arrow" data-page="${state.page+1}" ${state.page===totalPages?"disabled":""} aria-label="Next"><i class="bi bi-chevron-right"></i></button>`;
  nav.querySelectorAll("[data-page]").forEach(btn=>btn.addEventListener("click",()=>{const p=Number(btn.dataset.page);if(p>=1&&p<=totalPages&&p!==state.page){state.page=p;render();}}));
}

function openTransactionActions(id){
  const t=state.transactions.find(x=>x.id===id);
  if(!t||!state.user||t.user_id!==state.user.id)return;
  const old=document.querySelector("#transactionActionsModal");if(old)old.remove();
  const modal=document.createElement("div");modal.className="modal fade";modal.id="transactionActionsModal";modal.tabIndex=-1;
  modal.innerHTML=`<div class="modal-dialog modal-dialog-centered"><div class="modal-content app-modal"><div class="modal-header border-0"><div><div class="eyebrow">TRANSACTION</div><h3 class="modal-title">${escapeHtml(t.category)}</h3></div><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body pt-0"><button type="button" class="action-row" id="editTx"><i class="bi bi-pencil"></i><span>Edit transaction</span><i class="bi bi-chevron-right ms-auto"></i></button><button type="button" class="action-row danger" id="deleteTx"><i class="bi bi-trash3"></i><span>Delete transaction</span><i class="bi bi-chevron-right ms-auto"></i></button></div></div></div>`;
  document.body.appendChild(modal);const instance=bootstrap.Modal.getOrCreateInstance(modal);instance.show();
  modal.querySelector("#editTx").onclick=()=>{instance.hide();setTimeout(()=>openEditTransaction(t),150);};
  modal.querySelector("#deleteTx").onclick=()=>{instance.hide();setTimeout(()=>deleteTransaction(t),150);};
  modal.addEventListener("hidden.bs.modal",()=>modal.remove(),{once:true});
}

function openEditTransaction(t){
  const modalId=t.type==="income"?"incomeModal":"expenseModal";const modal=document.querySelector(`#${modalId}`);if(!modal)return;
  const q=id=>document.querySelector(id);
  q(t.type==="income"?"#incomeAmount":"#amount").value=t.amount;
  q(t.type==="income"?"#incomeDescription":"#description").value=t.description||"";
  q(t.type==="income"?"#incomeDate":"#date").value=t.transaction_date||today();
  if(t.type==="income") q("#incomeSource").value=t.category||"Other";
  else {q("#category").value=t.category||"Other";renderCategoryChips();}
  modal.dataset.editingId=t.id;modal.querySelector(".modal-title").textContent=t.type==="income"?"Edit income":"Edit expense";modal.querySelector('button[type="submit"]').textContent="Save changes";
  showModal(modalId);
}

async function deleteTransaction(t){
  if(!state.user||t.user_id!==state.user.id)return;
  if(!window.confirm(`Delete this ${t.type} of ${money(t.amount)}?`))return;
  const {error}=await db.from("transactions").delete().eq("id",t.id).eq("user_id",state.user.id);
  if(error){toast(error.message);return;}
  state.page=1;await loadTransactions();render();toast("Transaction deleted");
}
function subscribeRealtime(){
  if(state.channel) db.removeChannel(state.channel);
  state.channel=db.channel(`family-finance-${state.familyId}`)
    .on("postgres_changes",{event:"*",schema:"public",table:"transactions",filter:`family_id=eq.${state.familyId}`},async()=>{
      await loadTransactions();
      render();
    })
    .on("postgres_changes",{event:"*",schema:"public",table:"categories",filter:`family_id=eq.${state.familyId}`},async()=>{
      await loadCategories();
    })
    .subscribe();
}

async function createCategoryFromDescription(description){
  const name=description.trim();
  if(!name)return null;
  const existing=state.categories.find(c=>c.name.toLowerCase()===name.toLowerCase());
  if(existing)return existing.name;
  const {data,error}=await db.from("categories").insert({family_id:state.familyId,name,icon:"bi-tag"}).select("id,name,icon,created_at").single();
  if(error) throw error;
  state.categories.push(data);
  renderCategoryChips();
  return data.name;
}

async function addTransaction(type, form){
  const amount=Number(form.querySelector(type==="income"?"#incomeAmount":"#amount").value);
  const date=form.querySelector(type==="income"?"#incomeDate":"#date").value||today();
  const description=form.querySelector(type==="income"?"#incomeDescription":"#description").value.trim();
  let category=type==="income"?form.querySelector("#incomeSource").value:form.querySelector("#category").value;
  if(!amount||amount<=0)throw new Error("Please enter a valid amount.");
  if(type==="expense" && category==="Other" && description){
    category=await createCategoryFromDescription(description);
  }
  const {error}=await db.from("transactions").insert({family_id:state.familyId,user_id:state.user.id,type,amount,category,description,transaction_date:date});
  if(error)throw error;
  await loadTransactions();render();
}

async function updateTransaction(id,type,form){
  const amount=Number(form.querySelector(type==="income"?"#incomeAmount":"#amount").value);
  const date=form.querySelector(type==="income"?"#incomeDate":"#date").value||today();
  const description=form.querySelector(type==="income"?"#incomeDescription":"#description").value.trim();
  let category=type==="income"?form.querySelector("#incomeSource").value:form.querySelector("#category").value;
  if(!amount||amount<=0)throw new Error("Please enter a valid amount.");
  if(type==="expense"&&category==="Other"&&description)category=await createCategoryFromDescription(description);
  const {error}=await db.from("transactions").update({amount,category,description,transaction_date:date}).eq("id",id).eq("user_id",state.user.id);
  if(error)throw error;
  await loadTransactions();render();
}

async function resetAllData(){
  const button=document.querySelector("#confirmResetBtn");
  setBusy(button,true,"Deleting…");
  const {error:txError}=await db.from("transactions").delete().eq("family_id",state.familyId);
  if(txError){setBusy(button,false,"Delete all data");throw txError;}
  const {error:catError}=await db.from("categories").delete().eq("family_id",state.familyId);
  if(catError){setBusy(button,false,"Delete all data");throw catError;}
  const rows=DEFAULT_CATEGORIES.map(([name,icon])=>({family_id:state.familyId,name,icon}));
  const {error:insertError}=await db.from("categories").insert(rows);
  if(insertError){setBusy(button,false,"Delete all data");throw insertError;}
  await Promise.all([loadCategories(),loadTransactions()]);
  render();
  setBusy(button,false,"Delete all data");
  hideModal("resetConfirmModal");hideModal("settingsModal");
  toast("All family data cleared");
}

async function startApp(user){
  state.user=user;
  state.familyId=await getFamilyId(user.id);
  document.querySelector("#currentUser").textContent=user.email;
  hide("loginScreen");show("app-shell");
  document.querySelector("#date").value=today();
  document.querySelector("#incomeDate").value=today();
  showSkeleton(true);
  await Promise.all([loadCategories(),loadTransactions()]);
  render();
  subscribeRealtime();
}

async function handleAuth(){
  const {data:{session}}=await db.auth.getSession();
  if(session?.user){
    try{await startApp(session.user);}catch(error){show("loginScreen");hide("app-shell");document.querySelector("#loginError").textContent=error.message;show("loginError");}
  }else{show("loginScreen");hide("app-shell");}
}

function setup(){
  document.querySelector("#loginForm").addEventListener("submit",async e=>{
    e.preventDefault();hide("loginError");
    try{await signIn(document.querySelector("#loginEmail").value.trim(),document.querySelector("#loginPassword").value);}catch(error){document.querySelector("#loginError").textContent=error.message;show("loginError");}
  });
  document.querySelector("#expenseForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const form=e.currentTarget;
    const modal=form.closest(".modal");
    const button=e.submitter;
    setBusy(button,true,"Saving…");
    try{
      const id=modal?.dataset.editingId;
      if(id){await updateTransaction(id,"expense",form);delete modal.dataset.editingId;toast("Expense updated");}
      else {await addTransaction("expense",form);toast("Expense added");}
      form.reset();document.querySelector("#date").value=today();
      const titleEl = modal?.querySelector(".modal-title");
      if(titleEl) titleEl.textContent="Add expense";
      button.textContent="Add expense";hideModal("expenseModal");
    }catch(error){toast(error.message);}
    finally{setBusy(button,false,button.dataset.originalText||"Add expense");}
  });
  document.querySelector("#incomeForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const form=e.currentTarget;
    const modal=form.closest(".modal");
    const button=e.submitter;
    setBusy(button,true,"Saving…");
    try{
      const id=modal?.dataset.editingId;
      if(id){await updateTransaction(id,"income",form);delete modal.dataset.editingId;toast("Income updated");}
      else {await addTransaction("income",form);toast("Income added");}
      form.reset();document.querySelector("#incomeDate").value=today();
      const titleEl = modal?.querySelector(".modal-title");
      if(titleEl) titleEl.textContent="Add income";
      button.textContent="Add income";hideModal("incomeModal");
    }catch(error){toast(error.message);}
    finally{setBusy(button,false,button.dataset.originalText||"Add income");}
  });
  document.querySelector("#categorySearch").addEventListener("input",e=>renderCategoryChips(e.target.value));
  document.querySelector("#settingsBtn").addEventListener("click",()=>{document.querySelector("#currentUser").textContent=state.user?.email||"";showModal("settingsModal");});
  document.querySelector("#closeSettingsBtn").addEventListener("click",()=>hideModal("settingsModal"));
  document.querySelector("#resetDataBtn").addEventListener("click",()=>showModal("resetConfirmModal"));
  document.querySelector("#cancelResetBtn").addEventListener("click",()=>hideModal("resetConfirmModal"));
  document.querySelector("#confirmResetBtn").addEventListener("click",async()=>{try{await resetAllData();}catch(error){toast(error.message);}});
  document.querySelector("#logoutBtn").addEventListener("click",async()=>{hideModal("settingsModal");await signOut();});
  document.querySelector("#viewAllBtn").addEventListener("click",()=>{state.page=1;render();document.querySelector("#transactions")?.scrollIntoView({behavior:"smooth",block:"start"});});
  document.querySelector('[data-nav="reports"]')?.addEventListener("click",showReports);
  document.querySelector('.nav-item:not([data-nav="reports"])')?.addEventListener("click",showHome);
  document.querySelector("#reportMonth")?.addEventListener("change",()=>{document.querySelector("#supermarketDetail")?.classList.add("d-none");renderReport();});
document
  .querySelector("#balanceVisibilityBtn")
  ?.addEventListener("click", () => {
    state.balanceVisible = !state.balanceVisible;

    const btn = document.querySelector("#balanceVisibilityBtn");
    const icon = btn?.querySelector("i");

    if (state.balanceVisible) {
      btn?.setAttribute("aria-label", "Hide balance");
      btn?.setAttribute("aria-pressed", "true");

      if (icon) {
        icon.className = "bi bi-eye-slash";
      }
    } else {
      btn?.setAttribute("aria-label", "Show balance");
      btn?.setAttribute("aria-pressed", "false");

      if (icon) {
        icon.className = "bi bi-eye";
      }
    }

    render();
  });
  
}

const config=window.SUPABASE_CONFIG;
if(!config || !config.url || !config.publishableKey || config.publishableKey.includes("PASTE_YOUR")){
  document.querySelector("#loginError").textContent="Add your Supabase publishable key in js/config.js before opening the app.";
  show("loginError");
}else{
  const {createClient}=window.supabase;
  db=createClient(config.url,config.publishableKey,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}});
  window.supabaseClient=db;
  setup();
  db.auth.onAuthStateChange(async(event,session)=>{
    if(session?.user && event==="SIGNED_IN"){
      try{await startApp(session.user);}catch(error){document.querySelector("#loginError").textContent=error.message;show("loginError");}
    }
    if(event==="SIGNED_OUT"){
      if(state.channel)db.removeChannel(state.channel);
      state.channel=null;state.transactions=[];state.categories=[];state.familyId=null;state.user=null;
      hide("app-shell");show("loginScreen");
    }
  });
  handleAuth();
}
