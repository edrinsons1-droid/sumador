// State variables
let currentUser = null;
let currentProfile = null;
let expenses = [];
let categories = [];
let categoryMap = {}; // id -> name
let colorMap = {}; // id -> color

// Charts instances
let categoryChartInstance = null;
let monthlyChartInstance = null;

// DOM Elements
const body = document.body;
const userNameDisplay = document.getElementById('userNameDisplay');
const logoutBtn = document.getElementById('logoutBtn');
const themeToggle = document.getElementById('themeToggle');
const moonIcon = document.getElementById('moonIcon');
const sunIcon = document.getElementById('sunIcon');

const monthlyTotalEl = document.getElementById('monthlyTotal');
const allTimeTotalEl = document.getElementById('allTimeTotal');
const topCategoryEl = document.getElementById('topCategory');

const expensesTableBody = document.getElementById('expensesTableBody');
const expenseForm = document.getElementById('expenseForm');
const modalError = document.getElementById('expenseError');
const exportBtn = document.getElementById('exportBtn');

// Filters
const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const sortSort = document.getElementById('sortSort');

// Formatters
const formatter = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0
});

const formaterDate = new Intl.DateTimeFormat('es-ES', {
    day: '2-digit', month: 'short', year: 'numeric'
});

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Check Auth
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
        window.location.href = 'login.html';
        return;
    }
    
    currentUser = session.user;
    
    // Smooth reveal
    body.style.opacity = '1';

    // 2. Load User Profile
    const { data: profile } = await supabase
        .from('usuarios')
        .select('*')
        .eq('id', currentUser.id)
        .single();
        
    if (profile) {
        currentProfile = profile;
        userNameDisplay.textContent = profile.nombre;
    } else {
        userNameDisplay.textContent = currentUser.email.split('@')[0];
    }
    
    // 3. Init Theme
    initTheme();

    // 4. Load Data
    await loadCategories();
    await loadExpenses();

    // 5. Setup Listeners
    setupListeners();
});

// Authentication Listeners
logoutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = 'login.html';
});

// Theme Management
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'dark') {
        body.setAttribute('data-theme', 'dark');
        moonIcon.classList.add('hidden');
        sunIcon.classList.remove('hidden');
    }
}

themeToggle.addEventListener('click', () => {
    const currentTheme = body.getAttribute('data-theme');
    if (currentTheme === 'dark') {
        body.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
        moonIcon.classList.remove('hidden');
        sunIcon.classList.add('hidden');
    } else {
        body.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
        moonIcon.classList.add('hidden');
        sunIcon.classList.remove('hidden');
    }
    
    // Update charts to match theme
    if (categoryChartInstance) updateCharts();
});

// Data Loading
async function loadCategories() {
    const { data, error } = await supabase
        .from('categorias')
        .select('*')
        .order('nombre');
        
    if (error) {
        console.error('Error cargando categorias:', error);
        return;
    }
    
    categories = data;
    
    const expenseCatSelect = document.getElementById('expenseCat');
    expenseCatSelect.innerHTML = '<option value="">Selecciona una categoría</option>';
    categoryFilter.innerHTML = '<option value="">Todas las categorías</option>';
    
    categories.forEach(cat => {
        categoryMap[cat.id] = cat.nombre;
        colorMap[cat.nombre] = cat.color;
        
        // Populate modal select
        const option = document.createElement('option');
        option.value = cat.id;
        option.textContent = cat.nombre;
        expenseCatSelect.appendChild(option);
        
        // Populate filter select
        const filterOpt = document.createElement('option');
        filterOpt.value = cat.id;
        filterOpt.textContent = cat.nombre;
        categoryFilter.appendChild(filterOpt);
    });
}

async function loadExpenses() {
    expensesTableBody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding: 2rem;"><div class="loader"></div> Cargando gastos...</td></tr>';
    
    const { data, error } = await supabase
        .from('gastos')
        .select('*');
        // Removing order here so we sort in JS based on selections
        
    if (error) {
        console.error('Error cargando gastos:', error);
        expensesTableBody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error al cargar datos.</td></tr>';
        return;
    }
    
    expenses = data;
    processData();
}

// Processing Data & UI Updates
function processData() {
    updateDashboardStats();
    renderTable();
    updateCharts();
}

// Stats
function updateDashboardStats() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    let monthTotal = 0;
    let allTotal = 0;
    let catTotals = {};
    
    expenses.forEach(exp => {
        const amount = parseFloat(exp.monto);
        allTotal += amount;
        
        const date = new Date(exp.fecha);
        // Correct timezone offset issue simply
        date.setMinutes(date.getMinutes() + date.getTimezoneOffset());
        
        if(date.getMonth() === currentMonth && date.getFullYear() === currentYear) {
            monthTotal += amount;
        }
        
        const catName = categoryMap[exp.categoria] || 'Desconocido';
        catTotals[catName] = (catTotals[catName] || 0) + amount;
    });
    
    monthlyTotalEl.textContent = formatter.format(monthTotal);
    allTimeTotalEl.textContent = formatter.format(allTotal);
    
    // Top Category
    let topCat = '-';
    let maxAmt = 0;
    for (const [cat, amt] of Object.entries(catTotals)) {
        if (amt > maxAmt) {
            maxAmt = amt;
            topCat = cat;
        }
    }
    topCategoryEl.textContent = topCat;
}

// Tables
function renderTable() {
    // Apply filters and sort
    const searchTerm = searchInput.value.toLowerCase();
    const filterCat = categoryFilter.value;
    const sortBy = sortSort.value;
    
    let filtered = expenses.filter(exp => {
        const matchesSearch = exp.descripcion.toLowerCase().includes(searchTerm);
        const matchesCat = filterCat ? exp.categoria === filterCat : true;
        return matchesSearch && matchesCat;
    });
    
    // Sorting
    filtered.sort((a, b) => {
        if (sortBy === 'fecha_desc') return new Date(b.fecha) - new Date(a.fecha);
        if (sortBy === 'fecha_asc') return new Date(a.fecha) - new Date(b.fecha);
        if (sortBy === 'monto_desc') return parseFloat(b.monto) - parseFloat(a.monto);
        if (sortBy === 'monto_asc') return parseFloat(a.monto) - parseFloat(b.monto);
        return 0;
    });
    
    if (filtered.length === 0) {
        expensesTableBody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding: 2rem;">No se encontraron gastos.</td></tr>';
        return;
    }
    
    expensesTableBody.innerHTML = '';
    
    filtered.forEach(exp => {
        const tr = document.createElement('tr');
        
        const dateObj = new Date(exp.fecha);
        dateObj.setMinutes(dateObj.getMinutes() + dateObj.getTimezoneOffset());
        const displayDate = formaterDate.format(dateObj);
        
        const catName = categoryMap[exp.categoria] || 'Desconocido';
        const color = colorMap[catName] || '#9ca3af';
        
        tr.innerHTML = `
            <td>${displayDate}</td>
            <td style="font-weight: 500;">${exp.descripcion}</td>
            <td>
                <span class="badge" style="background-color: ${color}20; color: ${color}; border: 1px solid ${color}40;">
                    ${catName}
                </span>
            </td>
            <td style="font-weight: 600;">${formatter.format(exp.monto)}</td>
            <td style="text-align: right;">
                <button class="btn-icon" onclick="editExpense('${exp.id}')" title="Editar">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                </button>
                <button class="btn-icon delete" onclick="deleteExpense('${exp.id}')" title="Eliminar">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                </button>
            </td>
        `;
        
        expensesTableBody.appendChild(tr);
    });
}

// Charts
function updateCharts() {
    const isDark = body.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#d1d5db' : '#4b5563';
    const gridColor = isDark ? '#374151' : '#e5e7eb';
    
    Chart.defaults.color = textColor;
    Chart.defaults.font.family = "'Inter', sans-serif";

    renderCategoryChart(textColor);
    renderMonthlyChart(textColor, gridColor);
}

function renderCategoryChart(textColor) {
    const ctx = document.getElementById('categoryChart').getContext('2d');
    
    let catTotals = {};
    expenses.forEach(exp => {
        const catName = categoryMap[exp.categoria] || 'Desconocido';
        catTotals[catName] = (catTotals[catName] || 0) + parseFloat(exp.monto);
    });
    
    const labels = Object.keys(catTotals);
    const data = Object.values(catTotals);
    const bgColors = labels.map(l => colorMap[l] || '#9ca3af');
    
    if (categoryChartInstance) {
        categoryChartInstance.destroy();
    }
    
    if (labels.length === 0) return; // Don't draw empty chart

    categoryChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: bgColors,
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: textColor, usePointStyle: true, boxWidth: 8 }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return ' ' + formatter.format(context.raw);
                        }
                    }
                }
            }
        }
    });
}

function renderMonthlyChart(textColor, gridColor) {
    const ctx = document.getElementById('monthlyChart').getContext('2d');
    
    // Group by month YYYY-MM
    let monthlyData = {};
    
    expenses.forEach(exp => {
        const dateObj = new Date(exp.fecha);
        // Quick tz fix for mapping
        dateObj.setMinutes(dateObj.getMinutes() + dateObj.getTimezoneOffset());
        
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const key = `${dateObj.getFullYear()}-${month}`;
        
        monthlyData[key] = (monthlyData[key] || 0) + parseFloat(exp.monto);
    });
    
    // Sort keys chronological
    const sortedKeys = Object.keys(monthlyData).sort();
    
    const labels = sortedKeys.map(k => {
        const [y, m] = k.split('-');
        const d = new Date(y, parseInt(m)-1, 1);
        return new Intl.DateTimeFormat('es-ES', { month: 'short', year: 'numeric' }).format(d);
    });
    const data = sortedKeys.map(k => monthlyData[k]);
    
    if (monthlyChartInstance) {
        monthlyChartInstance.destroy();
    }
    
    if (labels.length === 0) return;

    // Primary color based on theme
    const primaryColor = getComputedStyle(body).getPropertyValue('--primary').trim() || '#4f46e5';

    let gradient = ctx.createLinearGradient(0, 0, 0, 300);
    // Parse hex to rgba
    gradient.addColorStop(0, `${primaryColor}60`); // 60 is roughly 40% opacity ignoring proper hex alpha format, let's use standard:
    gradient.addColorStop(0, 'rgba(79, 70, 229, 0.4)');
    gradient.addColorStop(1, 'rgba(79, 70, 229, 0.0)');

    monthlyChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Gastos Mensuales',
                data: data,
                fill: true,
                backgroundColor: gradient,
                borderColor: primaryColor,
                borderWidth: 2,
                tension: 0.4,
                pointBackgroundColor: primaryColor,
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: gridColor, drawBorder: false },
                    ticks: {
                        color: textColor,
                        callback: function(value) {
                            if (value >= 1000000) return '$' + (value / 1000000) + 'M';
                            if (value >= 1000) return '$' + (value / 1000) + 'k';
                            return '$' + value;
                        }
                    }
                },
                x: {
                    grid: { display: false, drawBorder: false },
                    ticks: { color: textColor }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return ' Total: ' + formatter.format(context.raw);
                        }
                    }
                }
            }
        }
    });
}

// Modals
function openModal(id) {
    document.getElementById(id).classList.add('active');
    
    // Clear form if it's "add"
    if (document.getElementById('expenseId').value === '') {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        document.getElementById('expenseDate').value = `${yyyy}-${mm}-${dd}`;
    }
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
    document.getElementById('expenseForm').reset();
    document.getElementById('expenseId').value = '';
    modalError.classList.remove('show');
}

// Global scope for HTML onclick
window.openModal = openModal;
window.closeModal = closeModal;

// Create / Edit Expense
expenseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('expenseId').value;
    const desc = document.getElementById('expenseDesc').value;
    const cat = document.getElementById('expenseCat').value;
    const amount = document.getElementById('expenseAmount').value;
    const dateStr = document.getElementById('expenseDate').value;
    
    const btn = document.getElementById('saveExpenseBtn');
    
    modalError.classList.remove('show');
    btn.disabled = true;
    btn.innerHTML = '<div class="loader" style="width: 16px; height: 16px; border-width: 2px;"></div> Guardando...';
    
    const payload = {
        user_id: currentUser.id,
        descripcion: desc,
        categoria: cat,
        monto: amount,
        fecha: dateStr
    };
    
    try {
        let errorResult;
        
        if (id) {
            const { error } = await supabase
                .from('gastos')
                .update(payload)
                .eq('id', id);
            errorResult = error;
        } else {
            const { error } = await supabase
                .from('gastos')
                .insert([payload]);
            errorResult = error;
        }
        
        if (errorResult) throw errorResult;
        
        closeModal('addExpenseModal');
        await loadExpenses(); // Refresh all
        
    } catch (error) {
        modalError.textContent = 'Error: ' + error.message;
        modalError.classList.add('show');
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Guardar';
    }
});

// Edit function called from table
window.editExpense = (id) => {
    const exp = expenses.find(e => e.id === id);
    if (!exp) return;
    
    document.getElementById('expenseId').value = exp.id;
    document.getElementById('expenseDesc').value = exp.descripcion;
    document.getElementById('expenseCat').value = exp.categoria;
    document.getElementById('expenseAmount').value = exp.monto;
    document.getElementById('expenseDate').value = exp.fecha;
    
    document.getElementById('modalTitle').textContent = 'Editar Gasto';
    
    openModal('addExpenseModal');
};

// Delete function called from table
window.deleteExpense = async (id) => {
    if(!confirm('¿Estás seguro de que deseas eliminar este gasto?')) return;
    
    const { error } = await supabase
        .from('gastos')
        .delete()
        .eq('id', id);
        
    if (error) {
        alert('Error al eliminar: ' + error.message);
        return;
    }
    
    await loadExpenses();
};

// Filtering & Search
function setupListeners() {
    searchInput.addEventListener('input', renderTable);
    categoryFilter.addEventListener('change', renderTable);
    sortSort.addEventListener('change', renderTable);
}

// Export to Excel
exportBtn.addEventListener('click', () => {
    if (expenses.length === 0) {
        alert('No hay datos para exportar');
        return;
    }
    
    const exportData = expenses.map(exp => {
        return {
            'Fecha': exp.fecha,
            'Descripción': exp.descripcion,
            'Categoría': categoryMap[exp.categoria] || 'Desconocido',
            'Monto (COP)': parseFloat(exp.monto)
        };
    });
    
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Gastos");
    
    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `Gastos_${dateStr}.xlsx`);
});
