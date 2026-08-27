// Family Finance V2 — robust frontend-only build.
// Supabase will be connected later. For now data is stored in localStorage.

const DEFAULT_CATEGORIES = [
  ["Rent","bi-house-door"],
  ["Ooredoo Bill","bi-phone"],
  ["Vodafone Broadband","bi-wifi"],
  ["Kahramaa Bill","bi-lightning-charge"],
  ["EMI","bi-credit-card"],
  ["Petro","bi-fuel-pump"],
  ["Car Wash","bi-car-front"],
  ["Gym","bi-activity"],
  ["Medical","bi-heart-pulse"],
  ["Grocery","bi-cart3"],
  ["Cinema","bi-film"],
  ["Food","bi-egg-fried"],
  ["Other","bi-three-dots"]
];

const state = {
  transactions: [],
  categories: DEFAULT_CATEGORIES.map(([name, icon]) => ({ name, icon }))
};

function localDate() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function money(value) {
  return new Intl.NumberFormat("en-QA", {
    style: "currency",
    currency: "QAR",
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[c]));
}

function iconFor(category) {
  const item = state.categories.find(c => c.name === category);
  return item ? item.icon : "bi-three-dots";
}

function loadData() {
  // Categories: recover safely if an old/empty localStorage value exists.
  try {
    const savedCategories = JSON.parse(
      localStorage.getItem("familyFinanceCategories") || "null"
    );

    if (Array.isArray(savedCategories) && savedCategories.length > 0) {
      state.categories = savedCategories;
    }
  } catch (error) {
    console.warn("Could not read saved categories:", error);
  }

  // Transactions: migrate old "fund" transactions to the new "income" model.
  try {
    const savedTransactions = JSON.parse(
      localStorage.getItem("familyFinanceLocal") || "[]"
    );

    if (Array.isArray(savedTransactions)) {
      state.transactions = savedTransactions.map(t => ({
        ...t,
        type: t.type === "fund" ? "income" : t.type
      }));
    }
  } catch (error) {
    console.warn("Could not read saved transactions:", error);
    state.transactions = [];
  }

  saveData();
}

function saveData() {
  localStorage.setItem(
    "familyFinanceCategories",
    JSON.stringify(state.categories)
  );
  localStorage.setItem(
    "familyFinanceLocal",
    JSON.stringify(state.transactions)
  );
}

function renderCategories() {
  const select = document.getElementById("category");
  if (!select) return;

  // Always guarantee a visible category list.
  if (!state.categories.length) {
    state.categories = DEFAULT_CATEGORIES.map(([name, icon]) => ({ name, icon }));
  }

  select.innerHTML = state.categories.map(category =>
    `<option value="${escapeHtml(category.name)}">${escapeHtml(category.name)}</option>`
  ).join("");

  select.selectedIndex = 0;
}

function renderDashboard() {
  const income = state.transactions
    .filter(t => t.type === "income")
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const expenses = state.transactions
    .filter(t => t.type === "expense")
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const currentMonth = localDate().slice(0, 7);

  const monthExpenses = state.transactions
    .filter(t =>
      t.type === "expense" &&
      String(t.transaction_date || "").startsWith(currentMonth)
    )
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const balance = income - expenses;
  const percentage = income > 0
    ? Math.min(100, Math.max(0, (expenses / income) * 100))
    : 0;

  const balanceEl = document.getElementById("balance");
  const incomeTotalEl = document.getElementById("incomeTotal");
  const expenseTotalEl = document.getElementById("expenseTotal");
  const incomeStatEl = document.getElementById("incomeStat");
  const monthStatEl = document.getElementById("monthStat");
  const progressEl = document.getElementById("spendProgress");
  const progressLabelEl = document.getElementById("progressLabel");

  if (balanceEl) balanceEl.textContent = money(balance);
  if (incomeTotalEl) incomeTotalEl.textContent = `${money(income)} income`;
  if (expenseTotalEl) expenseTotalEl.textContent = `${money(expenses)} spent`;
  if (incomeStatEl) incomeStatEl.textContent = money(income);
  if (monthStatEl) monthStatEl.textContent = money(monthExpenses);

  if (progressEl) progressEl.style.width = `${percentage}%`;

  if (progressLabelEl) {
    progressLabelEl.textContent = income > 0
      ? `${percentage.toFixed(1)}% of income spent`
      : "Add income to start tracking spending";
  }

  renderTransactions();
}

function renderTransactions() {
  const container = document.getElementById("transactions");
  if (!container) return;

  const list = [...state.transactions]
    .sort((a, b) =>
      String(b.transaction_date || "").localeCompare(
        String(a.transaction_date || "")
      )
    )
    .slice(0, 8);

  if (!list.length) {
    container.innerHTML = `
      <div class="text-center text-secondary py-5">
        <i class="bi bi-receipt fs-3 d-block mb-2"></i>
        No transactions yet.
      </div>`;
    return;
  }

  container.innerHTML = list.map(t => {
    const isIncome = t.type === "income";
    const title = isIncome
      ? (t.category || "Income")
      : (t.category || "Other");

    return `
      <div class="transaction">
        <div class="tx-icon">
          <i class="bi ${isIncome ? "bi-arrow-down-left" : iconFor(t.category)}"></i>
        </div>

        <div class="tx-main">
          <div class="tx-name">${escapeHtml(title)}</div>
          <div class="tx-desc">
            ${escapeHtml(t.description || "No description")}
            · ${escapeHtml(t.transaction_date || "")}
          </div>
        </div>

        <div class="tx-amount ${isIncome ? "tx-income" : ""}">
          ${isIncome ? "+" : "-"} ${money(t.amount)}
        </div>
      </div>`;
  }).join("");
}

function showToast(message) {
  const toastEl = document.getElementById("appToast");
  if (!toastEl) return;

  const body = toastEl.querySelector(".toast-body");
  if (body) body.textContent = message;

  bootstrap.Toast.getOrCreateInstance(toastEl).show();
}

function closeModal(id) {
  const modalEl = document.getElementById(id);
  if (!modalEl) return;

  const modal = bootstrap.Modal.getInstance(modalEl);
  if (modal) modal.hide();
}

function setupForms() {
  const expenseForm = document.getElementById("expenseForm");

  if (expenseForm) {
    expenseForm.addEventListener("submit", event => {
      event.preventDefault();

      const amount = Number(document.getElementById("amount").value);

      if (!amount || amount <= 0) return;

      state.transactions.push({
        id: crypto.randomUUID(),
        type: "expense",
        amount,
        category: document.getElementById("category").value,
        description: document.getElementById("description").value.trim(),
        transaction_date: document.getElementById("date").value || localDate()
      });

      saveData();
      renderDashboard();

      expenseForm.reset();
      document.getElementById("date").value = localDate();

      closeModal("expenseModal");
      showToast("Expense added");
    });
  }

  const incomeForm = document.getElementById("incomeForm");

  if (incomeForm) {
    incomeForm.addEventListener("submit", event => {
      event.preventDefault();

      const amount = Number(document.getElementById("incomeAmount").value);

      if (!amount || amount <= 0) return;

      state.transactions.push({
        id: crypto.randomUUID(),
        type: "income",
        amount,
        category: document.getElementById("incomeSource").value,
        description: document.getElementById("incomeDescription").value.trim(),
        transaction_date: document.getElementById("incomeDate").value || localDate()
      });

      saveData();
      renderDashboard();

      incomeForm.reset();
      document.getElementById("incomeDate").value = localDate();

      closeModal("incomeModal");
      showToast("Income added");
    });
  }
}

function setupDefaults() {
  const date = document.getElementById("date");
  const incomeDate = document.getElementById("incomeDate");

  if (date) date.value = localDate();
  if (incomeDate) incomeDate.value = localDate();

  const viewAll = document.getElementById("viewAllBtn");
  if (viewAll) {
    viewAll.addEventListener("click", () => {
      showToast("Transactions screen is next");
    });
  }
}


function resetTestData() {
  // Clear storage first so the data is gone immediately.
  localStorage.removeItem("familyFinanceLocal");
  localStorage.removeItem("familyFinanceCategories");

  // Clear in-memory state immediately.
  state.transactions = [];
  state.categories = DEFAULT_CATEGORIES.map(([name, icon]) => ({
    name,
    icon
  }));

  // Refresh the visible UI immediately.
  renderCategories();
  renderDashboard();

  // Close confirmation and settings modals.
  closeModal("resetConfirmModal");
  closeModal("settingsModal");

  // Repaint once more after Bootstrap closes the modal.
  setTimeout(() => {
    renderCategories();
    renderDashboard();
    showToast("All data cleared");
  }, 150);

  // Reload after a short delay to guarantee a completely fresh state
  // and eliminate stale browser/GitHub Pages UI.
  setTimeout(() => {
    window.location.reload();
  }, 650);
}

function init() {
  loadData();
  renderCategories();
  setupDefaults();

  const confirmResetButton = document.getElementById("confirmResetBtn");
  if (confirmResetButton) {
    confirmResetButton.addEventListener("click", resetTestData);
  }

  setupForms();
  renderDashboard();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
