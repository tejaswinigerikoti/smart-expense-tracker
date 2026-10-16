
"use strict";

const $ = (id) => document.getElementById(id);

const expenseCategories = [
  "Food", "Transport", "Shopping", "Bills", "Rent",
  "Education", "Health", "Entertainment", "Travel",
  "Groceries", "Personal Care", "Other"
];

const incomeCategories = [
  "Salary", "Freelance", "Business", "Investment",
  "Gift", "Other Income"
];

const sectionTitles = {
  dashboardSection: "Dashboard",
  addSection: "Add Transaction",
  transactionsSection: "Transactions",
  reportsSection: "Reports & Analytics",
  categorySection: "Expenses by Category"
};

let currentUser = null;
let allExpenses = [];
let visibleExpenses = [];
let authMode = "login";
let charts = {};

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function money(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return "—";

  const parts = String(value).slice(0, 10).split("-");

  if (parts.length !== 3) return escapeHTML(value);

  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function setMessage(elementId, message, isError = false) {
  const element = $(elementId);

  element.textContent = message;
  element.className = "message " + (
    message ? (isError ? "error" : "success") : ""
  );
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "Something went wrong.");
  }

  return data;
}

function showAuthPage() {
  currentUser = null;
  allExpenses = [];
  visibleExpenses = [];

  $("appPage").classList.add("hidden");
  $("authPage").classList.remove("hidden");

  setMessage("authMessage", "");
}

function showAppPage(user) {
  currentUser = user;

  $("authPage").classList.add("hidden");
  $("appPage").classList.remove("hidden");

  $("sideUserName").textContent = user.name;
  $("headerUserName").textContent = user.name;
  $("headerUserEmail").textContent = user.email;
  $("welcomeName").textContent = user.name.split(/\s+/)[0];

  document.querySelector(".avatar").textContent =
    user.name.trim().charAt(0).toUpperCase() || "U";

  resetTransactionForm();
  showSection("dashboardSection");
}

function setAuthMode(mode) {
  authMode = mode;

  const isRegister = mode === "register";

  $("nameGroup").classList.toggle("hidden", !isRegister);
  $("authName").required = isRegister;

  $("authPassword").autocomplete = isRegister
    ? "new-password"
    : "current-password";

  $("loginTab").classList.toggle("active", !isRegister);
  $("registerTab").classList.toggle("active", isRegister);

  $("authSubmit").textContent = isRegister
    ? "Create Account"
    : "Login";

  $("authPassword").value = "";
  setMessage("authMessage", "");
}

$("loginTab").addEventListener("click", () => setAuthMode("login"));
$("registerTab").addEventListener("click", () => setAuthMode("register"));

$("authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("authMessage", "");

  const payload = {
    email: $("authEmail").value.trim(),
    password: $("authPassword").value
  };

  if (authMode === "register") {
    payload.name = $("authName").value.trim();
  }

  $("authSubmit").disabled = true;
  $("authSubmit").textContent = "Please wait...";

  try {
    const result = await api(
      authMode === "register" ? "/api/register" : "/api/login",
      {
        method: "POST",
        body: JSON.stringify(payload)
      }
    );

    $("authPassword").value = "";

    showAppPage(result.user);
    await refreshExpenses();

    setMessage("appMessage", result.message || "Welcome!");
  } catch (error) {
    setMessage("authMessage", error.message, true);
  } finally {
    $("authSubmit").disabled = false;
    $("authSubmit").textContent =
      authMode === "register" ? "Create Account" : "Login";
  }
});

$("logoutBtn").addEventListener("click", async () => {
  try {
    await api("/api/logout", { method: "POST" });

    Object.values(charts).forEach((chart) => chart.destroy());
    charts = {};

    showAuthPage();
    setAuthMode("login");
  } catch (error) {
    setMessage("appMessage", error.message, true);
  }
});

function showSection(sectionId) {
  if (!sectionTitles[sectionId]) return;

  document.querySelectorAll(".content-section").forEach((section) => {
    section.classList.toggle("hidden", section.id !== sectionId);
  });

  document.querySelectorAll(".nav-link").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.section === sectionId
    );
  });

  $("pageTitle").textContent = sectionTitles[sectionId];
  setMessage("appMessage", "");

  if (sectionId === "transactionsSection") {
    renderTransactions();
  }

  if (sectionId === "categorySection") {
    renderCategoryBreakdown();
  }
}

document.querySelectorAll(".nav-link").forEach((button) => {
  button.addEventListener("click", () => {
    showSection(button.dataset.section);
  });
});

document.querySelectorAll("[data-go]").forEach((button) => {
  button.addEventListener("click", () => {
    showSection(button.dataset.go);
  });
});

function updateCategoryOptions(selected = "") {
  const categories = $("transactionType").value === "income"
    ? incomeCategories
    : expenseCategories;

  $("transactionCategory").innerHTML = categories.map((category) =>
    `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`
  ).join("");

  if (selected && categories.includes(selected)) {
    $("transactionCategory").value = selected;
  }
}

function updateFilterCategories() {
  const previous = $("filterCategory").value;

  const categories = [...new Set([
    ...expenseCategories,
    ...incomeCategories
  ])];

  $("filterCategory").innerHTML =
    '<option value="All">All categories</option>' +
    categories.map((category) =>
      `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`
    ).join("");

  if (categories.includes(previous)) {
    $("filterCategory").value = previous;
  }
}

$("transactionType").addEventListener("change", () => {
  updateCategoryOptions();
});

function resetTransactionForm() {
  $("transactionForm").reset();
  $("editId").value = "";
  $("transactionType").value = "expense";

  const today = new Date();
  const localToday = new Date(
    today.getTime() - today.getTimezoneOffset() * 60000
  ).toISOString().slice(0, 10);

  $("transactionDate").value = localToday;
  $("transactionFormTitle").textContent = "Add a Transaction";
  $("saveTransactionBtn").textContent = "Save Transaction";
  $("cancelEditBtn").classList.add("hidden");

  updateCategoryOptions();
}

$("transactionForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const id = $("editId").value;
  const category = $("transactionCategory").value;

  // The category automatically becomes the transaction title.
  const transaction = {
    title: category,
    amount: Number($("transactionAmount").value),
    category,
    transaction_type: $("transactionType").value,
    payment_method: $("paymentMethod").value,
    expense_date: $("transactionDate").value,
    notes: $("transactionNotes").value.trim()
  };

  if (
    !category ||
    !transaction.expense_date ||
    !Number.isFinite(transaction.amount) ||
    transaction.amount <= 0
  ) {
    setMessage(
      "appMessage",
      "Please enter a valid amount and complete the required fields.",
      true
    );
    return;
  }

  $("saveTransactionBtn").disabled = true;

  try {
    const result = await api(
      id ? `/api/expenses/${encodeURIComponent(id)}` : "/api/expenses",
      {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(transaction)
      }
    );

    resetTransactionForm();
    await refreshExpenses();

    showSection("transactionsSection");
    setMessage("appMessage", result.message || "Transaction saved.");
  } catch (error) {
    setMessage("appMessage", error.message, true);
  } finally {
    $("saveTransactionBtn").disabled = false;
  }
});

$("cancelEditBtn").addEventListener("click", () => {
  resetTransactionForm();
  showSection("transactionsSection");
});

function startEditing(id) {
  const expense = allExpenses.find(
    (item) => Number(item.id) === Number(id)
  );

  if (!expense) {
    setMessage("appMessage", "Transaction not found.", true);
    return;
  }

  showSection("addSection");

  $("editId").value = expense.id;
  $("transactionType").value = expense.transaction_type;

  updateCategoryOptions(expense.category);

  $("transactionAmount").value = Number(expense.amount);
  $("paymentMethod").value = expense.payment_method || "Other";
  $("transactionDate").value = String(expense.expense_date).slice(0, 10);
  $("transactionNotes").value = expense.notes || "";

  $("transactionFormTitle").textContent = "Edit Transaction";
  $("saveTransactionBtn").textContent = "Update Transaction";
  $("cancelEditBtn").classList.remove("hidden");
}

async function deleteTransaction(id) {
  const expense = allExpenses.find(
    (item) => Number(item.id) === Number(id)
  );

  if (!expense) return;

  if (!window.confirm(
    `Delete the ${expense.category} transaction permanently?`
  )) {
    return;
  }

  try {
    const result = await api(
      `/api/expenses/${encodeURIComponent(id)}`,
      { method: "DELETE" }
    );

    await refreshExpenses();
    setMessage("appMessage", result.message || "Transaction deleted.");
  } catch (error) {
    setMessage("appMessage", error.message, true);
  }
}

$("transactionsTable").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");

  if (!button) return;

  const id = button.dataset.id;

  if (button.dataset.action === "edit") {
    startEditing(id);
  } else if (button.dataset.action === "delete") {
    deleteTransaction(id);
  }
});

async function refreshExpenses() {
  try {
    const result = await api("/api/expenses");

    allExpenses = result.expenses || [];
    visibleExpenses = [...allExpenses];

    updateFilterCategories();
    renderDashboard();
    renderTransactions();
    renderReports();
    renderCategoryBreakdown();
  } catch (error) {
    setMessage("appMessage", error.message, true);
  }
}

function getTotals(expenses) {
  let income = 0;
  let expensesTotal = 0;

  expenses.forEach((item) => {
    const amount = Number(item.amount) || 0;

    if (item.transaction_type === "income") {
      income += amount;
    } else {
      expensesTotal += amount;
    }
  });

  return {
    income,
    expenses: expensesTotal,
    balance: income - expensesTotal
  };
}

function renderDashboard() {
  const totals = getTotals(allExpenses);

  $("totalBalance").textContent = money(totals.balance);
  $("totalIncome").textContent = money(totals.income);
  $("totalExpenses").textContent = money(totals.expenses);
  $("transactionCount").textContent = String(allExpenses.length);

  const recent = allExpenses.slice(0, 5);

  $("recentTable").innerHTML = recent.length
    ? recent.map((item) => `
      <tr>
        <td>${escapeHTML(item.category)}</td>
        <td>${formatDate(item.expense_date)}</td>
        <td>
          <span class="type-pill ${item.transaction_type}">
            ${item.transaction_type === "income" ? "Income" : "Expense"}
          </span>
        </td>
        <td class="right ${
          item.transaction_type === "income"
            ? "amount-income"
            : "amount-expense"
        }">
          ${item.transaction_type === "income" ? "+" : "−"}${money(item.amount)}
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="4" class="empty-state">
        No transactions yet. Add your first transaction.
      </td></tr>`;

  drawOverviewChart(totals);
  drawOverviewCategoryChart();
}

function drawChart(id, config) {
  if (charts[id]) {
    charts[id].destroy();
  }

  const canvas = $(id);

  if (!canvas || typeof Chart === "undefined") return;

  charts[id] = new Chart(canvas, config);
}

function drawOverviewChart(totals) {
  drawChart("overviewChart", {
    type: "bar",
    data: {
      labels: ["Income", "Expenses"],
      datasets: [{
        label: "Amount (₹)",
        data: [totals.income, totals.expenses],
        backgroundColor: ["#159b72", "#df5264"],
        borderRadius: 7,
        maxBarThickness: 70
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function getCategoryTotals(expenses) {
  const totals = {};

  expenses.forEach((item) => {
    if (item.transaction_type !== "expense") return;

    const category = item.category || "Other";
    totals[category] = (totals[category] || 0) + Number(item.amount);
  });

  return Object.entries(totals).sort((a, b) => b[1] - a[1]);
}

function drawOverviewCategoryChart() {
  const data = getCategoryTotals(allExpenses);

  drawChart("overviewCategoryChart", {
    type: "doughnut",
    data: {
      labels: data.map((item) => item[0]),
      datasets: [{
        data: data.map((item) => item[1]),
        backgroundColor: [
          "#6558e8", "#159b72", "#e4a53d", "#df5264",
          "#4097d7", "#a56be0", "#4ab8bd", "#ed8752",
          "#83934e", "#e67bb1", "#8d9db9", "#999999"
        ],
        borderWidth: 2,
        borderColor: "#ffffff"
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } }
    }
  });
}

/* Search using one specific date. */
function renderTransactions() {
  const selectedDate = $("filterDate").value;
  const type = $("filterType").value;
  const category = $("filterCategory").value;

  visibleExpenses = allExpenses.filter((item) => {
    const date = String(item.expense_date).slice(0, 10);

    if (selectedDate && date !== selectedDate) {
      return false;
    }

    if (type && item.transaction_type !== type) {
      return false;
    }

    if (
      category &&
      category !== "All" &&
      item.category !== category
    ) {
      return false;
    }

    return true;
  });

  $("transactionsTable").innerHTML = visibleExpenses.length
    ? visibleExpenses.map((item) => `
      <tr>
        <td>${escapeHTML(item.category)}</td>
        <td>${formatDate(item.expense_date)}</td>
        <td>
          <span class="type-pill ${item.transaction_type}">
            ${item.transaction_type === "income" ? "Income" : "Expense"}
          </span>
        </td>
        <td class="right ${
          item.transaction_type === "income"
            ? "amount-income"
            : "amount-expense"
        }">
          ${item.transaction_type === "income" ? "+" : "−"}${money(item.amount)}
        </td>
        <td>
          <button class="table-action edit-btn"
                  data-action="edit"
                  data-id="${Number(item.id)}">Edit</button>
          <button class="table-action delete-btn"
                  data-action="delete"
                  data-id="${Number(item.id)}">Delete</button>
        </td>
      </tr>
    `).join("")
    : `<tr>
        <td colspan="5" class="empty-state">
          No transactions found for the selected filters.
        </td>
      </tr>`;

  $("transactionTableCount").textContent =
    `${visibleExpenses.length} transaction(s) found`;
}

$("filterForm").addEventListener("submit", (event) => {
  event.preventDefault();
  setMessage("appMessage", "");
  renderTransactions();
});

$("clearFiltersBtn").addEventListener("click", () => {
  $("filterForm").reset();
  $("filterCategory").value = "All";
  setMessage("appMessage", "");
  renderTransactions();
});

function renderReports() {
  const totals = getTotals(allExpenses);

  $("reportIncome").textContent = money(totals.income);
  $("reportExpenses").textContent = money(totals.expenses);
  $("reportSavings").textContent = money(totals.balance);

  const categories = getCategoryTotals(allExpenses);

  drawChart("reportCategoryChart", {
    type: "pie",
    data: {
      labels: categories.map((item) => item[0]),
      datasets: [{
        data: categories.map((item) => item[1]),
        backgroundColor: [
          "#6558e8", "#159b72", "#e4a53d", "#df5264",
          "#4097d7", "#a56be0", "#4ab8bd", "#ed8752",
          "#83934e", "#e67bb1", "#8d9db9", "#999999"
        ]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } }
    }
  });

  drawChart("reportBarChart", {
    type: "bar",
    data: {
      labels: ["Income", "Expenses", "Net Savings"],
      datasets: [{
        label: "Amount (₹)",
        data: [totals.income, totals.expenses, totals.balance],
        backgroundColor: ["#159b72", "#df5264", "#6558e8"],
        borderRadius: 7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function renderCategoryBreakdown() {
  const categories = getCategoryTotals(allExpenses);
  const total = categories.reduce((sum, item) => sum + item[1], 0);

  $("categoryBreakdown").innerHTML = categories.length
    ? categories.map(([name, amount]) => {
      const percentage = total ? (amount / total) * 100 : 0;

      return `
        <div class="category-item">
          <div class="category-info">
            <strong>${escapeHTML(name)}</strong>
            <span>${money(amount)} · ${percentage.toFixed(1)}%</span>
          </div>
          <div class="progress-track">
            <div class="progress-bar"
                 style="width:${percentage.toFixed(2)}%"></div>
          </div>
        </div>
      `;
    }).join("")
    : `<p class="empty-state">No expense categories to display yet.</p>`;
}

function csvCell(value) {
  return '"' + String(value ?? "").replace(/"/g, '""') + '"';
}

$("exportBtn").addEventListener("click", () => {
  if (!allExpenses.length) {
    setMessage("appMessage", "There are no transactions to export.", true);
    return;
  }

  const columns = [
    "Category", "Amount", "Type",
    "Payment Method", "Date", "Notes"
  ];

  const rows = allExpenses.map((item) => [
    item.category,
    item.amount,
    item.transaction_type,
    item.payment_method,
    String(item.expense_date).slice(0, 10),
    item.notes || ""
  ]);

  const csv = "\uFEFF" + [
    columns,
    ...rows
  ].map((row) => row.map(csvCell).join(",")).join("\r\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "smart-expense-transactions.csv";

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);

  setMessage("appMessage", "CSV export downloaded.");
});

async function initializeApp() {
  updateCategoryOptions();
  updateFilterCategories();
  resetTransactionForm();

  try {
    const result = await api("/api/me");
    showAppPage(result.user);
    await refreshExpenses();
  } catch {
    showAuthPage();
  }
}

initializeApp();
