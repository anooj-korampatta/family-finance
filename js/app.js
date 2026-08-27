// V1 frontend-only mode.
// Supabase will be connected after the UI is verified.
// This avoids a missing config.js from breaking the entire app.

const DEFAULT_CATEGORIES = [
  ["Rent","bi-house-door"],["Ooredoo Bill","bi-phone"],["Vodafone Broadband","bi-wifi"],
  ["Kahramaa Bill","bi-lightning-charge"],["EMI","bi-credit-card"],["Petro","bi-fuel-pump"],
  ["Car Wash","bi-car-front"],["Gym","bi-activity"],["Medical","bi-heart-pulse"],
  ["Grocery-Lulu","bi-cart3"],["Cinema","bi-film"],["Food","bi-egg-fried"],["Baraha","bi-cup-straw"],["Other","bi-three-dots"]
];

const money = n => new Intl.NumberFormat("en-QA",{style:"currency",currency:"QAR",maximumFractionDigits:2}).format(Number(n||0));
const today = () => new Date().toISOString().slice(0,10);
const state = { transactions: [], categories: [] };

function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
function iconFor(name){return state.categories.find(c=>c.name===name)?.icon||"bi-three-dots";}

function loadData(){
  const savedCategories = JSON.parse(localStorage.getItem("familyFinanceCategories")||"null");
  state.categories = savedCategories || DEFAULT_CATEGORIES.map(([name,icon])=>({name,icon}));
  const savedTransactions = JSON.parse(localStorage.getItem("familyFinanceLocal")||"null");
  if(savedTransactions) state.transactions = savedTransactions;
}

function persist(){
  localStorage.setItem("familyFinanceCategories",JSON.stringify(state.categories));
  localStorage.setItem("familyFinanceLocal",JSON.stringify(state.transactions));
}

function renderCategories(){
  document.querySelector("#category").innerHTML = state.categories
    .map(c=>`<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join("");
}

function render(){
  const funds = state.transactions.filter(t=>t.type==="income").reduce((s,t)=>s+Number(t.amount),0);
  const expenses = state.transactions.filter(t=>t.type==="expense").reduce((s,t)=>s+Number(t.amount),0);
  const month=today().slice(0,7);
  const monthExpenses=state.transactions.filter(t=>t.type==="expense"&&String(t.transaction_date).startsWith(month))
    .reduce((s,t)=>s+Number(t.amount),0);
  const balance=funds-expenses;
  const pct=funds?Math.min(100,Math.max(0,expenses/funds*100)):0;

  document.querySelector("#balance").textContent=money(balance);
  document.querySelector("#incomeTotal").textContent=`${money(funds)} income`;
  document.querySelector("#expenseTotal").textContent=`${money(expenses)} spent`;
  document.querySelector("#incomeStat").textContent=money(funds);
  document.querySelector("#monthStat").textContent=money(monthExpenses);
  document.querySelector("#spendProgress").style.width=`${pct}%`;
  document.querySelector("#progressLabel").textContent=funds?`${pct.toFixed(1)}% of income spent`:"No spending yet";

  const list=[...state.transactions].sort((a,b)=>String(b.transaction_date).localeCompare(String(a.transaction_date))).slice(0,8);
  document.querySelector("#transactions").innerHTML=list.length?list.map(t=>`
    <div class="transaction">
      <div class="tx-icon"><i class="bi ${t.type==="income"?"bi-arrow-down-left":iconFor(t.category)}"></i></div>
      <div class="tx-main"><div class="tx-name">${escapeHtml(t.category)}</div>
      <div class="tx-desc">${escapeHtml(t.description||"No description")} · ${escapeHtml(t.transaction_date)}</div></div>
      <div class="tx-amount ${t.type==="income"?"tx-income":""}">${t.type==="income"?"+":"-"} ${money(t.amount)}</div>
    </div>`).join(""):`<div class="text-center text-secondary py-5">No transactions yet.</div>`;
}

function toast(message){
  const el=document.querySelector("#appToast");el.querySelector(".toast-body").textContent=message;
  bootstrap.Toast.getOrCreateInstance(el).show();
}

loadData();
renderCategories();
document.querySelector("#date").value=today();
document.querySelector("#incomeDate").value=today();
render();

document.querySelector("#expenseForm").addEventListener("submit",e=>{
  e.preventDefault();
  state.transactions.push({
    id:crypto.randomUUID(),type:"expense",amount:Number(document.querySelector("#amount").value),
    category:document.querySelector("#category").value,description:document.querySelector("#description").value.trim(),
    transaction_date:document.querySelector("#date").value
  });
  persist();e.target.reset();document.querySelector("#date").value=today();
  bootstrap.Modal.getInstance(document.querySelector("#expenseModal")).hide();render();toast("Expense added");
});

document.querySelector("#incomeForm").addEventListener("submit",e=>{
  e.preventDefault();
  const source=document.querySelector("#incomeSource").value;
  state.transactions.push({
    id:crypto.randomUUID(),type:"income",amount:Number(document.querySelector("#incomeAmount").value),
    category:source,description:document.querySelector("#incomeDescription").value.trim(),
    transaction_date:document.querySelector("#incomeDate").value
  });
  persist();e.target.reset();document.querySelector("#incomeDate").value=today();
  bootstrap.Modal.getInstance(document.querySelector("#incomeModal")).hide();render();toast("Income added");
});

document.querySelector("#viewAllBtn").addEventListener("click",()=>toast("Transactions screen is next"));


// Settings / reset controls
function showAppModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  bootstrap.Modal.getOrCreateInstance(el).show();
}

function hideAppModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  bootstrap.Modal.getOrCreateInstance(el).hide();
}

function resetAllData() {
  localStorage.removeItem("familyFinanceLocal");
  localStorage.removeItem("familyFinanceCategories");
  state.transactions = [];
  state.categories = DEFAULT_CATEGORIES.map(([name, icon]) => ({ name, icon }));
  renderCategories();
  render();
  hideAppModal("resetConfirmModal");
  hideAppModal("settingsModal");
  setTimeout(() => toast("All data cleared"), 150);
}

function setupSettings() {
  const settings = document.querySelector("#settingsBtn");
  const close = document.querySelector("#closeSettingsBtn");
  const reset = document.querySelector("#resetDataBtn");
  const cancel = document.querySelector("#cancelResetBtn");
  const confirm = document.querySelector("#confirmResetBtn");
  if (settings) settings.addEventListener("click", () => showAppModal("settingsModal"));
  if (close) close.addEventListener("click", () => hideAppModal("settingsModal"));
  if (reset) reset.addEventListener("click", () => showAppModal("resetConfirmModal"));
  if (cancel) cancel.addEventListener("click", () => hideAppModal("resetConfirmModal"));
  if (confirm) confirm.addEventListener("click", resetAllData);
}

setupSettings();
