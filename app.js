// app.js
window.addEventListener('error', function(e) {
    document.body.innerHTML += '<div style="color:red;z-index:9999;position:fixed;top:0;left:0;background:white;padding:20px;">' + e.message + '</div>';
});
window.addEventListener('unhandledrejection', function(e) {
    document.body.innerHTML += '<div style="color:red;z-index:9999;position:fixed;top:50px;left:0;background:white;padding:20px;">' + e.reason + '</div>';
});
// --- Supabase Config ---
const SUPABASE_URL = 'https://txaskjwmkpjvrpupngmj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4YXNrandta3BqdnJwdXBuZ21qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxOTMwOTQsImV4cCI6MjA4ODc2OTA5NH0.SIsBGhq3QQsYoaJrGlmuvnwyor58NeFGR4JhQFiS6iM'; // Given from API
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Global State ---
let currentUser = null;
let currentProfile = null; // Data from 'usuarios' table
let excelData = {
    filas: 10,
    columnas: 5,
    celdas: {} // { "A1": "10", "B1": "=A1*2" }
};
let charts = {};
let autoSaveTimeout = null;

// --- DOM Elements ---
const DOM = {
    toast: document.getElementById('toast'),
    authSection: document.getElementById('auth-section'),
    appSection: document.getElementById('app-section'),
    loginContainer: document.getElementById('login-container'),
    registerContainer: document.getElementById('register-container'),
    loginForm: document.getElementById('login-form'),
    registerForm: document.getElementById('register-form'),
    navBtns: document.querySelectorAll('.nav-btn'),
    navAdminBtn: document.getElementById('nav-admin-btn'),
    userGreeting: document.getElementById('user-greeting'),
    logoutBtn: document.getElementById('logout-btn'),
    views: document.querySelectorAll('.view-container'),
    excelTableHeadTr: document.getElementById('excel-thead-tr'),
    excelTableBody: document.getElementById('excel-tbody'),
    addRowBtn: document.getElementById('add-row-btn'),
    addColBtn: document.getElementById('add-col-btn'),
    saveExcelBtn: document.getElementById('save-excel-btn'),
    saveStatus: document.getElementById('save-status'),
    personasForm: document.getElementById('personas-form'),
    adminUsersList: document.getElementById('admin-users-list'),
    adminPersonasList: document.getElementById('admin-personas-list')
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initAuthListeners();
    initUIEvents();
});

// --- UI Utilities ---
function showToast(message, type = 'success') {
    DOM.toast.textContent = message;
    DOM.toast.className = `toast show ${type}`;
    setTimeout(() => {
        DOM.toast.className = 'toast hidden';
    }, 3000);
}

window.switchAuthView = function(view) {
    if (view === 'register') {
        DOM.loginContainer.classList.add('hidden');
        DOM.registerContainer.classList.remove('hidden');
    } else {
        DOM.registerContainer.classList.add('hidden');
        DOM.loginContainer.classList.remove('hidden');
    }
};

function switchAppView(targetId) {
    DOM.navBtns.forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-target="${targetId}"]`).classList.add('active');
    
    DOM.views.forEach(view => view.classList.add('hidden'));
    document.getElementById(targetId).classList.remove('hidden');

    if (targetId === 'admin-view') {
        loadAdminData();
    }
}

// --- Specific UI Listeners ---
function initUIEvents() {
    // Navigation
    DOM.navBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            switchAppView(e.target.dataset.target);
        });
    });

    // Logout
    DOM.logoutBtn.addEventListener('click', async () => {
        await supabase.auth.signOut();
    });

    // Excel Actions
    DOM.addRowBtn.addEventListener('click', () => {
        excelData.filas++;
        renderExcelTable();
        autoSaveExcel();
    });
    DOM.addColBtn.addEventListener('click', () => {
        excelData.columnas++;
        renderExcelTable();
        autoSaveExcel();
    });
    DOM.saveExcelBtn.addEventListener('click', () => {
        saveExcelToDB();
    });

    // Table Input Delegation
    DOM.excelTableBody.addEventListener('input', (e) => {
        if (e.target.tagName === 'INPUT') {
            const cellId = e.target.dataset.cell;
            excelData.celdas[cellId] = e.target.value;
            // Update other formula cells
            updateAllFormulaCells();
            updateCharts();
            autoSaveExcel();
        }
    });

    // Personas Form
    DOM.personasForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nombre = document.getElementById('persona-name').value;
        const correo = document.getElementById('persona-email').value;
        const telefono = document.getElementById('persona-phone').value;
        const fecha = document.getElementById('persona-date').value;

        const { error } = await supabase.from('personas').insert([
            { nombre, correo, telefono, fecha, creado_por: currentUser.id }
        ]);

        if (error) {
            showToast('Error al guardar persona', 'error');
            console.error(error);
        } else {
            showToast('Persona guardada exitosamente');
            DOM.personasForm.reset();
        }
    });
}

// --- Auth Module ---
window.handleRegister = async function() {
    const name = document.getElementById('register-name').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: { nombre: name }
        }
    });

    if (error) {
        let msg = error.message;
        if (msg.includes('already registered')) msg = 'El usuario ya está registrado.';
        if (msg.includes('Password should be at least')) msg = 'La contraseña debe tener al menos 6 caracteres.';
        showToast(msg, 'error');
        return;
    }

    if (!data.session) {
        showToast('Registro exitoso. Por favor revisa tu correo para confirmar tu cuenta y luego inicia sesión.');
        DOM.registerForm.reset();
        window.switchAuthView('login');
    } else {
        showToast('Registro exitoso. Iniciando sesión...');
    }
};

window.handleLogin = async function() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    const { error } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (error) {
        showToast('Credenciales incorrectas', 'error');
    }
};

function initAuthListeners() {
    supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
            currentUser = session.user;
            DOM.authSection.classList.add('hidden');
            DOM.appSection.classList.remove('hidden');
            fetchUserProfile();
            loadExcelData();
        } else {
            currentUser = null;
            currentProfile = null;
            DOM.authSection.classList.remove('hidden');
            DOM.appSection.classList.add('hidden');
            resetApp();
        }
    });
}

async function fetchUserProfile() {
    const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('id', currentUser.id)
        .single();
    
    if (data) {
        currentProfile = data;
        DOM.userGreeting.textContent = `Hola, ${currentProfile.nombre}`;
        if (currentProfile.is_admin) {
            DOM.navAdminBtn.classList.remove('hidden');
        } else {
            DOM.navAdminBtn.classList.add('hidden');
            // If currently on admin view, kick them out
            if (!document.getElementById('admin-view').classList.contains('hidden')) {
                switchAppView('excel-view');
            }
        }
    }
}

function resetApp() {
    DOM.registerForm.reset();
    DOM.loginForm.reset();
    excelData = { filas: 10, columnas: 5, celdas: {} };
    switchAppView('excel-view');
}

// --- Excel Logic Module ---

function getColumnLetter(colIndex) {
    let temp, letter = '';
    while (colIndex > 0) {
        temp = (colIndex - 1) % 26;
        letter = String.fromCharCode(temp + 65) + letter;
        colIndex = (colIndex - temp - 1) / 26;
    }
    return letter;
}

function renderExcelTable() {
    // Render Header
    let theadHTML = '<th class="row-header"></th>';
    for (let c = 1; c <= excelData.columnas; c++) {
        theadHTML += `<th>${getColumnLetter(c)}</th>`;
    }
    DOM.excelTableHeadTr.innerHTML = theadHTML;

    // Render Body
    let tbodyHTML = '';
    for (let r = 1; r <= excelData.filas; r++) {
        tbodyHTML += '<tr>';
        tbodyHTML += `<th class="row-header">${r}</th>`;
        for (let c = 1; c <= excelData.columnas; c++) {
            const cellId = `${getColumnLetter(c)}${r}`;
            const rawValue = excelData.celdas[cellId] || '';
            const displayValue = evaluateCell(cellId, rawValue);
            
            tbodyHTML += `<td><input type="text" data-cell="${cellId}" 
                value="${rawValue.toString().startsWith('=') ? rawValue : displayValue}" 
                onfocus="this.value='${rawValue}'" 
                onblur="this.value=window.evaluateCell('${cellId}')"
                ></td>`;
        }
        tbodyHTML += '</tr>';
    }
    DOM.excelTableBody.innerHTML = tbodyHTML;
    
    // Quick re-evaluation of all inputs to show computed values initially
    const inputs = DOM.excelTableBody.querySelectorAll('input');
    inputs.forEach(input => {
        const id = input.dataset.cell;
        input.value = evaluateCell(id);
    });
    
    updateCharts();
}

// Global hook for onblur evaluating
window.evaluateCell = function(cellId, valueOverride) {
    const rawValue = valueOverride !== undefined ? valueOverride : (excelData.celdas[cellId] || '');
    if (!rawValue.toString().startsWith('=')) return rawValue;

    try {
        let formula = rawValue.substring(1).toUpperCase(); // remove '='
        
        // Replace SUMA(A1:A5)
        formula = formula.replace(/SUMA\(([A-Z]+[0-9]+):([A-Z]+[0-9]+)\)/g, (match, start, end) => {
            return sumRange(start, end);
        });

        // Replace cell references with their numeric values
        formula = formula.replace(/[A-Z]+[0-9]+/g, (match) => {
            // Prevent self-reference loops easily (basic check)
            if (match === cellId) return 0;
            const refVal = excelData.celdas[match] || 0;
            // If reference is also a formula, evaluate it recursively (simplified)
            let parsedVal = refVal;
            if (refVal.toString().startsWith('=')) {
                // Avoid deep recursion just parse if simple
                parsedVal = window.evaluateCell(match);
            }
            const num = parseFloat(parsedVal);
            return isNaN(num) ? 0 : num;
        });

        // Evaluate math safely (instead of eval, we use a simple Math.evaluate if available, or Function)
        // Only allow basic math chars
        if (/^[0-9+\-*/().\s]+$/.test(formula)) {
            return Function(`'use strict'; return (${formula})`)();
        }
        return "#ERROR";

    } catch (e) {
        return "#ERROR";
    }
}

function sumRange(startId, endId) {
    // Extract col and row
    const startCol = startId.replace(/[0-9]/g, '');
    const startRow = parseInt(startId.replace(/[A-Z]/g, ''));
    const endCol = endId.replace(/[0-9]/g, '');
    const endRow = parseInt(endId.replace(/[A-Z]/g, ''));
    
    const startColCharCode = startCol.charCodeAt(0);
    const endColCharCode = endCol.charCodeAt(0);
    
    let sum = 0;
    for (let c = Math.min(startColCharCode, endColCharCode); c <= Math.max(startColCharCode, endColCharCode); c++) {
        const colString = String.fromCharCode(c);
        for (let r = Math.min(startRow, endRow); r <= Math.max(startRow, endRow); r++) {
            const cellId = `${colString}${r}`;
            if(excelData.celdas[cellId] !== undefined) {
                 let val = excelData.celdas[cellId];
                 if (val.toString().startsWith('=')) {
                    val = window.evaluateCell(cellId);
                 }
                 const num = parseFloat(val);
                 if(!isNaN(num)) sum += num;
            }
        }
    }
    return sum;
}

function updateAllFormulaCells() {
    const inputs = DOM.excelTableBody.querySelectorAll('input');
    inputs.forEach(input => {
        const raw = excelData.celdas[input.dataset.cell] || '';
        if (raw.toString().startsWith('=')) {
             // Just update display if not focused
             if(document.activeElement !== input) {
                 input.value = evaluateCell(input.dataset.cell);
             }
        }
    });
}

async function loadExcelData() {
    const { data, error } = await supabase
        .from('datos_tabla')
        .select('hoja_datos')
        .eq('user_id', currentUser.id)
        .single();
    
    if (data && data.hoja_datos) {
        excelData = data.hoja_datos;
    }
    renderExcelTable();
}

function autoSaveExcel() {
    DOM.saveStatus.textContent = 'Guardando...';
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(() => {
        saveExcelToDB();
    }, 2000);
}

async function saveExcelToDB() {
    DOM.saveStatus.textContent = 'Guardando...';
    // Upsert equivalent since user_id is PK
    const { error } = await supabase
        .from('datos_tabla')
        .upsert({ 
            user_id: currentUser.id, 
            hoja_datos: excelData,
            updated_at: new Date().toISOString()
        });
    
    if (error) {
        console.error(error);
        DOM.saveStatus.textContent = 'Error al guardar';
    } else {
        DOM.saveStatus.textContent = 'Guardado ' + new Date().toLocaleTimeString();
    }
}

// --- Charts Logic ---
function initCharts() {
    const commonOptions = { responsive: true, maintainAspectRatio: false };
    
    // Bar
    const ctxBar = document.getElementById('barChart').getContext('2d');
    charts.bar = new Chart(ctxBar, { type: 'bar', data: { labels: [], datasets: [] }, options: commonOptions });
    
    // Line
    const ctxLine = document.getElementById('lineChart').getContext('2d');
    charts.line = new Chart(ctxLine, { type: 'line', data: { labels: [], datasets: [] }, options: commonOptions });
    
    // Pie
    const ctxPie = document.getElementById('pieChart').getContext('2d');
    charts.pie = new Chart(ctxPie, { type: 'pie', data: { labels: [], datasets: [] }, options: commonOptions });
}

function updateCharts() {
    if (!charts.bar) initCharts();

    // Extract col A for labels, Col B for data
    const labels = [];
    const data = [];
    
    for (let r = 1; r <= excelData.filas; r++) {
        let label = excelData.celdas[`A${r}`];
        let valRaw = excelData.celdas[`B${r}`];
        
        if (label && valRaw !== undefined && valRaw !== '') {
            let val = parseFloat(window.evaluateCell(`B${r}`, valRaw));
            if (!isNaN(val)) {
                labels.push(label);
                data.push(val);
            }
        }
    }

    const dataset = [{
        label: 'Valores',
        data: data,
        backgroundColor: [
            '#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#3B82F6', '#EC4899'
        ],
        borderWidth: 1
    }];

    // Update Bar
    charts.bar.data.labels = labels;
    charts.bar.data.datasets = dataset;
    charts.bar.update();

    // Update Line
    charts.line.data.labels = labels;
    charts.line.data.datasets = [{...dataset[0], borderColor: '#4F46E5', fill: false}];
    charts.line.update();

    // Update Pie
    charts.pie.data.labels = labels;
    charts.pie.data.datasets = dataset;
    charts.pie.update();
}

// --- Admin Logic ---
async function loadAdminData() {
    // Check if admin
    if (!currentProfile || !currentProfile.is_admin) return;

    // Load Users
    const { data: users, error: errUsers } = await supabase.from('usuarios').select('*');
    if (!errUsers) {
        let usersHTML = '';
        users.forEach(u => {
            usersHTML += `<tr>
                <td>${u.nombre}</td>
                <td>${u.correo}</td>
                <td>${new Date(u.created_at).toLocaleDateString()}</td>
                <td>
                    <button class="btn btn-danger btn-sm" onclick="deleteRecord('usuarios', '${u.id}')">Eliminar</button>
                </td>
            </tr>`;
        });
        DOM.adminUsersList.innerHTML = usersHTML;
    }

    // Load Personas
    const { data: personas, error: errPersonas } = await supabase.from('personas').select('*');
    if (!errPersonas) {
        let personasHTML = '';
        personas.forEach(p => {
            personasHTML += `<tr>
                <td>${p.nombre}</td>
                <td>${p.correo}</td>
                <td>${p.telefono}</td>
                <td>
                    <button class="btn btn-danger btn-sm" onclick="deleteRecord('personas', '${p.id}')">Eliminar</button>
                </td>
            </tr>`;
        });
        DOM.adminPersonasList.innerHTML = personasHTML;
    }
}

window.deleteRecord = async function(table, id) {
    if(!confirm('¿Estás seguro de eliminar este registro?')) return;
    
    // In actual auth.users, deleting from 'usuarios' won't delete the auth user, 
    // but we can try to delete from public schemas. (Full delete requires edge function)
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) {
        showToast('Error al eliminar: ' + error.message, 'error');
    } else {
        showToast('Eliminado correctamente');
        loadAdminData(); // Refresh list
    }
};
