const $ = (id) => document.getElementById(id);

const API_URL = (() => {
  const host = window.location.hostname;
  if (host.includes('app.github.dev')) {
    return window.location.origin.replace('-8080.', '-3000.');
  }
  return 'http://localhost:3000';
})();

let currentUser = null;
let currentGroupId = localStorage.getItem('currentGroupId');
let groups = [];
let members = [];
let categories = [];
let latestSplitPreview = null;



function getActiveGroupId() {
  if (currentGroupId) {
    return currentGroupId;
  }

  const savedGroupId = localStorage.getItem("currentGroupId");

  if (savedGroupId) {
    currentGroupId = savedGroupId;
    return currentGroupId;
  }

  const groupSelect = document.getElementById("activeGroupSelect");

  if (groupSelect && groupSelect.value) {
    currentGroupId = groupSelect.value;
    localStorage.setItem("currentGroupId", currentGroupId);
    return currentGroupId;
  }

  if (groups && groups.length > 0) {
    currentGroupId = groups[0].group_id;
    localStorage.setItem("currentGroupId", currentGroupId);
    return currentGroupId;
  }

  return null;

}
function groupSplitKey() {
  return `expenseSplitter:splits:${currentGroupId || 'none'}`;
}

function getLocalSplits() {
  try {
    return JSON.parse(localStorage.getItem(groupSplitKey())) || [];
  } catch {
    return [];
  }
}

function setLocalSplits(items) {
  localStorage.setItem(groupSplitKey(), JSON.stringify(items));
}

function money(value, currency = '') {
  const num = Number(value || 0);
  return `${currency ? currency + ' ' : ''}${num.toFixed(2)}`;
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function pickFirst(obj, keys) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
  }
  return null;
}

function normaliseDebtRow(row) {
  const payerId = pickFirst(row, ['payer_id', 'debtor_id', 'from_user_id', 'owes_user_id']);
  const receiverId = pickFirst(row, ['receiver_id', 'creditor_id', 'to_user_id', 'owed_to_user_id']);
  const amountRaw = pickFirst(row, ['amount', 'debt_amount', 'amount_owed', 'total', 'balance']);
  const amount = roundMoney(amountRaw);

  if ((!payerId && !pickFirst(row, ['payer_name', 'debtor_name'])) ||
      (!receiverId && !pickFirst(row, ['receiver_name', 'creditor_name'])) ||
      !amount || amount <= 0) {
    return null;
  }

  const payerMember = members.find(m => Number(m.user_id) === Number(payerId));
  const receiverMember = members.find(m => Number(m.user_id) === Number(receiverId));

  return {
    payer_id: Number(payerId),
    payer_name: pickFirst(row, ['payer_name', 'debtor_name', 'from_name']) || payerMember?.name || `User ${payerId}`,
    receiver_id: Number(receiverId),
    receiver_name: pickFirst(row, ['receiver_name', 'creditor_name', 'to_name']) || receiverMember?.name || `User ${receiverId}`,
    amount
  };
}


async function api(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  let data = null;
  try { data = await response.json(); } catch { data = null; }

  if (!response.ok) {
    throw new Error(data?.error || `Request failed: ${response.status}`);
  }

  return data;
}

function setMessage(id, text, type = '') {
  const el = $(id);
  if (!el) return;
  el.innerText = text || '';
  el.className = `message ${type}`.trim();
}

function clearAuthFields() {
  ['loginEmail', 'loginPassword', 'signupName', 'signupEmail', 'signupPassword'].forEach(id => {
    if ($(id)) $(id).value = '';
  });
  setMessage('loginMessage', '', '');
  setMessage('signupMessage', '', '');
}

document.addEventListener('DOMContentLoaded', initialiseApp);

function initialiseApp() {
  const savedUser = localStorage.getItem('currentUser');
  if (!savedUser) return showAuth();

  try {
    currentUser = JSON.parse(savedUser);
    if (!currentUser?.user_id) throw new Error('Invalid saved user');
    showApp();
  } catch {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('currentGroupId');
    showAuth();
  }
}

function showAuth() {
  $('authScreen').classList.remove('hidden');
  $('appScreen').classList.add('hidden');
  showLoginPanel();
  clearAuthFields();
}

function showLoginPanel() {
  $('loginPanel').classList.remove('hidden');
  $('signupPanel').classList.add('hidden');
  setMessage('loginMessage', '', '');
  setMessage('signupMessage', '', '');
}

function showSignupPanel() {
  $('signupPanel').classList.remove('hidden');
  $('loginPanel').classList.add('hidden');
  setMessage('loginMessage', '', '');
  setMessage('signupMessage', '', '');
}

async function showApp() {
  $('authScreen').classList.add('hidden');
  $('appScreen').classList.remove('hidden');
  setUserUI();
  await loadInitialData();
  showView('dashboardView');
}

function setUserUI() {
  const initial = (currentUser?.name || 'U').charAt(0).toUpperCase();
  $('sidebarInitial').innerText = initial;
  $('sidebarName').innerText = currentUser?.name || 'User';
  $('sidebarEmail').innerText = currentUser?.email || '';
  $('welcomeName').innerText = currentUser?.name || 'User';
  $('profileName').value = currentUser?.name || '';
  $('profileEmail').value = currentUser?.email || '';
}

function logoutUser() {
  localStorage.removeItem('currentUser');
  localStorage.removeItem('currentGroupId');
  currentUser = null;
  currentGroupId = null;
  groups = [];
  members = [];
  categories = [];
  latestSplitPreview = null;
  showAuth();
}

async function signupUser() {
  const name = $('signupName').value.trim();
  const email = $('signupEmail').value.trim();
  const password = $('signupPassword').value;

  if (!name || !email || !password) return setMessage('signupMessage', 'Please fill in all fields.', 'error');
  if (password.length < 6) return setMessage('signupMessage', 'Password must be at least 6 characters.', 'error');

  try {
    await api('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
    setMessage('signupMessage', 'Account created. Please login.', 'success');
    $('loginEmail').value = email;
    $('signupName').value = '';
    $('signupEmail').value = '';
    $('signupPassword').value = '';
    setTimeout(showLoginPanel, 700);
  } catch (err) {
    setMessage('signupMessage', err.message || 'Signup failed.', 'error');
  }
}

async function loginUser() {
  const email = $('loginEmail').value.trim();
  const password = $('loginPassword').value;

  if (!email || !password) return setMessage('loginMessage', 'Please enter email and password.', 'error');

  try {
    const user = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    localStorage.removeItem('currentUser');
    localStorage.removeItem('currentGroupId');
    currentUser = user;
    currentGroupId = null;
    groups = [];
    members = [];
    categories = [];
    localStorage.setItem('currentUser', JSON.stringify(user));

    setMessage('loginMessage', 'Login successful.', 'success');
    setTimeout(showApp, 350);
  } catch (err) {
    setMessage('loginMessage', err.message || 'Login failed. Please check details.', 'error');
  }
}

function showView(viewId, btn = null) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
  $(viewId).classList.add('active-view');

  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  const nav = btn || document.querySelector(`.nav-item[data-view="${viewId}"]`);
  if (nav) nav.classList.add('active');

  const titles = {
    dashboardView: ['Dashboard', 'Let’s sort this month’s shared bills.'],
    groupsView: ['My Groups', 'Create a group for your flat, trip or friends.'],
    billView: ['Add Bill', 'Add bill details and let the app calculate the split.'],
    owesView: ['Who Owes Who', 'See simplified balances for your selected group.'],
    budgetsView: ['Budgets', 'Set monthly limits for shared expenses.'],
    activityView: ['Activity', 'Notifications and group updates.'],
    profileView: ['Profile', 'Manage your account details.'],
  };
  $('pageHeading').innerText = titles[viewId]?.[0] || 'Expense Splitter';
  $('pageSubtitle').innerHTML = titles[viewId]?.[1] || '';
if (viewId === "dashboardView") {
  setTimeout(loadActualSpendingOverview, 300);
}
  if (viewId === 'dashboardView') refreshDashboard();
  if (viewId === 'groupsView') loadGroups();
  if (viewId === 'billView') loadBillWorkspace();
  if (viewId === 'owesView') loadDebts();
  if (viewId === 'budgetsView') loadBudgets();
  if (viewId === 'activityView') loadNotifications();
}

async function loadInitialData() {
  await loadCategories();
  await loadGroups();
  await refreshDashboard();
}

async function loadCategories() {
  try {
    categories = await api('/categories');
  } catch {
    categories = [];
  }
  renderCategorySelects();
}

function renderCategorySelects() {
  const options = categories.length
    ? categories.map(c => `<option value="${c.category_id}">${c.category_name}</option>`).join('')
    : `<option value="">No categories found</option>`;
  if ($('expenseCategory')) $('expenseCategory').innerHTML = options;
  if ($('budgetCategory')) $('budgetCategory').innerHTML = options;
}

async function loadGroups() {
  if (!currentUser) return;
  try {
    groups = await api(`/groups?user_id=${currentUser.user_id}`);
  } catch (err) {
    groups = [];
    console.error(err);
  }

  if (!currentGroupId && groups.length) currentGroupId = String(groups[0].group_id);
  if (currentGroupId) localStorage.setItem('currentGroupId', currentGroupId);

  renderGroups();
  renderActiveGroupSelect();
  if (currentGroupId) await loadMembers();
}

function renderGroups() {
  const box = $('groupsList');
  if (!box) return;
  if (!groups.length) {
    box.innerHTML = `<div class="empty-state">No groups yet. Create your first group.</div>`;
    return;
  }

  box.innerHTML = groups.map(group => `
    <div class="group-card ${String(group.group_id) === String(currentGroupId) ? 'active' : ''}" onclick="selectGroup(${group.group_id})">
      <div class="item-row">
        <div>
          <p class="item-title">${group.group_name}</p>
          <p class="item-sub">Currency: ${group.currency}</p>
        </div>
        <span>→</span>
      </div>
    </div>
  `).join('');
}

async function createGroup() {
  const group_name = $('groupName').value.trim();
  const currency = $('groupCurrency').value;
  if (!group_name) return setMessage('groupMessage', 'Please enter group name.', 'error');

  try {
    const group = await api('/groups', {
      method: 'POST',
      body: JSON.stringify({ group_name, currency, created_by: currentUser.user_id }),
    });
    currentGroupId = String(group.group_id);
    localStorage.setItem('currentGroupId', currentGroupId);
    $('groupName').value = '';
    setMessage('groupMessage', 'Group created successfully.', 'success');
    await loadGroups();
    showView('billView');
  } catch (err) {
    setMessage('groupMessage', err.message || 'Failed to create group.', 'error');
  }
}

async function selectGroup(groupId) {
  currentGroupId = String(groupId);
  localStorage.setItem('currentGroupId', currentGroupId);
  renderGroups();
  renderActiveGroupSelect();
  await loadBillWorkspace();
  showView('billView');
}

function renderActiveGroupSelect() {
  const select = $('activeGroupSelect');
  if (!select) return;
  select.innerHTML = groups.length
    ? groups.map(g => `<option value="${g.group_id}" ${String(g.group_id) === String(currentGroupId) ? 'selected' : ''}>${g.group_name}</option>`).join('')
    : `<option value="">No groups</option>`;
}

async function changeActiveGroup() {
  currentGroupId = $('activeGroupSelect').value;
  localStorage.setItem('currentGroupId', currentGroupId);
  await loadBillWorkspace();
}

async function loadBillWorkspace() {
  const group = groups.find(g => String(g.group_id) === String(currentGroupId));
  $('activeGroupName').innerText = group ? group.group_name : 'Select a group';
  $('activeGroupCurrency').innerText = group ? `Currency: ${group.currency}` : 'Create or select a group first.';
  if (group) $('expenseCurrency').value = group.currency || 'AUD';
  renderActiveGroupSelect();
  await loadMembers();
  await loadExpenses();
  await loadDebts();
  await loadBudgets();
}

async function loadMembers() {
  if (!currentGroupId) return;
  try {
    members = await api(`/groups/${currentGroupId}/members`);
  } catch {
    members = [];
  }
  renderMembers();
  renderMemberSelectors();
}

function renderMembers() {
  const list = $('membersList');
  if (!list) return;
  if (!members.length) {
    list.innerHTML = `<div class="empty-state">No members yet. Add members by email.</div>`;
    return;
  }
  list.innerHTML = members.map(m => `
    <div class="list-card">
      <div class="item-row">
        <div>
          <p class="item-title">${m.name}</p>
          <p class="item-sub">${m.email} · ID ${m.user_id}</p>
        </div>
        <button class="delete-btn" onclick="removeMember(${m.user_id})">Remove</button>
      </div>
    </div>
  `).join('');
}

function renderMemberSelectors() {
  const paidSelect = $('paidBySelect');
  if (paidSelect) {
    paidSelect.innerHTML = members.length
      ? members.map(m => `<option value="${m.user_id}" ${String(m.user_id) === String(currentUser.user_id) ? 'selected' : ''}>${m.name}</option>`).join('')
      : `<option value="">No members</option>`;
  }

  const included = $('includedMembersList');
  if (included) {
    included.innerHTML = members.length
      ? members.map(m => `
        <label class="check-pill">
          <input type="checkbox" class="included-member" value="${m.user_id}" checked onchange="previewSplit()" />
          ${m.name}
        </label>
      `).join('')
      : `<div class="empty-state">Add members first.</div>`;
  }

  const acList = $('acUsersList');
  if (acList) {
    acList.innerHTML = members.length
      ? members.map(m => `
        <label class="check-pill">
          <input type="checkbox" class="ac-user" value="${m.user_id}" onchange="previewSplit()" />
          ${m.name}
        </label>
      `).join('')
      : `<div class="empty-state">Add members first.</div>`;
  }
}

async function addMemberByEmail() {
  const groupId = getActiveGroupId();
  const emailInput = document.getElementById("memberEmail");
  const email = emailInput.value.trim();

  if (!groupId) {
    setMessage("memberMessage", "Please select a group first.", "error");
    return;
  }

  if (!email) {
    setMessage("memberMessage", "Please enter member email.", "error");
    return;
  }

  try {
    const lookupResponse = await fetch(`${API_URL}/users/lookup?email=${encodeURIComponent(email)}`);
    const lookupData = await lookupResponse.json();

    if (!lookupResponse.ok) {
      setMessage("memberMessage", lookupData.error || "User not found. Ask them to sign up first.", "error");
      return;
    }

    const addResponse = await fetch(`${API_URL}/groups/${groupId}/members`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        user_id: lookupData.user_id
      })
    });

    const addData = await addResponse.json();

    if (!addResponse.ok) {
      setMessage("memberMessage", addData.error || "Failed to add member.", "error");
      return;
    }

    emailInput.value = "";
    setMessage("memberMessage", `${lookupData.name} added successfully.`, "success");

    // Refresh members separately so refresh errors do not show as add-member failure
    try {
      await loadMembers();
      await loadGroups();
      await loadActiveGroupData?.();
    } catch (refreshError) {
      console.warn("Member was added, but refresh failed:", refreshError);
    }

  } catch (error) {
    console.error(error);
    setMessage("memberMessage", "Cannot connect to backend.", "error");
  }
}
async function removeMember(userId) {
  if (!confirm('Remove this member?')) return;
  try {
    await api(`/groups/${currentGroupId}/members/${userId}`, { method: 'DELETE' });
    await loadMembers();
  } catch (err) {
    alert(err.message || 'Failed to remove member.');
  }
}

function onSplitMethodChange() {
  const method = $('splitMethod').value;
  $('acOptions').classList.toggle('hidden', method !== 'ac_usage');
  previewSplit();
}

function selectedCheckboxValues(className) {
  return Array.from(document.querySelectorAll(`.${className}:checked`)).map(el => Number(el.value));
}

function calculateSplitPreview() {
  const total = roundMoney($('expenseAmount').value);
  const paidBy = Number($('paidBySelect').value);
  const method = $('splitMethod').value;
  const includedIds = selectedCheckboxValues('included-member');
  const acUserIds = selectedCheckboxValues('ac-user');
  const basePercent = Number($('acBasePercent').value || 60);

  if (!total || total <= 0) throw new Error('Enter a valid amount.');
  if (!paidBy) throw new Error('Select who paid.');
  if (!includedIds.length) throw new Error('Select at least one included member.');

  let splits = [];

  if (method === 'equal' || method === 'exclude') {
    const each = roundMoney(total / includedIds.length);
    splits = includedIds.map(id => ({ user_id: id, amount_owed: each }));
  }

  if (method === 'ac_usage') {
    if (!acUserIds.length) throw new Error('Select who used AC.');
    const baseAmount = roundMoney(total * (basePercent / 100));
    const acAmount = roundMoney(total - baseAmount);
    const baseShare = roundMoney(baseAmount / includedIds.length);
    const acShare = roundMoney(acAmount / acUserIds.length);
    splits = includedIds.map(id => ({
      user_id: id,
      amount_owed: roundMoney(baseShare + (acUserIds.includes(id) ? acShare : 0)),
    }));
  }

  const diff = roundMoney(total - splits.reduce((sum, s) => sum + Number(s.amount_owed), 0));
  if (splits.length) splits[0].amount_owed = roundMoney(Number(splits[0].amount_owed) + diff);

  const payerName = members.find(m => Number(m.user_id) === paidBy)?.name || `User ${paidBy}`;
  const currency = $('expenseCurrency').value;
  const debts = splits
    .filter(s => Number(s.user_id) !== paidBy && Number(s.amount_owed) > 0)
    .map(s => ({
      payer_id: s.user_id,
      payer_name: members.find(m => Number(m.user_id) === Number(s.user_id))?.name || `User ${s.user_id}`,
      receiver_id: paidBy,
      receiver_name: payerName,
      amount: s.amount_owed,
    }));

  return { total, paidBy, payerName, method, includedIds, acUserIds, basePercent, splits, debts, currency };
}

function previewSplit() {
  const box = $('splitPreview');
  if (!box) return;

  try {
    latestSplitPreview = calculateSplitPreview();
    box.innerHTML = `
      <div class="preview-summary">${latestSplitPreview.payerName} paid ${money(latestSplitPreview.total, latestSplitPreview.currency)}. Here is the calculated split:</div>
      ${latestSplitPreview.splits.map(s => {
        const name = members.find(m => Number(m.user_id) === Number(s.user_id))?.name || `User ${s.user_id}`;
        return `<div class="preview-card item-row"><span>${name}'s share</span><strong>${money(s.amount_owed, latestSplitPreview.currency)}</strong></div>`;
      }).join('')}
      ${latestSplitPreview.debts.length ? `
        <div class="preview-summary">Who owes who:</div>
        ${latestSplitPreview.debts.map(d => `<div class="debt-card"><strong>${d.payer_name}</strong> owes <strong>${d.receiver_name}</strong> ${money(d.amount, latestSplitPreview.currency)}</div>`).join('')}
      ` : `<div class="empty-state">No payment is needed between members. Select more members if this bill should be shared.</div>`}
    `;
  } catch (err) {
    latestSplitPreview = null;
    box.innerHTML = `<div class="empty-state">${err.message}</div>`;
  }
}

async function saveExpenseWithSplit() {
  if (!currentGroupId) return setMessage('expenseMessage', 'Select a group first.', 'error');

  const description = $('expenseDescription').value.trim();
  const total_amount = Number($('expenseAmount').value);
  const category_id = $('expenseCategory').value;

  if (!description || !total_amount) return setMessage('expenseMessage', 'Enter bill name and amount.', 'error');

  try {
    const preview = calculateSplitPreview();
    const payload = {
      user_id: preview.paidBy,
      category_id: category_id || null,
      description,
      total_amount,
      original_currency: $('expenseCurrency').value,
      exchange_rate: 1,
      settle_by_deadline: null,
      interest_rate: 0,
      is_recurring: false,
      recurring_period: null,
      split_method: preview.method,
      included_members: preview.includedIds,
      ac_users: preview.acUserIds,
      ac_base_percent: preview.basePercent,
    };

    const saved = await api(`/groups/${currentGroupId}/expenses`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const splitRecord = {
      local_id: Date.now(),
      expense_id: saved?.expense_id || saved?.expense?.expense_id || Date.now(),
      description,
      total_amount,
      currency: preview.currency,
      paid_by: preview.paidBy,
      paid_by_name: preview.payerName,
      splits: preview.splits,
      debts: preview.debts,
      created_at: new Date().toISOString(),
    };

    const records = getLocalSplits();
    records.unshift(splitRecord);
    setLocalSplits(records);

    $('expenseDescription').value = '';
    $('expenseAmount').value = '';
    $('splitPreview').innerHTML = '';
    latestSplitPreview = null;
    setMessage('expenseMessage', 'Bill saved and split calculated.', 'success');
    await loadExpenses();
    await loadDebts();
    await refreshDashboard();
  } catch (err) {
    setMessage('expenseMessage', err.message || 'Failed to save bill.', 'error');
  }
}

async function loadExpenses() {
  const list = $('expensesList');
  if (!list || !currentGroupId) return;

  let backendExpenses = [];
  try {
    backendExpenses = await api(`/groups/${currentGroupId}/expenses`);
  } catch {
    backendExpenses = [];
  }

  const localRecords = getLocalSplits();
  if (!backendExpenses.length && !localRecords.length) {
    list.innerHTML = `<div class="empty-state">No bills added yet.</div>`;
    return;
  }

  const localHtml = localRecords.map(r => `
    <div class="list-card">
      <div class="item-row">
        <div>
          <p class="item-title">${r.description}</p>
          <p class="item-sub">Paid by ${r.paid_by_name} · Split calculated</p>
        </div>
        <span class="amount">${money(r.total_amount, r.currency)}</span>
      </div>
    </div>
  `).join('');

  const backendOnly = backendExpenses.filter(e => !localRecords.some(r => String(r.expense_id) === String(e.expense_id)));
  const backendHtml = backendOnly.map(e => `
    <div class="list-card">
      <div class="item-row">
        <div>
          <p class="item-title">${e.description}</p>
          <p class="item-sub">Paid by User ID ${e.user_id}</p>
        </div>
        <span class="amount">${money(e.total_amount, e.original_currency || '')}</span>
      </div>
    </div>
  `).join('');

  list.innerHTML = localHtml + backendHtml;
}

function calculateLocalDebts() {
  const records = getLocalSplits();
  const settlementKey = `expenseSplitter:settlements:${currentGroupId || 'none'}`;
  let localSettlements = [];
  try { localSettlements = JSON.parse(localStorage.getItem(settlementKey)) || []; } catch {}

  const balances = {};
  members.forEach(m => balances[m.user_id] = { ...m, balance: 0 });

  records.forEach(r => {
    if (!balances[r.paid_by]) balances[r.paid_by] = { user_id: r.paid_by, name: r.paid_by_name, balance: 0 };
    balances[r.paid_by].balance += Number(r.total_amount || 0);
    r.splits.forEach(s => {
      if (!balances[s.user_id]) {
        balances[s.user_id] = { user_id: s.user_id, name: `User ${s.user_id}`, balance: 0 };
      }
      balances[s.user_id].balance -= Number(s.amount_owed || 0);
    });
  });

  localSettlements.forEach(s => {
    if (balances[s.payer_id]) balances[s.payer_id].balance += Number(s.amount || 0);
    if (balances[s.receiver_id]) balances[s.receiver_id].balance -= Number(s.amount || 0);
  });

  const creditors = [];
  const debtors = [];

  Object.values(balances).forEach(p => {
    const bal = roundMoney(p.balance);
    if (bal > 0.01) creditors.push({ ...p, balance: bal });
    if (bal < -0.01) debtors.push({ ...p, balance: Math.abs(bal) });
  });

  creditors.sort((a, b) => b.balance - a.balance);
  debtors.sort((a, b) => b.balance - a.balance);

  const debts = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = roundMoney(Math.min(debtors[i].balance, creditors[j].balance));
    debts.push({
      payer_id: debtors[i].user_id,
      payer_name: debtors[i].name,
      receiver_id: creditors[j].user_id,
      receiver_name: creditors[j].name,
      amount,
    });
    debtors[i].balance = roundMoney(debtors[i].balance - amount);
    creditors[j].balance = roundMoney(creditors[j].balance - amount);
    if (debtors[i].balance <= 0.01) i++;
    if (creditors[j].balance <= 0.01) j++;
  }
  return debts;
}

async function loadDebts() {
  const list = $('debtsList');
  const dash = $('dashboardDebts');
  if (!currentGroupId) {
    if (list) list.innerHTML = `<div class="empty-state">Select a group first.</div>`;
    return;
  }

  let debts = calculateLocalDebts();

  if (!debts.length) {
    try {
      const backendDebts = await api(`/groups/${currentGroupId}/debts/simplified`);
      if (Array.isArray(backendDebts)) {
        debts = backendDebts.map(normaliseDebtRow).filter(Boolean);
      }
    } catch {}
  }

  const html = debts.length ? debts.map(d => `
    <div class="debt-card">
      <div class="item-row">
        <div>
          <p class="item-title">${d.payer_name || d.payer_id} owes ${d.receiver_name || d.receiver_id}</p>
          <p class="item-sub">Pending settlement</p>
        </div>
        <div class="amount">${money(d.amount, groups.find(g => String(g.group_id) === String(currentGroupId))?.currency || '')}</div>
      </div>
      <button class="secondary-btn" onclick="markDebtPaid(${d.payer_id}, ${d.receiver_id}, ${Number(d.amount)})">Mark as paid</button>
    </div>
  `).join('') : `<div class="empty-state">All settled. No one owes anything right now.</div>`;

  if (list) list.innerHTML = html;
  if (dash) dash.innerHTML = html;
  if ($('dashPendingCount')) $('dashPendingCount').innerText = debts.length;
}

async function markDebtPaid(payerId, receiverId, amount) {
  if (!currentGroupId) return;
  try {
    await api(`/groups/${currentGroupId}/settlements`, {
      method: 'POST',
      body: JSON.stringify({ payer_id: payerId, receiver_id: receiverId, amount }),
    });
  } catch {
    // Still keep local settlement for demo if backend settlement fails
  }

  const key = `expenseSplitter:settlements:${currentGroupId}`;
  let settlements = [];
  try { settlements = JSON.parse(localStorage.getItem(key)) || []; } catch {}
  settlements.push({ payer_id: payerId, receiver_id: receiverId, amount, created_at: new Date().toISOString() });
  localStorage.setItem(key, JSON.stringify(settlements));
  await loadDebts();
  await refreshDashboard();
}

async function refreshDashboard() {
  $('dashGroupsCount').innerText = groups.length;

  let expenses = [];
  if (currentGroupId) {
    try { expenses = await api(`/groups/${currentGroupId}/expenses`); } catch {}
  }

  const local = getLocalSplits();
  const total = local.reduce((sum, r) => sum + Number(r.total_amount || 0), 0) ||
    expenses.reduce((sum, e) => sum + Number(e.total_amount || 0), 0);

  const currency = groups.find(g => String(g.group_id) === String(currentGroupId))?.currency || '';
  $('dashTotalSpent').innerText = money(total, currency);
  $('dashExpensesCount').innerText = Math.max(expenses.length, local.length);

  const recent = $('recentExpenses');
  if (recent) {
    const html = local.slice(0, 4).map(r => `
      <div class="list-card item-row">
        <div>
          <p class="item-title">${r.description}</p>
          <p class="item-sub">Paid by ${r.paid_by_name}</p>
        </div>
        <span class="amount">${money(r.total_amount, r.currency)}</span>
      </div>
    `).join('');
    recent.innerHTML = html || `<div class="empty-state">Add your first bill to see it here.</div>`;
  }

  await loadDebts();
}
let spendingChart = null;

function getExpenseMetaKey() {
  const user = currentUser || JSON.parse(localStorage.getItem("currentUser"));
  const userId = user?.user_id || "guest";
  return `expenseMeta_${userId}`;
}

function getExpenseMeta() {
  return JSON.parse(localStorage.getItem(getExpenseMetaKey())) || [];
}

function saveExpenseMeta(item) {
  const all = getExpenseMeta();

  all.unshift({
    id: Date.now(),
    ...item
  });

  localStorage.setItem(getExpenseMetaKey(), JSON.stringify(all));
}

function getCategoryNameById(categoryId) {
  if (!categories || !categories.length) return "Other";

  const found = categories.find(c => Number(c.category_id) === Number(categoryId));
  return found ? found.category_name : "Other";
}

function formatMoney(value) {
  return `PKR ${Number(value || 0).toLocaleString()}`;
}

function loadUpcomingPayments() {
  const list = document.getElementById("upcomingPaymentsList");
  if (!list) return;

  const items = getExpenseMeta();

  if (!items.length) {
    list.innerHTML = `<div class="empty-card">No upcoming payments yet.</div>`;
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  list.innerHTML = items.slice(0, 6).map(item => {
    let status = item.status || "Pending";
    let statusClass = "status-pending";

    if (item.due_date) {
      const due = new Date(item.due_date);
      due.setHours(0, 0, 0, 0);

      if (due < today && status !== "Settled") {
        status = "Overdue";
        statusClass = "status-overdue";
      }
    }

    if (status === "Settled") {
      statusClass = "status-settled";
    }

    return `
      <div class="mini-item">
        <div>
          <strong>${item.bill_name || "Shared bill"}</strong>
          <p>
            ${formatMoney(item.amount)}
            ${item.due_date ? ` · Due: ${item.due_date}` : ""}
            ${item.payment_method ? ` · ${item.payment_method}` : ""}
          </p>
        </div>
        <span class="status-pill ${statusClass}">${status}</span>
      </div>
    `;
  }).join("");
}

loadSpendingOverview();
loadUpcomingPayments();

async function createBudget() {
  const groupId = typeof getActiveGroupId === "function"
    ? getActiveGroupId()
    : currentGroupId;

  if (!groupId) {
    setMessage("budgetMessage", "Please select a group first.", "error");
    return;
  }

  const category_id = Number(document.getElementById("budgetCategory").value);
  const month = Number(document.getElementById("budgetMonth").value);
  const year = Number(document.getElementById("budgetYear").value);
  const monthly_limit = Number(document.getElementById("budgetLimit").value);

  if (!category_id || !month || !year || !monthly_limit) {
    setMessage("budgetMessage", "Please fill all budget fields correctly.", "error");
    return;
  }

  if (month < 1 || month > 12) {
    setMessage("budgetMessage", "Month must be between 1 and 12.", "error");
    return;
  }

  try {
    const response = await fetch(`${API_URL}/groups/${groupId}/budgets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        category_id,
        month,
        year,
        monthly_limit
      })
    });

    const data = await response.json();

    if (!response.ok) {
      setMessage("budgetMessage", data.error || "Failed to create budget.", "error");
      console.log("Budget error:", data);
      return;
    }

    setMessage("budgetMessage", "Budget created successfully.", "success");

    document.getElementById("budgetLimit").value = "";

    await loadBudgets();

  } catch (error) {
    console.error(error);
    setMessage("budgetMessage", "Cannot connect to backend.", "error");
  }
}

async function loadBudgets() {
  const list = $('budgetsList');
  if (!list || !currentGroupId) return;
  try {
    const budgets = await api(`/groups/${currentGroupId}/budgets`);
    list.innerHTML = budgets.length ? budgets.map(b => `
      <div class="list-card item-row">
        <div>
          <p class="item-title">${b.category_name || 'Category'} budget</p>
          <p class="item-sub">${b.month}/${b.year}</p>
        </div>
        <span class="amount">${money(b.monthly_limit)}</span>
      </div>
    `).join('') : `<div class="empty-state">No budgets yet.</div>`;
  } catch {
    list.innerHTML = `<div class="empty-state">No budgets available.</div>`;
  }
}

async function loadNotifications() {
  const list = $('notificationsList');
  if (!list) return;
  try {
    const notifications = await api(`/notifications?user_id=${currentUser.user_id}`);
    list.innerHTML = notifications.length ? notifications.map(n => `
      <div class="list-card item-row">
        <div>
          <p class="item-title">${n.message}</p>
          <p class="item-sub">${n.is_read ? 'Read' : 'Unread'}</p>
        </div>
        ${n.is_read ? '' : `<button class="text-btn" onclick="markNotificationRead(${n.notification_id})">Mark read</button>`}
      </div>
    `).join('') : `<div class="empty-state">No notifications yet.</div>`;
  } catch {
    list.innerHTML = `<div class="empty-state">No activity yet.</div>`;
  }
}

async function markNotificationRead(id) {
  try {
    await api(`/notifications/${id}/read`, { method: 'PUT' });
    await loadNotifications();
  } catch (err) {
    alert(err.message || 'Failed to update notification.');
  }
}

async function updateProfile() {
  try {
    const updated = await api(`/users/${currentUser.user_id}`, {
      method: 'PUT',
      body: JSON.stringify({ name: $('profileName').value.trim(), email: $('profileEmail').value.trim() }),
    });
    currentUser = updated;
    localStorage.setItem('currentUser', JSON.stringify(updated));
    setUserUI();
    setMessage('profileMessage', 'Profile updated.', 'success');
  } catch (err) {
    setMessage('profileMessage', err.message || 'Failed to update profile.', 'error');
  }
}
let categoryPieChartObject = null;

function analyticsMoney(value) {
  return `PKR ${Number(value || 0).toLocaleString()}`;
}

function getExpenseAmount(expense) {
  return Number(
    expense.total_amount ||
    expense.amount ||
    expense.original_amount ||
    expense.converted_amount ||
    0
  );
}

function getExpenseTitle(expense) {
  return (
    expense.description ||
    expense.title ||
    expense.expense_name ||
    expense.bill_name ||
    "Shared bill"
  );
}

function getExpenseCategory(expense) {
  if (expense.category_name) return expense.category_name;

  if (expense.category_id && typeof categories !== "undefined") {
    const found = categories.find(
      c => Number(c.category_id) === Number(expense.category_id)
    );

    if (found) return found.category_name;
  }

  return "Other";
}

function getExpensePayer(expense) {
  return (
    expense.paid_by_name ||
    expense.payer_name ||
    expense.name ||
    expense.user_name ||
    "Member"
  );
}

async function loadAnalyticsDashboard() {
  const groupId = typeof getActiveGroupId === "function"
    ? getActiveGroupId()
    : currentGroupId;

  if (!groupId) return;

  let expenses = [];
  let membersList = [];

  try {
    expenses = await api(`/groups/${groupId}/expenses`);
  } catch (error) {
    console.log("Expenses not loaded for analytics:", error);
    expenses = [];
  }

  try {
    membersList = await api(`/groups/${groupId}/members`);
  } catch (error) {
    console.log("Members not loaded for analytics:", error);
    membersList = [];
  }

  // fallback demo data if no expenses yet
  if (!expenses || expenses.length === 0) {
    expenses = [
      { description: "Rent", total_amount: 20000, category_name: "Rent", paid_by_name: "Diya" },
      { description: "Electricity Bill", total_amount: 9000, category_name: "Electricity", paid_by_name: "Sara" },
      { description: "Groceries", total_amount: 6000, category_name: "Food", paid_by_name: "Sejal" },
      { description: "Internet", total_amount: 3000, category_name: "Internet", paid_by_name: "Diya" }
    ];
  }

  const totalSpending = expenses.reduce((sum, item) => {
    return sum + getExpenseAmount(item);
  }, 0);

  const categoryTotals = {};
  const memberTotals = {};

  expenses.forEach(expense => {
    const amount = getExpenseAmount(expense);
    const category = getExpenseCategory(expense);
    const payer = getExpensePayer(expense);

    categoryTotals[category] = (categoryTotals[category] || 0) + amount;
    memberTotals[payer] = (memberTotals[payer] || 0) + amount;
  });

  const highestSpenderEntry = Object.entries(memberTotals).sort((a, b) => b[1] - a[1])[0];

  const totalBox = document.getElementById("analyticsTotalSpending");
  const highestBox = document.getElementById("analyticsHighestSpender");
  const highestAmountBox = document.getElementById("analyticsHighestSpenderAmount");
  const activeMembersBox = document.getElementById("analyticsActiveMembers");
  const budgetStatusBox = document.getElementById("analyticsBudgetStatus");

  if (totalBox) totalBox.textContent = analyticsMoney(totalSpending);
  if (highestBox) highestBox.textContent = highestSpenderEntry ? highestSpenderEntry[0] : "-";
  if (highestAmountBox) highestAmountBox.textContent = highestSpenderEntry ? `${analyticsMoney(highestSpenderEntry[1])} contributed` : "PKR 0 contributed";
  if (activeMembersBox) activeMembersBox.textContent = membersList.length || Object.keys(memberTotals).length || 0;

  // simple visual budget status fallback
  const budgetPercent = totalSpending > 0 ? Math.min(Math.round((totalSpending / 100000) * 100), 100) : 0;
  if (budgetStatusBox) budgetStatusBox.textContent = `${budgetPercent}%`;

  renderCategoryBars(categoryTotals, totalSpending);
  renderMemberContributions(memberTotals);
  renderTopExpenses(expenses);
  renderCategoryPieChart(categoryTotals);
}

function renderCategoryBars(categoryTotals, totalSpending) {
  const box = document.getElementById("categoryBars");
  if (!box) return;

  const entries = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);

  if (!entries.length) {
    box.innerHTML = `<div class="empty-card">No category data yet.</div>`;
    return;
  }

  box.innerHTML = entries.map(([category, amount]) => {
    const percent = totalSpending > 0 ? Math.round((amount / totalSpending) * 100) : 0;

    return `
      <div class="category-bar-item">
        <div class="category-bar-header">
          <strong>${category}</strong>
          <strong>${analyticsMoney(amount)} (${percent}%)</strong>
        </div>
        <div class="category-bar-track">
          <div class="category-bar-fill" style="width:${percent}%"></div>
        </div>
      </div>
    `;
  }).join("");
}

function renderMemberContributions(memberTotals) {
  const box = document.getElementById("memberContributionList");
  if (!box) return;

  const entries = Object.entries(memberTotals).sort((a, b) => b[1] - a[1]);
  const max = entries.length ? entries[0][1] : 0;

  if (!entries.length) {
    box.innerHTML = `<div class="empty-card">No member contribution data yet.</div>`;
    return;
  }

  box.innerHTML = entries.map(([member, amount]) => {
    const initials = member
      .split(" ")
      .map(part => part[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();

    const percent = max > 0 ? Math.round((amount / max) * 100) : 0;

    return `
      <div class="member-row">
        <div class="member-avatar">${initials}</div>
        <div class="member-info">
          <strong>${member}</strong>
          <div class="member-bar-track">
            <div class="member-bar-fill" style="width:${percent}%"></div>
          </div>
        </div>
        <strong>${analyticsMoney(amount)}</strong>
      </div>
    `;
  }).join("");
}

function renderTopExpenses(expenses) {
  const box = document.getElementById("topExpensesList");
  if (!box) return;

  const sorted = [...expenses]
    .sort((a, b) => getExpenseAmount(b) - getExpenseAmount(a))
    .slice(0, 5);

  if (!sorted.length) {
    box.innerHTML = `<div class="empty-card">No expenses yet.</div>`;
    return;
  }

  box.innerHTML = sorted.map(expense => `
    <div class="top-expense-row">
      <div>
        <strong>${getExpenseTitle(expense)}</strong>
        <p class="muted">${getExpenseCategory(expense)} · Paid by ${getExpensePayer(expense)}</p>
      </div>
      <strong>${analyticsMoney(getExpenseAmount(expense))}</strong>
    </div>
  `).join("");
}

function renderCategoryPieChart(categoryTotals) {
  const canvas = document.getElementById("categoryPieChart");
  if (!canvas || typeof Chart === "undefined") return;

  const labels = Object.keys(categoryTotals);
  const values = Object.values(categoryTotals);

  if (!labels.length) return;

  if (categoryPieChartObject) {
    categoryPieChartObject.destroy();
  }

  categoryPieChartObject = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          data: values
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "58%",
      plugins: {
        legend: {
          position: "bottom"
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.label}: ${analyticsMoney(context.raw)}`;
            }
          }
        }
      }
    }
  });

}

window.addEventListener("load", () => {
  setTimeout(loadAnalyticsDashboard, 1000);
});

function renderSpendingPieChart() {
  const canvas = document.getElementById("spendingPieChart");
  const list = document.getElementById("categoryBreakdown");

  if (!canvas || !list) {
    console.log("Pie chart HTML not found");
    return;
  }

  if (typeof Chart === "undefined") {
    list.innerHTML = `<div class="empty-card">Chart.js not loaded.</div>`;
    return;
  }

  const data = [
    { category: "Rent", amount: 50000 },
    { category: "Electricity", amount: 18000 },
    { category: "Groceries", amount: 14000 },
    { category: "Internet", amount: 5000 },
    { category: "Other", amount: 3000 }
  ];

  const labels = data.map(item => item.category);
  const values = data.map(item => item.amount);

  list.innerHTML = data.map(item => `
    <div class="chart-list-item">
      <div>
        <strong>${item.category}</strong><br>
        <span>Total shared spending</span>
      </div>
      <strong>PKR ${item.amount.toLocaleString()}</strong>
    </div>
  `).join("");

  if (window.spendingPieChartObject) {
    window.spendingPieChartObject.destroy();
  }

  window.spendingPieChartObject = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: labels,
      datasets: [{
        data: values
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "55%",
      plugins: {
        legend: {
          position: "bottom"
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.label}: PKR ${Number(context.raw).toLocaleString()}`;
            }
          }
        }
      }
    }
  });
}

window.addEventListener("load", () => {
  setTimeout(renderSpendingPieChart, 700);
});

function getChartCategoryName(expense) {
  if (expense.category_name) return expense.category_name;
  if (expense.category) return expense.category;

  if (expense.category_id && typeof categories !== "undefined") {
    const found = categories.find(
      c => Number(c.category_id) === Number(expense.category_id)
    );

    if (found) return found.category_name;
  }

  return "Other";
}

function getChartExpenseAmount(expense) {
  return Number(
    expense.total_amount ||
    expense.amount ||
    expense.converted_amount ||
    expense.original_amount ||
    0
  );
}



function getActualChartAmount(expense) {
  return Number(
    expense.total_amount ||
    expense.amount ||
    expense.converted_amount ||
    expense.original_amount ||
    0
  );
}

function getActualChartCategory(expense) {
  if (expense.category_name) return expense.category_name;
  if (expense.category) return expense.category;

  if (expense.category_id && typeof categories !== "undefined") {
    const found = categories.find(c => Number(c.category_id) === Number(expense.category_id));
    if (found) return found.category_name;
  }

  return "Other";
}

async function loadActualSpendingOverview() {
  const donut = document.getElementById("actualSpendingDonut");
  const legend = document.getElementById("actualSpendingLegend");
  const totalText = document.getElementById("actualSpendingTotal");

  if (!donut || !legend || !totalText) return;

  const groupId = typeof getActiveGroupId === "function" ? getActiveGroupId() : currentGroupId;

  if (!groupId) {
    totalText.textContent = "PKR 0 total";
    legend.innerHTML = `<div class="empty-card">Please select a group first.</div>`;
    return;
  }

  try {
    const expenses = await api(`/groups/${groupId}/expenses`);

    const totals = {};

    expenses.forEach(expense => {
      const amount = getActualChartAmount(expense);
      const category = getActualChartCategory(expense);

      if (amount > 0) {
        totals[category] = (totals[category] || 0) + amount;
      }
    });

    const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    const chartCurrency =
  expenses[0]?.original_currency ||
  expenses[0]?.currency ||
  expenses[0]?.expense_currency ||
  document.getElementById("activeGroupCurrency")?.textContent?.replace("Currency:", "").trim() ||
  "PKR";
    const total = entries.reduce((sum, item) => sum + item[1], 0);

    if (!entries.length) {
      totalText.textContent = "PKR 0 total";
      legend.innerHTML = `<div class="empty-card">No expenses found for chart.</div>`;
      return;
    }

    const colors = ["#6c5ce7", "#2fc3a5", "#3b82f6", "#f97316", "#98a2b3", "#ec4899"];
    let start = 0;

    const gradient = entries.map(([category, amount], index) => {
      const degrees = (amount / total) * 360;
      const part = `${colors[index % colors.length]} ${start}deg ${start + degrees}deg`;
      start += degrees;
      return part;
    }).join(", ");

    donut.style.background =
      `radial-gradient(circle at center, #fffdf8 0 42%, transparent 43%),
       conic-gradient(${gradient})`;

    totalText.textContent = `${chartCurrency} ${total.toLocaleString()} total`;

    legend.innerHTML = entries.map(([category, amount], index) => {
      const percent = Math.round((amount / total) * 100);

      return `
        <div class="legend-row">
          <span>
            <i class="legend-dot" style="background:${colors[index % colors.length]}"></i>
            ${category}
          </span>
          <strong>${chartCurrency} ${amount.toLocaleString()} (${percent}%)</strong>
        </div>
      `;
    }).join("");

  } catch (error) {
    console.error(error);
    totalText.textContent = "PKR 0 total";
    legend.innerHTML = `<div class="empty-card">Could not load spending data.</div>`;
  }
}

window.addEventListener("load", () => {
  setTimeout(loadActualSpendingOverview, 1000);
});