/* =========================================================
   Pocket Ledger — Expense & Budget Visualizer
   Vanilla JS. No frameworks. Data persisted in Local Storage.
   ========================================================= */

(function () {
  'use strict';

  /* ---------- Storage keys ---------- */
  const STORAGE_KEYS = {
    transactions: 'pocketLedger.transactions',
    categories: 'pocketLedger.categories',
    theme: 'pocketLedger.theme',
    budget: 'pocketLedger.budget',
  };

  /* ---------- Default categories ---------- */
  const DEFAULT_CATEGORIES = ['Food', 'Transport', 'Fun'];

  const CATEGORY_COLOR_COUNT = 8;

  /* ---------- State ---------- */
  let transactions = loadTransactions();
  let categories = loadCategories();
  let currentSort = 'newest';
  let chartInstance = null;
  let pendingDeleteId = null;

  /* ---------- DOM refs ---------- */
  const el = {
    themeToggle: document.getElementById('themeToggle'),
    iconSun: document.getElementById('iconSun'),
    iconMoon: document.getElementById('iconMoon'),

    totalBalance: document.getElementById('totalBalance'),
    balanceLabel: document.getElementById('balanceLabel'),
    budgetInput: document.getElementById('budgetInput'),
    budgetStatus: document.getElementById('budgetStatus'),
    budgetProgress: document.getElementById('budgetProgress'),
    budgetProgressFill: document.getElementById('budgetProgressFill'),

    form: document.getElementById('transactionForm'),
    itemName: document.getElementById('itemName'),
    itemAmount: document.getElementById('itemAmount'),
    itemCategory: document.getElementById('itemCategory'),
    errorName: document.getElementById('errorName'),
    errorAmount: document.getElementById('errorAmount'),
    errorCategory: document.getElementById('errorCategory'),
    errorCustomCategory: document.getElementById('errorCustomCategory'),

    customCategoryField: document.getElementById('customCategoryField'),
    customCategoryInput: document.getElementById('customCategoryInput'),
    saveCustomCategory: document.getElementById('saveCustomCategory'),

    sortSelect: document.getElementById('sortSelect'),
    transactionList: document.getElementById('transactionList'),
    listEmpty: document.getElementById('listEmpty'),

    chartCanvas: document.getElementById('categoryChart'),
    chartEmpty: document.getElementById('chartEmpty'),
    legend: document.getElementById('chartLegend'),

    toast: document.getElementById('toast'),
    confirmModal: document.getElementById('confirmModal'),
    confirmMessage: document.getElementById('confirmMessage'),
    confirmCancel: document.getElementById('confirmCancel'),
    confirmOk: document.getElementById('confirmOk'),
  };

  /* =========================================================
     Storage helpers
     ========================================================= */
  function loadTransactions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.transactions);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('Gagal membaca transaksi dari Local Storage', e);
      return [];
    }
  }

  function saveTransactions() {
    try {
      localStorage.setItem(STORAGE_KEYS.transactions, JSON.stringify(transactions));
    } catch (e) {
      console.error('Gagal menyimpan transaksi', e);
      showToast('Gagal menyimpan data. Storage penuh?', 'error');
    }
  }

  function loadCategories() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.categories);
      const saved = raw ? JSON.parse(raw) : null;
      if (saved && Array.isArray(saved) && saved.length) return saved;
      return DEFAULT_CATEGORIES.slice();
    } catch (e) {
      return DEFAULT_CATEGORIES.slice();
    }
  }

  function saveCategories() {
    try {
      localStorage.setItem(STORAGE_KEYS.categories, JSON.stringify(categories));
    } catch (e) {
      console.error('Gagal menyimpan kategori', e);
    }
  }

  function loadTheme() {
    return localStorage.getItem(STORAGE_KEYS.theme) || 'light';
  }

  function saveTheme(theme) {
    localStorage.setItem(STORAGE_KEYS.theme, theme);
  }

  function loadBudget() {
    const raw = localStorage.getItem(STORAGE_KEYS.budget);
    if (!raw) return null;
    const num = Number(raw);
    return Number.isFinite(num) && num > 0 ? num : null;
  }

  function saveBudget(value) {
    if (value === null || Number.isNaN(value) || value <= 0) {
      localStorage.removeItem(STORAGE_KEYS.budget);
    } else {
      localStorage.setItem(STORAGE_KEYS.budget, String(value));
    }
  }

  /* =========================================================
     Formatting helpers
     ========================================================= */
  function formatRupiah(value) {
    return 'Rp ' + Math.round(value).toLocaleString('id-ID');
  }

  function formatNumberInput(value) {
    const digits = String(value).replace(/\D/g, '');
    if (!digits) return '';
    return Number(digits).toLocaleString('id-ID');
  }

  function parseNumberInput(value) {
    const digits = String(value).replace(/\D/g, '');
    return digits ? Number(digits) : 0;
  }

  function categoryColor(categoryName) {
    const index = categories.indexOf(categoryName);
    const safeIndex = index === -1 ? 0 : index % CATEGORY_COLOR_COUNT;
    const color = getComputedStyle(document.documentElement)
      .getPropertyValue(`--cat-${safeIndex + 1}`)
      .trim();
    return color || '#999999';
  }

  /* =========================================================
     Toast notification
     ========================================================= */
  let toastTimeout = null;
  function showToast(message, type = '') {
    if (toastTimeout) clearTimeout(toastTimeout);
    el.toast.textContent = message;
    el.toast.className = 'toast show' + (type ? ` is-${type}` : '');
    toastTimeout = setTimeout(() => {
      el.toast.classList.remove('show');
    }, 2600);
  }

  /* =========================================================
     Theme
     ========================================================= */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    el.iconSun.style.display = theme === 'dark' ? 'none' : 'block';
    el.iconMoon.style.display = theme === 'dark' ? 'block' : 'none';
    saveTheme(theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', theme === 'dark' ? '#0F1314' : '#2F6F5E');
    }
    renderChart();
  }

  el.themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });

  /* =========================================================
     Category select population
     ========================================================= */
  function populateCategorySelect() {
    const previousValue = el.itemCategory.value;
    el.itemCategory.innerHTML = '<option value="" disabled selected>Pilih kategori</option>';

    categories.forEach((cat) => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      el.itemCategory.appendChild(opt);
    });

    const customOpt = document.createElement('option');
    customOpt.value = '__custom__';
    customOpt.textContent = '+ Tambah kategori baru';
    el.itemCategory.appendChild(customOpt);

    if (categories.includes(previousValue)) {
      el.itemCategory.value = previousValue;
    }
  }

  el.itemCategory.addEventListener('change', () => {
    if (el.itemCategory.value === '__custom__') {
      el.customCategoryField.hidden = false;
      el.customCategoryInput.focus();
    } else {
      el.customCategoryField.hidden = true;
      el.errorCustomCategory.textContent = '';
    }
  });

  el.customCategoryInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      el.saveCustomCategory.click();
    }
  });

  el.saveCustomCategory.addEventListener('click', () => {
    const name = el.customCategoryInput.value.trim();
    el.errorCustomCategory.textContent = '';

    if (!name) {
      el.errorCustomCategory.textContent = 'Nama kategori tidak boleh kosong.';
      el.customCategoryInput.focus();
      return;
    }

    if (name.length > 20) {
      el.errorCustomCategory.textContent = 'Maksimal 20 karakter.';
      return;
    }

    const exists = categories.some((c) => c.toLowerCase() === name.toLowerCase());
    if (exists) {
      const existing = categories.find((c) => c.toLowerCase() === name.toLowerCase());
      el.itemCategory.value = existing;
      el.customCategoryField.hidden = true;
      el.customCategoryInput.value = '';
      return;
    }

    categories.push(name);
    saveCategories();
    populateCategorySelect();
    el.itemCategory.value = name;
    el.customCategoryField.hidden = true;
    el.customCategoryInput.value = '';
    showToast(`Kategori "${name}" ditambahkan`, 'success');
  });

  /* =========================================================
     Form: add transaction + validation
     ========================================================= */
  function clearFieldErrors() {
    [el.errorName, el.errorAmount, el.errorCategory, el.errorCustomCategory].forEach(
      (n) => (n.textContent = '')
    );
    [el.itemName, el.itemAmount, el.itemCategory, el.customCategoryInput].forEach((n) =>
      n.closest('.field')?.classList.remove('has-error')
    );
  }

  function setFieldError(inputEl, errorEl, message) {
    errorEl.textContent = message;
    inputEl.closest('.field')?.classList.add('has-error');
  }

  el.itemAmount.addEventListener('input', () => {
    const cursorPos = el.itemAmount.selectionStart;
    const oldLength = el.itemAmount.value.length;
    el.itemAmount.value = formatNumberInput(el.itemAmount.value);
    const newLength = el.itemAmount.value.length;
    const newPos = Math.max(0, cursorPos + (newLength - oldLength));
    el.itemAmount.setSelectionRange(newPos, newPos);
  });

  el.form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearFieldErrors();

    const name = el.itemName.value.trim();
    const amount = parseNumberInput(el.itemAmount.value);
    let category = el.itemCategory.value;

    let hasError = false;

    if (!name) {
      setFieldError(el.itemName, el.errorName, 'Nama item wajib diisi.');
      hasError = true;
    }

    if (!el.itemAmount.value.trim() || amount <= 0) {
      setFieldError(el.itemAmount, el.errorAmount, 'Masukkan jumlah yang valid (> 0).');
      hasError = true;
    }

    if (!category || category === '__custom__') {
      setFieldError(el.itemCategory, el.errorCategory, 'Pilih atau tambah kategori.');
      hasError = true;
    }

    if (hasError) return;

    const transaction = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      name,
      amount,
      category,
      date: new Date().toISOString(),
    };

    transactions.push(transaction);
    saveTransactions();

    el.form.reset();
    el.customCategoryField.hidden = true;
    el.itemCategory.value = '';
    clearFieldErrors();

    renderAll();
    showToast(`"${name}" berhasil dicatat`, 'success');

    el.itemName.focus();
  });

  /* =========================================================
     Sorting
     ========================================================= */
  el.sortSelect.addEventListener('change', () => {
    currentSort = el.sortSelect.value;
    renderTransactionList();
  });

  function sortedTransactions() {
    const list = transactions.slice();
    switch (currentSort) {
      case 'amount-desc':
        return list.sort((a, b) => b.amount - a.amount || new Date(b.date) - new Date(a.date));
      case 'amount-asc':
        return list.sort((a, b) => a.amount - b.amount || new Date(b.date) - new Date(a.date));
      case 'category':
        return list.sort(
          (a, b) =>
            a.category.localeCompare(b.category) || new Date(b.date) - new Date(a.date)
        );
      case 'oldest':
        return list.sort((a, b) => new Date(a.date) - new Date(b.date));
      case 'newest':
      default:
        return list.sort((a, b) => new Date(b.date) - new Date(a.date));
    }
  }

  /* =========================================================
     Render: transaction list
     ========================================================= */
  function renderTransactionList() {
    const list = sortedTransactions();
    el.transactionList.innerHTML = '';

    if (list.length === 0) {
      el.listEmpty.style.display = 'flex';
      el.transactionList.style.display = 'none';
      return;
    }
    el.listEmpty.style.display = 'none';
    el.transactionList.style.display = 'block';

    list.forEach((tx, index) => {
      const li = document.createElement('li');
      li.style.animationDelay = `${Math.min(index * 0.03, 0.3)}s`;

      const dot = document.createElement('span');
      dot.className = 'tx-dot';
      dot.style.background = categoryColor(tx.category);

      const info = document.createElement('div');
      info.className = 'tx-info';
      const nameEl = document.createElement('p');
      nameEl.className = 'tx-name';
      nameEl.textContent = tx.name;
      const catEl = document.createElement('p');
      catEl.className = 'tx-category';
      catEl.textContent = tx.category;
      info.appendChild(nameEl);
      info.appendChild(catEl);

      const amountEl = document.createElement('span');
      amountEl.className = 'tx-amount';
      amountEl.textContent = formatRupiah(tx.amount);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'tx-delete';
      deleteBtn.type = 'button';
      deleteBtn.setAttribute('aria-label', `Hapus ${tx.name}`);
      deleteBtn.innerHTML =
        '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      deleteBtn.addEventListener('click', () => requestDelete(tx));

      li.appendChild(dot);
      li.appendChild(info);
      li.appendChild(amountEl);
      li.appendChild(deleteBtn);
      el.transactionList.appendChild(li);
    });
  }

  /* =========================================================
     Delete dengan konfirmasi
     ========================================================= */
  function requestDelete(tx) {
    pendingDeleteId = tx.id;
    el.confirmMessage.textContent = `"${tx.name}" (${formatRupiah(tx.amount)}) akan dihapus permanen.`;
    el.confirmModal.hidden = false;
  }

  function closeConfirm() {
    el.confirmModal.hidden = true;
    pendingDeleteId = null;
  }

  el.confirmCancel.addEventListener('click', closeConfirm);
  el.confirmModal.querySelector('.modal__backdrop').addEventListener('click', closeConfirm);
  el.confirmOk.addEventListener('click', () => {
    if (pendingDeleteId) {
      const id = pendingDeleteId;
      const tx = transactions.find((t) => t.id === id);
      transactions = transactions.filter((t) => t.id !== id);
      saveTransactions();
      renderAll();
      showToast(tx ? `"${tx.name}" dihapus` : 'Transaksi dihapus');
    }
    closeConfirm();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el.confirmModal.hidden) {
      closeConfirm();
    }
  });

  /* =========================================================
     Render: balance + budget
     ========================================================= */
  function renderBalance() {
    const total = transactions.reduce((sum, t) => sum + t.amount, 0);
    const budget = loadBudget();

    if (budget && budget > 0) {
      const remaining = budget - total;
      const pct = Math.min(100, Math.round((total / budget) * 100));

      el.balanceLabel.textContent = 'Sisa dari batas bulanan';
      el.totalBalance.textContent = formatRupiah(remaining);

      el.budgetProgress.hidden = false;
      el.budgetProgressFill.style.width = `${pct}%`;

      if (remaining < 0) {
        el.budgetProgressFill.classList.add('is-over');
        el.totalBalance.classList.add('is-over');
        el.budgetStatus.textContent = `⚠️ Melebihi batas sebesar ${formatRupiah(
          Math.abs(remaining)
        )}.`;
        el.budgetStatus.classList.add('is-over');
      } else {
        el.budgetProgressFill.classList.remove('is-over');
        el.totalBalance.classList.remove('is-over');
        el.budgetStatus.textContent = `Sudah terpakai ${pct}% dari batas ${formatRupiah(
          budget
        )}.`;
        el.budgetStatus.classList.remove('is-over');
      }
    } else {
      el.balanceLabel.textContent = 'Total pengeluaran';
      el.totalBalance.textContent = formatRupiah(total);
      el.totalBalance.classList.remove('is-over');
      el.budgetProgress.hidden = true;
      el.budgetStatus.textContent = 'Atur batas bulanan untuk melacak sisa anggaranmu.';
      el.budgetStatus.classList.remove('is-over');
    }
  }

  el.budgetInput.addEventListener('input', () => {
    const cursorPos = el.budgetInput.selectionStart;
    const oldLength = el.budgetInput.value.length;
    el.budgetInput.value = formatNumberInput(el.budgetInput.value);
    const newLength = el.budgetInput.value.length;
    const newPos = Math.max(0, cursorPos + (newLength - oldLength));
    el.budgetInput.setSelectionRange(newPos, newPos);

    const value = parseNumberInput(el.budgetInput.value);
    saveBudget(value > 0 ? value : null);
    renderBalance();
  });

  function restoreBudgetInput() {
    const budget = loadBudget();
    el.budgetInput.value = budget ? formatNumberInput(budget) : '';
  }

  /* =========================================================
     Render: chart
     ========================================================= */
  function categoryTotals() {
    const totals = {};
    transactions.forEach((t) => {
      totals[t.category] = (totals[t.category] || 0) + t.amount;
    });
    return totals;
  }

  function renderChart() {
    const totals = categoryTotals();
    const labels = Object.keys(totals);
    const data = labels.map((l) => totals[l]);

    if (labels.length === 0) {
      el.chartCanvas.style.display = 'none';
      el.chartEmpty.style.display = 'flex';
      el.legend.innerHTML = '';
      if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
      }
      return;
    }

    el.chartCanvas.style.display = 'block';
    el.chartEmpty.style.display = 'none';

    const colors = labels.map((label) => categoryColor(label));

    if (chartInstance) {
      chartInstance.data.labels = labels;
      chartInstance.data.datasets[0].data = data;
      chartInstance.data.datasets[0].backgroundColor = colors;
      chartInstance.update();
    } else {
      const ctx = el.chartCanvas.getContext('2d');
      chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [
            {
              data,
              backgroundColor: colors,
              borderWidth: 3,
              borderColor: getComputedStyle(document.documentElement)
                .getPropertyValue('--surface')
                .trim() || '#fff',
              hoverOffset: 6,
            },
          ],
        },
        options: {
          responsive: false,
          cutout: '62%',
          animation: {
            animateRotate: true,
            animateScale: true,
            duration: 600,
            easing: 'easeOutQuart',
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(20, 24, 26, 0.95)',
              padding: 10,
              cornerRadius: 8,
              titleFont: { family: 'Inter', size: 12, weight: '600' },
              bodyFont: { family: 'Inter', size: 12 },
              callbacks: {
                label: (ctx) => ` ${formatRupiah(ctx.raw)}`,
              },
            },
          },
        },
      });
    }

    renderLegend(labels, totals, colors);
  }

  function renderLegend(labels, totals, colors) {
    el.legend.innerHTML = '';
    const total = Object.values(totals).reduce((a, b) => a + b, 0);
    labels.forEach((label, i) => {
      const pct = total > 0 ? Math.round((totals[label] / total) * 100) : 0;
      const li = document.createElement('li');
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = colors[i];
      li.appendChild(dot);
      li.appendChild(document.createTextNode(`${label} · ${pct}%`));
      el.legend.appendChild(li);
    });
  }

  /* =========================================================
     Render everything
     ========================================================= */
  function renderAll() {
    renderBalance();
    renderTransactionList();
    renderChart();
  }

  /* =========================================================
     Init
     ========================================================= */
  function init() {
    applyTheme(loadTheme());
    populateCategorySelect();
    restoreBudgetInput();
    renderAll();
  }

  init();
})();