// Configuration
const SHEET_ID = '1FuFozTVjbhZxY8jl0sarykCkqVfzbODevLcP6H0ikaw';
const LOGS_SHEET_NAME = 'Logs';
const UIDS_SHEET_NAME = 'UIDs';
const RANGE = 'A:D';
const LOGS_PER_PAGE = 10;

// DOM Elements
const dataContainer = document.getElementById('data-container');
const refreshBtn = document.getElementById('refresh-btn');
const searchInput = document.getElementById('search-input');
const lastUpdatedEl = document.getElementById('last-updated');
const totalAccessesEl = document.getElementById('total-accesses');
const successfulAccessesEl = document.getElementById('successful-accesses');
const deniedAccessesEl = document.getElementById('denied-accesses');
const masterAccessesEl = document.getElementById('master-accesses');
const sortToggle = document.getElementById('sort-toggle');
const showUidManagerBtn = document.getElementById('show-uid-manager');
const uidManagerContainer = document.getElementById('uid-manager-container');
const uidListContainer = document.getElementById('uid-list-container');
const newUidInput = document.getElementById('new-uid-input');
const addUidBtn = document.getElementById('add-uid-btn');
const confirmModal = document.getElementById('confirm-modal');
const confirmModalTitle = document.getElementById('confirm-modal-title');
const confirmModalMessage = document.getElementById('confirm-modal-message');
const confirmModalCancel = document.getElementById('confirm-modal-cancel');
const confirmModalConfirm = document.getElementById('confirm-modal-confirm');

// Global variables
let allLogs = [];
let filteredLogs = [];
let currentPage = 1;
let sortNewestFirst = true;
let authorizedUids = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    fetchSheetData();
    fetchAuthorizedUids();
});

// Event Listeners
refreshBtn.addEventListener('click', fetchSheetData);
searchInput.addEventListener('input', filterLogs);
sortToggle.addEventListener('click', toggleSortOrder);
showUidManagerBtn.addEventListener('click', toggleUidManager);
addUidBtn.addEventListener('click', addNewUid);
confirmModalCancel.addEventListener('click', hideModal);

// ========================
// AUTHENTICATED API CALLS
// ========================

async function fetchWithAuth(url, options = {}) {
    const token = localStorage.getItem('google_access_token');
    if (!token) {
        alert("Please sign in first!");
        throw new Error("Not authenticated");
    }

    try {
        const response = await fetch(`https://cors-anywhere.herokuapp.com/${url}`, {
            ...options,
            headers: {
                ...options.headers,
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });

        if (response.status === 401) {
            localStorage.removeItem('google_access_token');
            alert("Session expired. Please sign in again.");
            window.location.reload();
            return;
        }

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }

        return response;
    } catch (error) {
        console.error("API Error:", error);
        throw error;
    }
}

// ========================
// UID MANAGEMENT FUNCTIONS
// ========================

function toggleUidManager() {
    uidManagerContainer.style.display = uidManagerContainer.style.display === 'none' ? 'block' : 'none';
    if (uidManagerContainer.style.display === 'block') {
        fetchAuthorizedUids();
    }
}

async function fetchAuthorizedUids() {
    try {
        uidListContainer.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i><p>Loading UIDs...</p></div>';
        
        const response = await fetchWithAuth(
            `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${UIDS_SHEET_NAME}!A2:A`
        );
        
        const data = await response.json();
        authorizedUids = data.values ? data.values.flat() : [];
        renderUidList();
    } catch (error) {
        console.error('Error:', error);
        uidListContainer.innerHTML = `<div class="error"><i class="fas fa-exclamation-triangle"></i><p>Error loading UIDs: ${error.message}</p></div>`;
    }
}

function renderUidList() {
    if (authorizedUids.length === 0) {
        uidListContainer.innerHTML = '<p>No authorized UIDs found.</p>';
        return;
    }
    
    let html = '<table><thead><tr><th>UID</th><th>Action</th></tr></thead><tbody>';
    
    authorizedUids.forEach(uid => {
        html += `
            <tr>
                <td>${uid}</td>
                <td>
                    <button class="btn-outline delete-uid-btn" data-uid="${uid}">
                        <i class="fas fa-trash"></i> Remove
                    </button>
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    uidListContainer.innerHTML = html;
    
    document.querySelectorAll('.delete-uid-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const uidToDelete = e.target.closest('button').dataset.uid;
            showConfirmModal(
                'Confirm Removal',
                `Are you sure you want to remove UID: ${uidToDelete}?`,
                () => deleteUid(uidToDelete)
            );
        });
    });
}

async function addNewUid() {
    const newUid = newUidInput.value.trim();
    if (!newUid) {
        alert('Please enter a UID');
        return;
    }
    
    if (authorizedUids.includes(newUid)) {
        alert('This UID is already authorized');
        return;
    }
    
    try {
        addUidBtn.disabled = true;
        addUidBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';
        
        const response = await fetchWithAuth(
            `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${UIDS_SHEET_NAME}!A:A:append?valueInputOption=RAW`,
            {
                method: 'POST',
                body: JSON.stringify({
                    values: [[newUid]]
                })
            }
        );
        
        newUidInput.value = '';
        await fetchAuthorizedUids();
    } catch (error) {
        console.error('Error:', error);
        alert(`Error adding UID: ${error.message}`);
    } finally {
        addUidBtn.disabled = false;
        addUidBtn.innerHTML = '<i class="fas fa-plus"></i> Add UID';
    }
}

async function deleteUid(uid) {
    try {
        const sheetId = await getSheetId(UIDS_SHEET_NAME);
        const rowIndex = authorizedUids.indexOf(uid);
        
        if (rowIndex === -1) throw new Error('UID not found');
        
        const response = await fetchWithAuth(
            `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`,
            {
                method: 'POST',
                body: JSON.stringify({
                    requests: [{
                        deleteDimension: {
                            range: {
                                sheetId: sheetId,
                                dimension: "ROWS",
                                startIndex: rowIndex,
                                endIndex: rowIndex + 1
                            }
                        }
                    }]
                })
            }
        );
        
        await fetchAuthorizedUids();
        hideModal();
    } catch (error) {
        console.error('Error:', error);
        alert(`Error deleting UID: ${error.message}`);
        hideModal();
    }
}

// ========================
// ACCESS LOGS FUNCTIONS
// ========================

async function fetchSheetData() {
    try {
        dataContainer.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i><p>Loading access logs...</p></div>';
        
        const response = await fetchWithAuth(
            `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${LOGS_SHEET_NAME}!${RANGE}`
        );
        
        if (!response) return; // Auth failed
        
        const data = await response.json();
        processData(data.values);
        lastUpdatedEl.textContent = `Last updated: ${new Date().toLocaleString()}`;
    } catch (error) {
        console.error('Error:', error);
        dataContainer.innerHTML = `
            <div class="error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error loading data: ${error.message}</p>
            </div>
        `;
    }
}

function processData(rows) {
    if (!rows || rows.length === 0) {
        dataContainer.innerHTML = '<div class="error"><i class="fas fa-exclamation-triangle"></i><p>No access logs found.</p></div>';
        return;
    }
    
    const headers = rows[0];
    allLogs = rows.slice(1).map(row => {
        const log = {};
        headers.forEach((header, index) => log[header] = row[index] || '');
        
        // Determine access type
        if (log.Status && log.Status.includes('ADD_MODE_TOGGLE')) {
            log.userType = 'master';
            log.displayName = 'Admin';
            log.statusDisplay = 'Master Key Used';
        } 
        else if (log.Status && log.Status.toLowerCase().includes('granted')) {
            log.userType = 'user';
            log.displayName = log.Name || 'User';
            log.statusDisplay = 'Access Granted';
        } 
        else {
            log.userType = 'unknown';
            log.displayName = 'Unknown';
            log.statusDisplay = 'Access Denied';
        }
        
        log.RFID = row[1] || 'N/A';
        return log;
    });
    
    sortLogs();
    updateDashboardStats(allLogs);
    filterLogs();
}

function toggleSortOrder() {
    sortNewestFirst = !sortNewestFirst;
    sortToggle.querySelector('span').textContent = sortNewestFirst ? 'Newest First' : 'Oldest First';
    sortToggle.querySelector('i').className = sortNewestFirst ? 'fas fa-sort-amount-down' : 'fas fa-sort-amount-up';
    sortLogs();
    filterLogs();
}

function sortLogs() {
    allLogs.sort((a, b) => {
        const dateA = new Date(a.Timestamp || a.Date || a.Time);
        const dateB = new Date(b.Timestamp || b.Date || b.Time);
        return sortNewestFirst ? dateB - dateA : dateA - dateB;
    });
}

function updateDashboardStats(logs) {
    totalAccessesEl.textContent = logs.length;
    successfulAccessesEl.textContent = logs.filter(log => 
        log.Status && (log.Status.toLowerCase().includes('granted') || log.Status.includes('ADD_MODE_TOGGLE'))
    ).length;
    deniedAccessesEl.textContent = logs.filter(log => 
        !log.Status || (!log.Status.toLowerCase().includes('granted') && !log.Status.includes('ADD_MODE_TOGGLE'))
    ).length;
    masterAccessesEl.textContent = logs.filter(log => log.userType === 'master').length;
}

function filterLogs() {
    const searchTerm = searchInput.value.toLowerCase();
    filteredLogs = searchTerm === '' ? [...allLogs] : allLogs.filter(log => 
        (log.Name && log.Name.toLowerCase().includes(searchTerm)) ||
        (log.RFID && log.RFID.toLowerCase().includes(searchTerm)) ||
        (log.Status && log.Status.toLowerCase().includes(searchTerm)) ||
        (log.Timestamp && log.Timestamp.toLowerCase().includes(searchTerm)) ||
        (log.displayName && log.displayName.toLowerCase().includes(searchTerm))
    );
    currentPage = 1;
    renderLogs();
}

function renderLogs() {
    if (filteredLogs.length === 0) {
        dataContainer.innerHTML = '<div class="error"><i class="fas fa-search"></i><p>No matching access logs found.</p></div>';
        return;
    }
    
    const totalPages = Math.ceil(filteredLogs.length / LOGS_PER_PAGE);
    const startIndex = (currentPage - 1) * LOGS_PER_PAGE;
    const endIndex = Math.min(startIndex + LOGS_PER_PAGE, filteredLogs.length);
    const paginatedLogs = filteredLogs.slice(startIndex, endIndex);
    
    let html = `
        <div class="table-responsive">
            <table class="log-table">
                <thead><tr><th>User</th><th>RFID Tag</th><th>Access Time</th><th>Status</th></tr></thead>
                <tbody>
    `;
    
    paginatedLogs.forEach(log => {
        const statusClass = log.userType === 'master' ? 'badge-master' : 
                         log.Status && log.Status.toLowerCase().includes('granted') ? 'badge-success' : 'badge-danger';
        
        html += `
            <tr>
                <td>
                    <div class="user-info">
                        <div class="user-avatar ${log.userType}">
                            ${log.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <div class="user-name">${log.displayName}</div>
                        </div>
                    </div>
                </td>
                <td>${log.RFID}</td>
                <td>${log.Timestamp || log.Date || 'N/A'}</td>
                <td><span class="badge ${statusClass}">${log.statusDisplay}</span></td>
            </tr>
        `;
    });
    
    html += `</tbody></table></div>
        <div class="pagination">
            <div class="page-info">
                Showing ${startIndex + 1}-${endIndex} of ${filteredLogs.length} entries
            </div>
            <div class="page-controls">
                <button id="prev-page" ${currentPage === 1 ? 'disabled' : ''}>
                    <i class="fas fa-chevron-left"></i>
                </button>
                ${Array.from({ length: totalPages }, (_, i) => `
                    <button class="${i + 1 === currentPage ? 'active' : ''}" data-page="${i + 1}">
                        ${i + 1}
                    </button>
                `).join('')}
                <button id="next-page" ${currentPage === totalPages ? 'disabled' : ''}>
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>
        </div>
    `;
    
    dataContainer.innerHTML = html;
    
    document.getElementById('prev-page')?.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderLogs();
        }
    });
    
    document.getElementById('next-page')?.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            renderLogs();
        }
    });
    
    document.querySelectorAll('.page-controls button[data-page]').forEach(button => {
        button.addEventListener('click', () => {
            currentPage = parseInt(button.dataset.page);
            renderLogs();
        });
    });
}

// ========================
// HELPER FUNCTIONS
// ========================

async function getSheetId(sheetName) {
    const response = await fetchWithAuth(
        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`
    );
    const data = await response.json();
    const sheet = data.sheets.find(s => s.properties.title === sheetName);
    return sheet.properties.sheetId;
}

function showConfirmModal(title, message, confirmCallback) {
    confirmModalTitle.textContent = title;
    confirmModalMessage.textContent = message;
    confirmModal.style.display = 'flex';
    
    confirmModalConfirm.onclick = () => {
        confirmCallback();
        hideModal();
    };
}

function hideModal() {
    confirmModal.style.display = 'none';
}

// Auto-refresh every 30 seconds
setInterval(() => {
    if (localStorage.getItem('google_access_token')) {
        fetchSheetData();
    }
}, 30000);