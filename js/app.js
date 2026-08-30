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
const state = { transactions: [], categories: [], familyId: null, user: null, channel: null, loading: false };
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

function render(){
  const funds=state.transactions.filter(t=>t.type==="income").reduce((s,t)=>s+Number(t.amount||0),0);
  const expenses=state.transactions.filter(t=>t.type==="expense").reduce((s,t)=>s+Number(t.amount||0),0);
  const month=today().slice(0,7);
  const monthExpenses=state.transactions.filter(t=>t.type==="expense"&&String(t.transaction_date).startsWith(month)).reduce((s,t)=>s+Number(t.amount||0),0);
  const pct=funds?Math.min(100,Math.max(0,expenses/funds*100)):0;
  document.querySelector("#balance").textContent=money(funds-expenses);
  document.querySelector("#incomeTotal").textContent=`${money(funds)} income`;
  document.querySelector("#expenseTotal").textContent=`${money(expenses)} spent`;
  document.querySelector("#incomeStat").textContent=money(funds);
  document.querySelector("#monthStat").textContent=money(monthExpenses);
  document.querySelector("#spendProgress").style.width=`${pct}%`;
  document.querySelector("#progressLabel").textContent=funds?`${pct.toFixed(1)}% of income spent`:"Add income to start tracking spending";
  const list=[...state.transactions].slice(0,8);
  document.querySelector("#transactions").innerHTML=list.length?list.map(t=>`
    <div class="transaction">
      <div class="tx-icon"><i class="bi ${t.type==="income"?"bi-arrow-down-left":iconFor(t.category)}"></i></div>
      <div class="tx-main"><div class="tx-name">${escapeHtml(t.category)}</div>
      <div class="tx-desc">${escapeHtml(t.description||"No description")} · ${escapeHtml(t.transaction_date)}</div></div>
      <div class="tx-amount ${t.type==="income"?"tx-income":""}">${t.type==="income"?"+":"-"} ${money(t.amount)}</div>
    </div>`).join(""):`<div class="text-center text-secondary py-5">No transactions yet.</div>`;
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
    e.preventDefault();const button=e.submitter;setBusy(button,true,"Saving…");
    try{await addTransaction("expense",e.target);e.target.reset();document.querySelector("#date").value=today();hideModal("expenseModal");toast("Expense added");}
    catch(error){toast(error.message);}
    finally{setBusy(button,false,"Add expense");}
  });
  document.querySelector("#incomeForm").addEventListener("submit",async e=>{
    e.preventDefault();const button=e.submitter;setBusy(button,true,"Saving…");
    try{await addTransaction("income",e.target);e.target.reset();document.querySelector("#incomeDate").value=today();hideModal("incomeModal");toast("Income added");}
    catch(error){toast(error.message);}
    finally{setBusy(button,false,"Add income");}
  });
  document.querySelector("#categorySearch").addEventListener("input",e=>renderCategoryChips(e.target.value));
  document.querySelector("#settingsBtn").addEventListener("click",()=>{document.querySelector("#currentUser").textContent=state.user?.email||"";showModal("settingsModal");});
  document.querySelector("#closeSettingsBtn").addEventListener("click",()=>hideModal("settingsModal"));
  document.querySelector("#resetDataBtn").addEventListener("click",()=>showModal("resetConfirmModal"));
  document.querySelector("#cancelResetBtn").addEventListener("click",()=>hideModal("resetConfirmModal"));
  document.querySelector("#confirmResetBtn").addEventListener("click",async()=>{try{await resetAllData();}catch(error){toast(error.message);}});
  document.querySelector("#logoutBtn").addEventListener("click",async()=>{hideModal("settingsModal");await signOut();});
  document.querySelector("#viewAllBtn").addEventListener("click",()=>toast("Full transaction history is next"));
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
