let authToken = localStorage.getItem('tolunay_token');
let allKeys = [];

document.addEventListener('DOMContentLoaded', () => {
    if (authToken) {
        checkSession();
    } else {
        showLogin();
    }

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = document.getElementById('loginUser').value;
        const pass = document.getElementById('loginPass').value;
        const errDiv = document.getElementById('loginError');

        try {
            const res = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: user, password: pass })
            });
            const data = await res.json();
            if (data.success) {
                authToken = data.token;
                localStorage.setItem('tolunay_token', authToken);
                errDiv.classList.add('hidden');
                showDashboard();
            } else {
                errDiv.innerText = data.message || 'Login failed';
                errDiv.classList.remove('hidden');
            }
        } catch (err) {
            errDiv.innerText = 'Server connection error';
            errDiv.classList.remove('hidden');
        }
    });

    const ep = document.getElementById('endpointUrl');
    if (ep) {
        ep.innerText = window.location.origin + '/api/v1/verify';
    }
});

function showLogin() {
    document.getElementById('loginSection').classList.remove('hidden');
    document.getElementById('appSection').classList.add('hidden');
}

function showDashboard() {
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('appSection').classList.remove('hidden');
    loadStats();
    loadKeys();
    loadLogs();
}

function logout() {
    localStorage.removeItem('tolunay_token');
    authToken = null;
    showLogin();
}

async function checkSession() {
    try {
        const res = await fetch('/api/admin/stats', {
            headers: { 'Authorization': authToken }
        });
        if (res.ok) {
            showDashboard();
        } else {
            logout();
        }
    } catch {
        logout();
    }
}

function switchTab(tabId) {
    const tabs = ['dashboard', 'licenses', 'users', 'api'];
    tabs.forEach(t => {
        const el = document.getElementById('tab-' + t);
        const nav = document.getElementById('nav-' + t);
        if (el) el.classList.add('hidden');
        if (nav) {
            nav.classList.remove('text-indigo-400', 'bg-indigo-600/10');
            nav.classList.add('text-slate-400');
        }
    });

    const activeEl = document.getElementById('tab-' + tabId);
    const activeNav = document.getElementById('nav-' + tabId);
    if (activeEl) activeEl.classList.remove('hidden');
    if (activeNav) {
        activeNav.classList.add('text-indigo-400', 'bg-indigo-600/10');
        activeNav.classList.remove('text-slate-400');
    }

    const titleMap = {
        'dashboard': 'Dashboard Overview',
        'licenses': 'License Management (Keys)',
        'users': 'Active Users & Authorization Logs',
        'api': 'API Integration Documentation'
    };
    document.getElementById('pageTitle').innerText = titleMap[tabId] || 'Dashboard';

    if (tabId === 'licenses') loadKeys();
    if (tabId === 'users') loadLogs();
}

async function loadStats() {
    try {
        const res = await fetch('/api/admin/stats', {
            headers: { 'Authorization': authToken }
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('statTotal').innerText = data.stats.totalKeys;
            document.getElementById('statUsed').innerText = data.stats.usedKeys;
            document.getElementById('statUnused').innerText = data.stats.unusedKeys;
            document.getElementById('statBanned').innerText = data.stats.bannedKeys;

            const tbody = document.getElementById('recentLoginsBody');
            tbody.innerHTML = '';
            if (data.recentLogs && data.recentLogs.length > 0) {
                data.recentLogs.forEach(log => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td class="py-2.5 font-mono text-indigo-300 font-semibold">${escapeHtml(log.key)}</td>
                        <td class="py-2.5 font-mono text-slate-400">${escapeHtml(log.hwid ? log.hwid.substring(0, 16) + '...' : 'N/A')}</td>
                        <td class="py-2.5 text-slate-400">${escapeHtml(log.ip || 'Local')}</td>
                        <td class="py-2.5 text-slate-500">${new Date(log.time).toLocaleTimeString()}</td>
                    `;
                    tbody.appendChild(row);
                });
            } else {
                tbody.innerHTML = '<tr><td colspan="4" class="py-3 text-center text-slate-500">No login activity yet.</td></tr>';
            }
        }
    } catch (e) {
        console.error('Stats error:', e);
    }
}

async function loadKeys() {
    try {
        const res = await fetch('/api/admin/keys', {
            headers: { 'Authorization': authToken }
        });
        const data = await res.json();
        if (data.success) {
            allKeys = data.keys;
            renderKeysTable(allKeys);
        }
    } catch (e) {
        console.error('Keys error:', e);
    }
}

function renderKeysTable(keys) {
    const tbody = document.getElementById('keysTableBody');
    tbody.innerHTML = '';

    if (!keys || keys.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-slate-500">No license keys found.</td></tr>';
        return;
    }

    keys.forEach(k => {
        let badge = '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">Unused</span>';
        if (k.status === 'used') {
            badge = '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Active</span>';
        } else if (k.status === 'banned') {
            badge = '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">Banned</span>';
        }

        const dur = k.durationDays >= 9000 ? 'Lifetime' : k.durationDays + ' Days';
        const exp = k.expiresAt ? (k.expiresAt === 'Lifetime' ? 'Lifetime' : new Date(k.expiresAt).toLocaleDateString()) : 'Not activated';

        const row = document.createElement('tr');
        row.className = 'hover:bg-slate-800/30 transition';
        row.innerHTML = `
            <td class="p-3.5 font-mono text-indigo-300 font-bold flex items-center gap-2">
                <span>${escapeHtml(k.key)}</span>
                <button onclick="copyToClipboard('${k.key}')" title="Copy Key" class="text-slate-500 hover:text-white"><i class="fa-regular fa-copy"></i></button>
            </td>
            <td class="p-3.5">${badge}</td>
            <td class="p-3.5 text-slate-300">${dur}</td>
            <td class="p-3.5 font-mono text-slate-400 text-[11px]">${k.hwid ? escapeHtml(k.hwid.substring(0, 18) + '...') : '<span class="text-slate-600">Unbound</span>'}</td>
            <td class="p-3.5 text-slate-400">${exp}</td>
            <td class="p-3.5 text-slate-400">${escapeHtml(k.note || '-')}</td>
            <td class="p-3.5 text-right space-x-1.5">
                <button onclick="resetHwid('${k.id}')" title="Reset HWID" class="p-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded transition"><i class="fa-solid fa-arrows-rotate"></i></button>
                <button onclick="toggleBan('${k.id}')" title="${k.status === 'banned' ? 'Unban' : 'Ban'}" class="p-1.5 bg-slate-800 hover:bg-slate-700 text-rose-400 rounded transition"><i class="fa-solid fa-ban"></i></button>
                <button onclick="deleteKey('${k.id}')" title="Delete" class="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-red-400 rounded transition"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function filterKeys() {
    const q = document.getElementById('searchKeys').value.toLowerCase();
    const st = document.getElementById('filterStatus').value;

    const filtered = allKeys.filter(k => {
        const matchesQuery = k.key.toLowerCase().includes(q) || 
            (k.hwid && k.hwid.toLowerCase().includes(q)) || 
            (k.note && k.note.toLowerCase().includes(q));
        const matchesStatus = st === 'all' || k.status === st;
        return matchesQuery && matchesStatus;
    });

    renderKeysTable(filtered);
}

async function generateKeys(count, duration, note, prefix = "TOLUNAY") {
    try {
        const res = await fetch('/api/admin/keys/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authToken
            },
            body: JSON.stringify({ count, duration, note, prefix })
        });
        const data = await res.json();
        if (data.success) {
            alert(`Generated ${data.count} keys successfully!`);
            loadStats();
            loadKeys();
        }
    } catch (e) {
        alert('Generation failed');
    }
}

async function resetHwid(id) {
    if (!confirm('Are you sure you want to reset HWID for this key?')) return;
    try {
        const res = await fetch('/api/admin/keys/reset_hwid', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': authToken },
            body: JSON.stringify({ id })
        });
        const data = await res.json();
        if (data.success) {
            loadKeys();
        }
    } catch (e) {
        alert('Failed to reset HWID');
    }
}

async function toggleBan(id) {
    try {
        const res = await fetch('/api/admin/keys/toggle_ban', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': authToken },
            body: JSON.stringify({ id })
        });
        const data = await res.json();
        if (data.success) {
            loadKeys();
            loadStats();
        }
    } catch (e) {
        alert('Action failed');
    }
}

async function deleteKey(id) {
    if (!confirm('Are you sure you want to permanently delete this key?')) return;
    try {
        const res = await fetch('/api/admin/keys/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': authToken },
            body: JSON.stringify({ id })
        });
        const data = await res.json();
        if (data.success) {
            loadKeys();
            loadStats();
        }
    } catch (e) {
        alert('Failed to delete key');
    }
}

async function loadLogs() {
    try {
        const res = await fetch('/api/admin/logs', {
            headers: { 'Authorization': authToken }
        });
        const data = await res.json();
        if (data.success) {
            const tbody = document.getElementById('logsTableBody');
            tbody.innerHTML = '';
            if (data.logs.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-500">No logs found.</td></tr>';
                return;
            }
            data.logs.forEach(l => {
                const row = document.createElement('tr');
                row.className = 'hover:bg-slate-800/30 transition';
                row.innerHTML = `
                    <td class="p-3 font-mono text-slate-500 text-[11px]">${escapeHtml(l.id)}</td>
                    <td class="p-3 font-mono text-indigo-300 font-semibold">${escapeHtml(l.key)}</td>
                    <td class="p-3 font-mono text-slate-400 text-[11px]">${escapeHtml(l.hwid || 'N/A')}</td>
                    <td class="p-3 text-slate-300">${escapeHtml(l.ip || '127.0.0.1')}</td>
                    <td class="p-3 text-slate-400">${new Date(l.time).toLocaleString()}</td>
                    <td class="p-3 text-slate-500">${escapeHtml(l.note || '-')}</td>
                `;
                tbody.appendChild(row);
            });
        }
    } catch (e) {
        console.error('Logs error:', e);
    }
}

function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

function submitGenerateModal() {
    const prefix = document.getElementById('genPrefix').value || 'TOLUNAY';
    const count = parseInt(document.getElementById('genCount').value) || 1;
    const duration = parseInt(document.getElementById('genDuration').value) || 30;
    const note = document.getElementById('genNote').value || '';

    generateKeys(count, duration, note, prefix);
    closeModal('generateModal');
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard: ' + text);
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
