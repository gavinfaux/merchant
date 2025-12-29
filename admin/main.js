// ============================================================
// MERCHANT ADMIN
// ============================================================

const API_URL_KEY = 'merchant_api_url';
const API_KEY_KEY = 'merchant_api_key';

let apiUrl = localStorage.getItem(API_URL_KEY) || '';
let apiKey = localStorage.getItem(API_KEY_KEY) || '';

// Cache for data
let cachedOrders = [];
let cachedInventory = [];
let cachedProducts = [];

// State
let currentProductId = null;
let currentVariants = [];
let uploadedImageUrl = null;

// ============================================================
// API
// ============================================================

async function api(path, options = {}) {
  const res = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || res.statusText);
  }
  return res.json();
}

async function apiUpload(file) {
  const formData = new FormData();
  formData.append('file', file);
  
  const res = await fetch(`${apiUrl}/v1/images`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || res.statusText);
  }
  return res.json();
}

// ============================================================
// LOGIN
// ============================================================

function showLogin() {
  document.getElementById('app').classList.remove('logged-in');
  document.getElementById('login-page').classList.remove('hidden');
  document.getElementById('sidebar').classList.remove('flex');
  document.getElementById('sidebar').classList.add('hidden');
  document.querySelectorAll('#main .page').forEach(p => p.classList.add('hidden'));
}

function showApp() {
  document.getElementById('app').classList.add('logged-in');
  document.getElementById('login-page').classList.add('hidden');
  document.getElementById('sidebar').classList.remove('hidden');
  document.getElementById('sidebar').classList.add('flex');
  const hash = window.location.hash.slice(1) || 'orders';
  navigateTo(hash);
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  apiUrl = document.getElementById('api-url').value.replace(/\/$/, '');
  apiKey = document.getElementById('api-key').value;
  
  try {
    await api('/v1/orders');
    localStorage.setItem(API_URL_KEY, apiUrl);
    localStorage.setItem(API_KEY_KEY, apiKey);
    showApp();
  } catch (err) {
    alert('Connection failed: ' + err.message);
  }
});

document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.removeItem(API_URL_KEY);
  localStorage.removeItem(API_KEY_KEY);
  apiUrl = '';
  apiKey = '';
  showLogin();
});

// ============================================================
// NAVIGATION
// ============================================================

function navigateTo(page) {
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.querySelector(`.nav-link[data-page="${page}"]`)?.classList.add('active');
  
  document.querySelectorAll('#main .page').forEach(p => p.classList.add('hidden'));
  document.getElementById(`${page}-page`)?.classList.remove('hidden');
  
  if (page === 'orders') loadOrders();
  if (page === 'inventory') loadInventory();
  if (page === 'products') loadProducts();
}

document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const page = link.dataset.page;
    window.location.hash = page;
    navigateTo(page);
  });
});

window.addEventListener('hashchange', () => {
  const page = window.location.hash.slice(1) || 'orders';
  navigateTo(page);
});

// ============================================================
// ORDERS
// ============================================================

async function loadOrders() {
  const tbody = document.getElementById('orders-tbody');
  const empty = document.getElementById('orders-empty');
  
  try {
    const data = await api('/v1/orders');
    cachedOrders = data.items || [];
    renderOrders(cachedOrders);
  } catch (err) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
  }
}

function renderOrders(orders) {
  const tbody = document.getElementById('orders-tbody');
  const empty = document.getElementById('orders-empty');
  
  if (orders.length === 0) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  
  empty.classList.add('hidden');
  tbody.innerHTML = orders.map(o => `
    <tr class="table-row">
      <td class="px-4 py-3">${o.number || o.id.slice(0, 8)}</td>
      <td class="px-4 py-3">${o.customer_email || '-'}</td>
      <td class="px-4 py-3">
        <span class="px-2 py-0.5 text-xs rounded-sm font-medium ${statusBadge(o.status)}">${o.status}</span>
      </td>
      <td class="px-4 py-3 text-right">$${((o.amounts?.total_cents ?? 0) / 100).toFixed(2)}</td>
      <td class="px-4 py-3">${new Date(o.created_at).toLocaleDateString()}</td>
    </tr>
  `).join('');
}

function filterOrders(query) {
  const q = query.toLowerCase();
  const filtered = cachedOrders.filter(o => 
    o.id.toLowerCase().includes(q) ||
    (o.number || '').toLowerCase().includes(q) ||
    (o.customer_email || '').toLowerCase().includes(q) ||
    o.status.toLowerCase().includes(q)
  );
  renderOrders(filtered);
}

document.getElementById('orders-search').addEventListener('input', (e) => {
  filterOrders(e.target.value);
});

function statusBadge(status) {
  const badges = {
    pending: 'badge-warning',
    paid: 'badge-success',
    fulfilled: 'badge-success',
    cancelled: 'badge-danger',
  };
  return badges[status] || 'badge-warning';
}

// ============================================================
// INVENTORY
// ============================================================

async function loadInventory() {
  const tbody = document.getElementById('inventory-tbody');
  const empty = document.getElementById('inventory-empty');
  
  try {
    const data = await api('/v1/inventory');
    cachedInventory = data.items || [];
    renderInventory(cachedInventory);
  } catch (err) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
  }
}

function renderInventory(items) {
  const tbody = document.getElementById('inventory-tbody');
  const empty = document.getElementById('inventory-empty');
  
  if (items.length === 0) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  
  empty.classList.add('hidden');
  tbody.innerHTML = items.map(i => `
    <tr class="table-row">
      <td class="px-4 py-3">${i.sku}</td>
      <td class="px-4 py-3">${i.product_title || '-'}</td>
      <td class="px-4 py-3 text-right">${i.on_hand}</td>
      <td class="px-4 py-3 text-right">${i.reserved}</td>
      <td class="px-4 py-3 text-right">${i.on_hand - i.reserved}</td>
      <td class="px-4 py-3 text-right">
        <button class="text-sm font-medium adjust-btn" style="color: var(--accent)" data-sku="${i.sku}">Adjust</button>
      </td>
    </tr>
  `).join('');
  
  // Re-attach event listeners
  document.querySelectorAll('.adjust-btn').forEach(btn => {
    btn.addEventListener('click', () => openAdjustModal(btn.dataset.sku));
  });
}

function filterInventory(query) {
  const q = query.toLowerCase();
  const filtered = cachedInventory.filter(i => 
    i.sku.toLowerCase().includes(q) ||
    (i.product_title || '').toLowerCase().includes(q)
  );
  renderInventory(filtered);
}

document.getElementById('inventory-search').addEventListener('input', (e) => {
  filterInventory(e.target.value);
});

// Adjust modal
let adjustSku = '';

function openAdjustModal(sku) {
  adjustSku = sku;
  document.getElementById('adjust-sku').textContent = `SKU: ${sku}`;
  document.getElementById('adjust-delta').value = '';
  document.getElementById('adjust-reason').value = 'restock';
  document.getElementById('adjust-modal').classList.remove('hidden');
}

function closeAdjustModal() {
  document.getElementById('adjust-modal').classList.add('hidden');
  adjustSku = '';
}

document.getElementById('adjust-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const delta = parseInt(document.getElementById('adjust-delta').value, 10);
  const reason = document.getElementById('adjust-reason').value;
  
  try {
    await api(`/v1/inventory/${encodeURIComponent(adjustSku)}/adjust`, {
      method: 'POST',
      body: JSON.stringify({ delta, reason }),
    });
    closeAdjustModal();
    loadInventory();
  } catch (err) {
    alert('Failed: ' + err.message);
  }
});

// ============================================================
// PRODUCTS
// ============================================================

async function loadProducts() {
  const tbody = document.getElementById('products-tbody');
  const empty = document.getElementById('products-empty');
  
  try {
    const data = await api('/v1/products');
    cachedProducts = data.items || [];
    renderProducts(cachedProducts);
  } catch (err) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
  }
}

function renderProducts(products) {
  const tbody = document.getElementById('products-tbody');
  const empty = document.getElementById('products-empty');
  
  if (products.length === 0) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  
  empty.classList.add('hidden');
  tbody.innerHTML = products.map(p => `
    <tr class="table-row cursor-pointer product-row" data-id="${p.id}">
      <td class="px-4 py-3">${p.title}</td>
      <td class="px-4 py-3" style="color: var(--text-secondary)">${p.description || '-'}</td>
      <td class="px-4 py-3 text-right">${p.variants?.length || 0}</td>
      <td class="px-4 py-3">
        <span class="px-2 py-0.5 text-xs rounded-sm font-medium ${p.status === 'active' ? 'badge-success' : 'badge-warning'}">${p.status}</span>
      </td>
    </tr>
  `).join('');
  
  // Re-attach event listeners
  document.querySelectorAll('.product-row').forEach(row => {
    row.addEventListener('click', () => openProductDetailModal(row.dataset.id));
  });
}

function filterProducts(query) {
  const q = query.toLowerCase();
  const filtered = cachedProducts.filter(p => 
    p.title.toLowerCase().includes(q) ||
    (p.description || '').toLowerCase().includes(q)
  );
  renderProducts(filtered);
}

document.getElementById('products-search').addEventListener('input', (e) => {
  filterProducts(e.target.value);
});

// Add Product Modal
function openAddProductModal() {
  document.getElementById('product-title').value = '';
  document.getElementById('product-description').value = '';
  document.getElementById('product-modal').classList.remove('hidden');
}

function closeProductModal() {
  document.getElementById('product-modal').classList.add('hidden');
}

document.getElementById('add-product-btn').addEventListener('click', openAddProductModal);

document.getElementById('product-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('product-title').value;
  const description = document.getElementById('product-description').value;
  
  try {
    const product = await api('/v1/products', {
      method: 'POST',
      body: JSON.stringify({ title, description: description || null }),
    });
    closeProductModal();
    loadProducts();
    // Open product detail to add variants
    openProductDetailModal(product.id);
  } catch (err) {
    alert('Failed: ' + err.message);
  }
});

// Product Detail Modal (Multi-step)
function openProductDetailModal(productId) {
  currentProductId = productId;
  const product = cachedProducts.find(p => p.id === productId);
  if (!product) return;
  
  currentVariants = product.variants || [];
  
  document.getElementById('detail-product-title').textContent = product.title;
  document.getElementById('detail-product-description').textContent = product.description || 'No description';
  
  renderVariantsList();
  showDetailStep('list');
  document.getElementById('product-detail-modal').classList.remove('hidden');
}

function closeProductDetailModal() {
  document.getElementById('product-detail-modal').classList.add('hidden');
  currentProductId = null;
  currentVariants = [];
  resetVariantForm();
}

function showDetailStep(step) {
  document.getElementById('detail-step-list').classList.toggle('hidden', step !== 'list');
  document.getElementById('detail-step-add').classList.toggle('hidden', step !== 'add');
}

function renderVariantsList() {
  const list = document.getElementById('variants-list');
  const empty = document.getElementById('variants-empty');
  
  if (currentVariants.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  
  empty.classList.add('hidden');
  list.innerHTML = currentVariants.map(v => `
    <div class="flex items-center gap-4 p-3 border" style="border-color: var(--border); background: var(--bg-subtle)">
      ${v.image_url 
        ? `<img src="${v.image_url}" class="w-12 h-12 object-cover border" style="border-color: var(--border)">`
        : `<div class="w-12 h-12 flex items-center justify-center border" style="border-color: var(--border); background: var(--bg-card)"><svg class="w-5 h-5" style="color: var(--text-muted)" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"/></svg></div>`
      }
      <div class="flex-1 min-w-0">
        <div class="font-medium">${v.title}</div>
        <div class="text-sm font-mono" style="color: var(--text-secondary)">${v.sku}</div>
      </div>
      <div class="text-right font-mono">
        $${(v.price_cents / 100).toFixed(2)}
      </div>
    </div>
  `).join('');
}

// Add Variant Step
document.getElementById('add-variant-btn').addEventListener('click', () => {
  resetVariantForm();
  showDetailStep('add');
});

document.getElementById('back-to-list-btn').addEventListener('click', () => {
  showDetailStep('list');
  resetVariantForm();
});

document.getElementById('cancel-variant-btn').addEventListener('click', () => {
  showDetailStep('list');
  resetVariantForm();
});

function resetVariantForm() {
  document.getElementById('variant-sku').value = '';
  document.getElementById('variant-title').value = '';
  document.getElementById('variant-price').value = '';
  document.getElementById('variant-image').value = '';
  document.getElementById('variant-error').classList.add('hidden');
  document.getElementById('variant-error').textContent = '';
  document.getElementById('variant-image-preview').classList.add('hidden');
  document.getElementById('variant-image-img').src = '';
  document.getElementById('upload-zone').classList.remove('hidden');
  uploadedImageUrl = null;
}

// Image upload handling
document.getElementById('variant-image').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  const uploadLabel = document.getElementById('upload-label');
  const originalText = uploadLabel.textContent;
  uploadLabel.textContent = 'Uploading...';
  
  try {
    const result = await apiUpload(file);
    uploadedImageUrl = result.url;
    
    // Show preview
    document.getElementById('variant-image-img').src = uploadedImageUrl;
    document.getElementById('variant-image-preview').classList.remove('hidden');
    document.getElementById('upload-zone').classList.add('hidden');
  } catch (err) {
    alert('Upload failed: ' + err.message);
    uploadLabel.textContent = originalText;
  }
});

document.getElementById('remove-image-btn').addEventListener('click', () => {
  uploadedImageUrl = null;
  document.getElementById('variant-image').value = '';
  document.getElementById('variant-image-preview').classList.add('hidden');
  document.getElementById('variant-image-img').src = '';
  document.getElementById('upload-zone').classList.remove('hidden');
});

// Submit variant
document.getElementById('variant-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const sku = document.getElementById('variant-sku').value.trim();
  const title = document.getElementById('variant-title').value.trim();
  const price_cents = parseInt(document.getElementById('variant-price').value, 10);
  
  const errorEl = document.getElementById('variant-error');
  const submitBtn = document.getElementById('variant-submit-btn');
  
  if (!sku || !title || isNaN(price_cents) || price_cents < 0) {
    errorEl.textContent = 'Please fill all required fields.';
    errorEl.classList.remove('hidden');
    return;
  }
  
  submitBtn.disabled = true;
  submitBtn.textContent = 'Adding...';
  
  try {
    const variant = await api(`/v1/products/${currentProductId}/variants`, {
      method: 'POST',
      body: JSON.stringify({
        sku,
        title,
        price_cents,
        image_url: uploadedImageUrl || null,
      }),
    });
    
    // Add to local state
    currentVariants.push(variant);
    
    // Re-render
    renderVariantsList();
    showDetailStep('list');
    resetVariantForm();
    
    // Refresh products list to update counts
    loadProducts();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Add Variant';
  }
});

// ============================================================
// MODAL CLOSE HANDLERS (only via X button)
// ============================================================

document.querySelectorAll('.modal-close').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const modal = btn.closest('.fixed');
    if (modal.id === 'adjust-modal') closeAdjustModal();
    else if (modal.id === 'product-modal') closeProductModal();
    else if (modal.id === 'product-detail-modal') closeProductDetailModal();
  });
});

// Don't close on backdrop click - user must click X
// (removed backdrop click handlers)

// ============================================================
// SIDEBAR COLLAPSE
// ============================================================

const sidebar = document.getElementById('sidebar');
const collapseToggle = document.getElementById('collapse-toggle');

function initSidebarCollapse() {
  const collapsed = localStorage.getItem('sidebar_collapsed') === 'true';
  if (collapsed) {
    sidebar.classList.add('collapsed');
  }
}

collapseToggle.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
  localStorage.setItem('sidebar_collapsed', sidebar.classList.contains('collapsed'));
});

// ============================================================
// THEME
// ============================================================

const themeToggle = document.getElementById('theme-toggle');

function updateThemeUI() {
  const isDark = document.documentElement.classList.contains('dark');
  document.getElementById('theme-icon-light').classList.toggle('hidden', isDark);
  document.getElementById('theme-icon-dark').classList.toggle('hidden', !isDark);
  document.getElementById('theme-label').textContent = isDark ? 'Light mode' : 'Dark mode';
}

themeToggle.addEventListener('click', () => {
  const isDark = document.documentElement.classList.contains('dark');
  document.documentElement.classList.toggle('dark', !isDark);
  localStorage.setItem('theme', isDark ? 'light' : 'dark');
  updateThemeUI();
});

// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initSidebarCollapse();
  updateThemeUI();
  
  if (apiUrl && apiKey) {
    showApp();
  } else {
    showLogin();
  }
});
