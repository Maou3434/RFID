// Configuration
const SHEET_ID = '1FuFozTVjbhZxY8jl0sarykCkqVfzbODevLcP6H0ikaw';
const SHEET_NAME = 'Logs';
const UID_SHEET_NAME = 'UIDs';
const API_KEY = 'AIzaSyCspSQf50gAADY4N6cDyYVpaO_lMo0lB-I';
const RANGE = 'A:D';
const UID_RANGE = 'A:B';

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
const logsTab = document.getElementById('logs-tab');
const rfidsTab = document.getElementById('rfids-tab');
const logsContainer = document.getElementById('logs-container');
const rfidsContainer = document.getElementById('rfids-container');
const rfidsDataEl = document.getElementById('rfids-data');
const rfidCountEl = document.getElementById('rfid-count');

// Global variables
let allLogs = [];
let filteredLogs = [];
let currentPage = 1;
let sortNewestFirst = true;
const logsPerPage = 10;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    fetchSheetData();
    setupEventListeners();
});

function setupEventListeners() {
    refreshBtn.addEventListener('click', fetchAllData);
    searchInput.addEventListener('input', filterLogs);
    sortToggle.addEventListener('click', toggleSortOrder);
    
    logsTab.addEventListener('click', () => {
        logsTab.classList.add('active');
        rfidsTab.classList.remove('active');
        logsContainer.style.display = 'block';
        rfidsContainer.style.display = 'none';
    });

    rfidsTab.addEventListener('click', () => {
        rfidsTab.classList.add('active');
        logsTab.classList.remove('active');
        logsContainer.style.display = 'none';
        rfidsContainer.style.display = 'block';
        fetchRfidData();
    });
}

async function fetchAllData() {
    await fetchSheetData();
    if (rfidsTab.classList.contains('active')) {
        await fetchRfidData();
    }
}

// Fetch data from Google Sheets
async function fetchSheetData() {
    try {
        dataContainer.innerHTML = `
            <div class="loading">
                <i class="fas fa-spinner"></i>
                <p>Loading access logs...</p>
            </div>
        `;
        
        const response = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${SHEET_NAME}!${RANGE}?key=${API_KEY}`
        );
        
        if (!response.ok) throw new Error(`Failed to fetch data: ${response.status}`);
        
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

// Process the raw data
function processData(rows) {
    if (!rows || rows.length === 0) {
        dataContainer.innerHTML = '<div class="error"><i class="fas fa-exclamation-triangle"></i><p>No access logs found.</p></div>';
        return;
    }
    
    const headers = rows[0];
    allLogs = rows.slice(1).map(row => {
        const log = {};
        headers.forEach((header, index) => log[header] = row[index] || '');
        
        // Handle master key access
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
        
        log.RFID = row[1] || 'N/A'; // Column B is RFID
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
    
    const totalPages = Math.ceil(filteredLogs.length / logsPerPage);
    const startIndex = (currentPage - 1) * logsPerPage;
    const endIndex = Math.min(startIndex + logsPerPage, filteredLogs.length);
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
                <td><div class="user-info"><div class="user-avatar ${log.userType}">${log.displayName.charAt(0).toUpperCase()}</div>
                    <div><div class="user-name">${log.displayName}</div></div></div></td>
                <td>${log.RFID}</td>
                <td>${log.Timestamp || log.Date || 'N/A'}</td>
                <td><span class="badge ${statusClass}">${log.statusDisplay}</span></td>
            </tr>
        `;
    });
    
    html += `</tbody></table></div>
        <div class="pagination">
            <div class="page-info">Showing ${startIndex + 1}-${endIndex} of ${filteredLogs.length} entries</div>
            <div class="page-controls">
                <button id="prev-page" ${currentPage === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>
                ${Array.from({ length: totalPages }, (_, i) => `
                    <button class="${i + 1 === currentPage ? 'active' : ''}" data-page="${i + 1}">${i + 1}</button>
                `).join('')}
                <button id="next-page" ${currentPage === totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>
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

// RFID Functions
async function fetchRfidData() {
    try {
        rfidsDataEl.innerHTML = `
            <div class="loading">
                <i class="fas fa-spinner"></i>
                <p>Loading registered RFIDs...</p>
            </div>
        `;
        
        const response = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${UID_SHEET_NAME}!${UID_RANGE}?key=${API_KEY}`
        );
        
        if (!response.ok) throw new Error(`Failed to fetch RFID data: ${response.status}`);
        
        const data = await response.json();
        processRfidData(data.values);
    } catch (error) {
        console.error('Error:', error);
        rfidsDataEl.innerHTML = `
            <div class="error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error loading RFID data: ${error.message}</p>
            </div>
        `;
    }
}

function processRfidData(rows) {
    if (!rows || rows.length === 0) {
        rfidsDataEl.innerHTML = '<div class="error"><i class="fas fa-exclamation-triangle"></i><p>No registered RFIDs found.</p></div>';
        return;
    }
    
    const headers = rows[0];
    const rfids = rows.slice(1).map(row => {
        return {
            tag: row[0] || 'N/A',
            date: row[1] || 'Unknown'
        };
    });
    
    renderRfids(rfids);
}

function renderRfids(rfids) {
    rfidCountEl.textContent = `${rfids.length} tags`;
    
    let html = `
        <div class="table-responsive">
            <table class="rfid-table">
                <thead><tr><th>RFID Tag</th><th>Date Registered</th></tr></thead>
                <tbody>
    `;
    
    rfids.forEach(rfid => {
        html += `
            <tr>
                <td><span class="rfid-tag">${rfid.tag}</span></td>
                <td class="rfid-date">${rfid.date}</td>
            </tr>
        `;
    });
    
    html += `</tbody></table></div>`;
    
    rfidsDataEl.innerHTML = html;
}

// Auto-refresh
setInterval(fetchAllData, 30000);