/**
 * Roblox Trackstats - Main Application Script
 * Xử lý tất cả các tính năng của ứng dụng theo dõi thống kê
 */

// Debugging utilities
const DEBUG = {
    enabled: true,
    logAPI: function(method, url, data, response) {
        if (!this.enabled) return;
        
        console.group(`API ${method}: ${url}`);
        if (data) console.log('Request data:', data);
        if (response) console.log('Response:', response);
        console.groupEnd();
    },
    error: function(message, error) {
        console.error(`[DEBUG] ${message}`, error);
    }
};

// Add API base URL variable at the top of the file
// Trong môi trường phát triển, sử dụng localhost
// Trong môi trường sản xuất, sử dụng Railway
const isDevelopment = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
const API_BASE_URL = isDevelopment 
    ? 'http://localhost:8080'  // Đường dẫn phát triển local
    : ''; // Empty string for production to use relative URLs

// Remove trailing slash if exists to avoid double slash
function getUrl(endpoint) {
    // Ensure endpoint starts with a slash
    if (!endpoint.startsWith('/')) {
        endpoint = '/' + endpoint;
    }
    
    // If in production, use relative URLs
    if (!isDevelopment) {
        console.log(`Using relative URL: ${endpoint}`);
        return endpoint;
    }
    
    // Remove trailing slash from base URL if it exists
    const baseUrl = API_BASE_URL.endsWith('/') 
        ? API_BASE_URL.slice(0, -1) 
        : API_BASE_URL;
        
    const fullUrl = baseUrl + endpoint;
    console.log(`Generated URL: ${fullUrl}`);
    DEBUG.logAPI('URL', `Generated URL: ${fullUrl}`);
    return fullUrl;
}

// Biến toàn cục cho dữ liệu người chơi
let currentData = [];
let filteredData = []; // Thêm biến lưu dữ liệu đã lọc

// Cài đặt phân trang
const pagination = {
    itemsPerPage: 20, // Mặc định hiển thị 20 người chơi mỗi trang
    currentPage: 1,
    totalPages: 1
};

// Trạng thái sắp xếp
const sortState = {
    field: 'PlayerName',
    direction: 'asc'
};

// Mock data cho mục đích kiểm thử
const mockData = [
    {
        PlayerName: "Cuong_123",
        Cash: 1500000,
        FormattedCash: "1,500,000",
        Gems: 5280,
        FormattedGems: "5,280",
        PetCount: 3,
        PetsList: [
            {
                Name: "Dragon",
                Level: 25,
                Rank: "S",
                RankNum: 6,
                FolderName: "Dragon_25"
            },
            {
                Name: "Phoenix",
                Level: 18,
                Rank: "A",
                RankNum: 5,
                FolderName: "Phoenix_18"
            },
            {
                Name: "Wolf",
                Level: 10,
                Rank: "B",
                RankNum: 4,
                FolderName: "Wolf_10"
            }
        ],
        timestamp: "2023-08-15T12:30:45.123Z"
    },
    {
        PlayerName: "VietGamer",
        Cash: 3200000,
        FormattedCash: "3,200,000",
        Gems: 8750,
        FormattedGems: "8,750",
        PetCount: 4,
        PetsList: [
            {
                Name: "Golden Dragon",
                Level: 30,
                Rank: "G",
                RankNum: 8,
                FolderName: "GoldenDragon_30"
            },
            {
                Name: "Dark Phoenix",
                Level: 27,
                Rank: "SS",
                RankNum: 7,
                FolderName: "DarkPhoenix_27"
            },
            {
                Name: "Tiger",
                Level: 15,
                Rank: "C",
                RankNum: 3,
                FolderName: "Tiger_15"
            },
            {
                Name: "Bear",
                Level: 8,
                Rank: "D",
                RankNum: 2,
                FolderName: "Bear_8"
            }
        ],
        timestamp: "2023-08-15T14:20:30.987Z"
    },
    {
        PlayerName: "MinecraftPro",
        Cash: 780000,
        FormattedCash: "780,000",
        Gems: 1200,
        FormattedGems: "1,200",
        PetCount: 2,
        PetsList: [
            {
                Name: "Snake",
                Level: 5,
                Rank: "E",
                RankNum: 1,
                FolderName: "Snake_5"
            },
            {
                Name: "Rabbit",
                Level: 12,
                Rank: "D",
                RankNum: 2,
                FolderName: "Rabbit_12"
            }
        ],
        timestamp: "2023-08-15T11:45:10.456Z"
    }
];

/**
 * Định dạng số với dấu phẩy ngăn cách hàng nghìn
 * @param {number} num - Số cần định dạng
 * @return {string} Chuỗi đã định dạng
 */
function formatNumber(num) {
    if (num === undefined || num === null) return "0";
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Định dạng thời gian theo múi giờ Việt Nam (GMT+7)
 * @param {string} dateString - Chuỗi thời gian
 * @return {string} Chuỗi thời gian đã định dạng
 */
function formatDateTime(dateString) {
    if (!dateString) return "";
    
    // Tạo đối tượng Date từ chuỗi
    const date = new Date(dateString);
    
    // Lấy thời gian địa phương của trình duyệt và điều chỉnh nếu cần
    const browserOffset = date.getTimezoneOffset();
    
    // Múi giờ Việt Nam GMT+7 (tính bằng phút, so với UTC)
    const vietnamOffset = -7 * 60;
    
    // Điều chỉnh thời gian dựa trên chênh lệch giữa múi giờ trình duyệt và múi giờ Việt Nam
    const offsetDiff = vietnamOffset - browserOffset;
    const vietnamTime = new Date(date.getTime() + offsetDiff * 60 * 1000);
    
    // Format giờ phút
    const hours = vietnamTime.getHours().toString().padStart(2, '0');
    const minutes = vietnamTime.getMinutes().toString().padStart(2, '0');
    const seconds = vietnamTime.getSeconds().toString().padStart(2, '0');
    
    // Format ngày tháng
    const day = vietnamTime.getDate().toString().padStart(2, '0');
    const month = (vietnamTime.getMonth() + 1).toString().padStart(2, '0');
    const year = vietnamTime.getFullYear();
    
    // Kết hợp thành chuỗi định dạng: "HH:MM:SS DD/MM/YYYY"
    return `${hours}:${minutes}:${seconds} ${day}/${month}/${year}`;
}

/**
 * Tạo bảng dữ liệu từ mảng người chơi
 * @param {Array} players - Mảng dữ liệu người chơi
 */
function createPlayersTable(players) {
    const container = document.getElementById('playersContainer');
    if (!container) return;
    
    filteredData = [...players];
    
    pagination.totalPages = Math.ceil(players.length / pagination.itemsPerPage);
    
    const startIndex = (pagination.currentPage - 1) * pagination.itemsPerPage;
    const paginatedPlayers = players.slice(startIndex, startIndex + pagination.itemsPerPage);
    
    const tableHtml = `
        <div class="d-flex justify-content-between align-items-center mb-3">
            <div>
                <h5>Total Accounts: <span class="badge bg-primary">${players.length}</span></h5>
            </div>
            <div class="d-flex align-items-center">
                <span class="me-2">Items per page:</span>
                <select id="itemsPerPageSelect" class="form-select form-select-sm" style="width: 70px;">
                    <option value="10" ${pagination.itemsPerPage === 10 ? 'selected' : ''}>10</option>
                    <option value="20" ${pagination.itemsPerPage === 20 ? 'selected' : ''}>20</option>
                    <option value="50" ${pagination.itemsPerPage === 50 ? 'selected' : ''}>50</option>
                    <option value="100" ${pagination.itemsPerPage === 100 ? 'selected' : ''}>100</option>
                </select>
            </div>
        </div>
        
        <table class="table table-dark table-striped table-hover">
            <thead class="table-dark">
                <tr>
                    <th class="text-center" style="width: 40px;">
                        <input type="checkbox" class="form-check-input" id="selectAll">
                    </th>
                    <th class="sortable" data-sort="PlayerName">Player Name <i class="bi bi-arrow-down-up"></i></th>
                    <th class="sortable" data-sort="Cash">Cash <i class="bi bi-arrow-down-up"></i></th>
                    <th class="sortable" data-sort="Gems">Gems <i class="bi bi-arrow-down-up"></i></th>
                    <th class="sortable text-center" data-sort="Ticket">Ticket <i class="bi bi-arrow-down-up"></i></th>
                    <th class="sortable text-center" data-sort="PetS">S Pets <i class="bi bi-arrow-down-up"></i></th>
                    <th class="sortable text-center" data-sort="PetSS">SS Pets <i class="bi bi-arrow-down-up"></i></th>
                    <th class="text-center">Gamepasses</th>
                </tr>
            </thead>
            <tbody id="playersTableBody">
                ${paginatedPlayers.map(player => {
                    // Đếm số lượng pet có rank S và SS riêng biệt
                    const sPets = player.PetsList ? player.PetsList.filter(pet => pet.Rank === 'S').length : 0;
                    const ssPets = player.PetsList ? player.PetsList.filter(pet => pet.Rank === 'SS' || pet.Rank === 'G').length : 0;
                    
                    // Tạo tooltip cho items
                    const itemsTooltip = player.ItemsList ? player.ItemsList.map(item => 
                        `${item.Name}: ${item.Amount}`
                    ).join('\n') : '';
                    
                    // Đếm tổng số items
                    const totalItems = player.ItemsList ? player.ItemsList.length : 0;
                    
                    // Lấy số lượng Ticket
                    const ticketAmount = player.ItemsList && player.ItemsList[0] ? player.ItemsList[0].Amount : 0;
                    
                    // Tạo danh sách gamepass
                    const gamepasses = player.PassesList ? player.PassesList.map(pass => pass.Name).join(', ') : '';
                    const gamepassCount = player.PassesList ? player.PassesList.length : 0;
                    
                    return `
                    <tr>
                        <td class="text-center">
                            <input type="checkbox" class="form-check-input player-checkbox" data-player="${player.PlayerName}">
                        </td>
                        <td>
                            <strong class="text-light">${player.PlayerName}</strong>
                        </td>
                        <td class="text-light">${formatNumber(player.Cash || 0)}</td>
                        <td class="text-light">${formatNumber(player.Gems || 0)}</td>
                        <td class="text-center">
                            <span class="badge bg-warning text-dark">${formatNumber(ticketAmount)}</span>
                        </td>
                        <td class="text-center">
                            <span class="badge pet-rank-S">${sPets}</span>
                        </td>
                        <td class="text-center">
                            <span class="badge pet-rank-SS">${ssPets}</span>
                        </td>
                        <td class="text-center">
                            <span class="badge bg-info gamepass-badge" 
                                  style="cursor: pointer;" 
                                  data-bs-toggle="modal" 
                                  data-bs-target="#gamepassModal"
                                  data-player="${player.PlayerName}"
                                  data-gamepasses='${JSON.stringify(player.PassesList || [])}'>
                                ${gamepassCount}
                            </span>
                        </td>
                    </tr>
                `}).join('')}
            </tbody>
        </table>
        
        ${createPaginationControls()}
        
        <!-- Gamepass Modal -->
        <div class="modal fade" id="gamepassModal" tabindex="-1" aria-labelledby="gamepassModalLabel" aria-hidden="true">
            <div class="modal-dialog">
                <div class="modal-content bg-dark">
                    <div class="modal-header">
                        <h5 class="modal-title text-light" id="gamepassModalLabel">Gamepass Details</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <div class="text-light mb-3">
                            Player: <span id="modalPlayerName" class="fw-bold"></span>
                        </div>
                        <div class="list-group">
                            <div id="gamepassList" class="list-group-item bg-dark text-light border-secondary">
                                <!-- Gamepass list will be inserted here -->
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    container.innerHTML = tableHtml;

    // Khởi tạo tooltips
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });

    // Thiết lập sự kiện cho gamepass badges
    document.querySelectorAll('.gamepass-badge').forEach(badge => {
        badge.addEventListener('click', function() {
            const playerName = this.getAttribute('data-player');
            const gamepasses = JSON.parse(this.getAttribute('data-gamepasses'));
            
            document.getElementById('modalPlayerName').textContent = playerName;
            
            const gamepassList = document.getElementById('gamepassList');
            if (gamepasses.length === 0) {
                gamepassList.innerHTML = '<div class="text-center text-muted">No gamepasses owned</div>';
            } else {
                gamepassList.innerHTML = gamepasses.map(pass => 
                    `<div class="d-flex justify-content-between align-items-center py-2 border-bottom border-secondary">
                        <span>${pass.Name}</span>
                        <span class="badge bg-success">Owned</span>
                    </div>`
                ).join('');
            }
        });
    });

    // Thiết lập chức năng sắp xếp
    setupSortingListeners();
    
    // Thiết lập các tính năng khác
    initTableFeatures();
    
    // Thiết lập sự kiện cho itemsPerPage select
    const itemsPerPageSelect = document.getElementById('itemsPerPageSelect');
    if (itemsPerPageSelect) {
        itemsPerPageSelect.addEventListener('change', function() {
            pagination.itemsPerPage = parseInt(this.value);
            pagination.currentPage = 1;
            createPlayersTable(filteredData);
        });
    }
    
    setupPaginationListeners();
}

/**
 * Tạo điều khiển phân trang
 * @returns {string} HTML cho điều khiển phân trang
 */
function createPaginationControls() {
    if (pagination.totalPages <= 1) {
        return '';
    }
    
    let paginationHtml = `
        <nav aria-label="Page navigation">
            <ul class="pagination justify-content-center">
                <li class="page-item ${pagination.currentPage === 1 ? 'disabled' : ''}">
                    <a class="page-link" href="#" data-page="prev" aria-label="Previous">
                        <span aria-hidden="true">&laquo;</span>
                    </a>
                </li>
    `;
    
    // Hiển thị tối đa 5 trang
    const maxVisiblePages = 5;
    let startPage = Math.max(1, pagination.currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(pagination.totalPages, startPage + maxVisiblePages - 1);
    
    // Điều chỉnh nếu không đủ trang để hiển thị
    if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    // Hiển thị nút trang đầu nếu cần
    if (startPage > 1) {
        paginationHtml += `
            <li class="page-item">
                <a class="page-link" href="#" data-page="1">1</a>
            </li>
        `;
        
        if (startPage > 2) {
            paginationHtml += `
                <li class="page-item disabled">
                    <a class="page-link" href="#">...</a>
                </li>
            `;
        }
    }
    
    // Hiển thị các trang
    for (let i = startPage; i <= endPage; i++) {
        paginationHtml += `
            <li class="page-item ${pagination.currentPage === i ? 'active' : ''}">
                <a class="page-link" href="#" data-page="${i}">${i}</a>
            </li>
        `;
    }
    
    // Hiển thị nút trang cuối nếu cần
    if (endPage < pagination.totalPages) {
        if (endPage < pagination.totalPages - 1) {
            paginationHtml += `
                <li class="page-item disabled">
                    <a class="page-link" href="#">...</a>
                </li>
            `;
        }
        
        paginationHtml += `
            <li class="page-item">
                <a class="page-link" href="#" data-page="${pagination.totalPages}">${pagination.totalPages}</a>
            </li>
        `;
    }
    
    paginationHtml += `
                <li class="page-item ${pagination.currentPage === pagination.totalPages ? 'disabled' : ''}">
                    <a class="page-link" href="#" data-page="next" aria-label="Next">
                        <span aria-hidden="true">&raquo;</span>
                    </a>
                </li>
            </ul>
        </nav>
    `;
    
    return paginationHtml;
}

/**
 * Thiết lập sự kiện cho các nút phân trang
 */
function setupPaginationListeners() {
    document.querySelectorAll('.pagination .page-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            const page = this.getAttribute('data-page');
            
            if (page === 'prev') {
                if (pagination.currentPage > 1) {
                    pagination.currentPage--;
                }
            } else if (page === 'next') {
                if (pagination.currentPage < pagination.totalPages) {
                    pagination.currentPage++;
                }
            } else {
                pagination.currentPage = parseInt(page);
            }
            
            createPlayersTable(filteredData);
        });
    });
}

/**
 * Khởi tạo tất cả tính năng của bảng
 */
function initTableFeatures() {
    setupCheckboxListeners();
}

/**
 * Thiết lập sự kiện cho các cột sắp xếp
 */
function setupSortingListeners() {
    document.querySelectorAll('.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const field = th.getAttribute('data-sort');
            sortData(field);
        });
    });
}

/**
 * Lấy dữ liệu mới nhất từ server
 */
async function fetchLatestStats() {
    // Show loading state
    const container = document.getElementById('playersContainer');
    container.innerHTML = `
        <div class="col-12 text-center">
            <div class="spinner-border text-light" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <p class="text-light mt-2">Đang tải dữ liệu...</p>
        </div>
    `;
    
    try {
        const apiUrl = getUrl('/api/latest');
        console.log('Fetching data from:', apiUrl);
        DEBUG.logAPI('GET', apiUrl);
        
        const response = await fetch(apiUrl, {
            method: 'GET',
            credentials: 'include', // Include cookies
            headers: {
                'Accept': 'application/json'
            }
        });
        
        console.log('API Response status:', response.status, response.statusText);
        DEBUG.logAPI('RESPONSE', apiUrl, null, {
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries([...response.headers])
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status} - ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('API Response data:', data);
        DEBUG.logAPI('DATA', apiUrl, null, data);
        
        if (!Array.isArray(data)) {
            console.error('Invalid data format received:', data);
            DEBUG.error('Invalid data format', data);
            throw new Error('Invalid data format received from server');
        }
        
        // Check if we have valid data
        if (data.length === 0) {
            console.log('No player data available in response');
            container.innerHTML = `
                <div class="col-12 text-center">
                    <div class="alert alert-warning">
                        No player data available. Please wait for players to join the game.
                    </div>
                </div>
            `;
            return;
        }
        
        console.log(`Received ${data.length} player records`);
        currentData = data;
        filteredData = data; // Reset filtered data
        createPlayersTable(data);
    } catch (error) {
        console.error('Error fetching data:', error);
        DEBUG.error('Fetch error', error);
        container.innerHTML = `
            <div class="col-12 text-center">
                <div class="alert alert-danger">
                    Failed to load data: ${error.message}. Please try again.
                    <button id="retryBtn" class="btn btn-outline-light mt-2">Retry</button>
                </div>
            </div>
        `;
        
        // Add retry button handler
        const retryBtn = document.getElementById('retryBtn');
        if (retryBtn) {
            retryBtn.addEventListener('click', fetchLatestStats);
        }
    }
}

/**
 * Sắp xếp dữ liệu theo trường chỉ định
 * @param {string} field - Tên trường cần sắp xếp
 */
function sortData(field) {
    if (sortState.field === field) {
        sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
        sortState.field = field;
        sortState.direction = 'asc';
    }
    
    const sortedData = [...currentData].sort((a, b) => {
        let valA, valB;
        
        if (field === 'timestamp') {
            valA = new Date(a[field]).getTime();
            valB = new Date(b[field]).getTime();
        } else if (field === 'Cash' || field === 'Gems') {
            valA = Number(a[field]) || 0;
            valB = Number(b[field]) || 0;
        } else if (field === 'Ticket') {
            valA = a.ItemsList && a.ItemsList[0] ? a.ItemsList[0].Amount : 0;
            valB = b.ItemsList && b.ItemsList[0] ? b.ItemsList[0].Amount : 0;
        } else if (field === 'PetS') {
            valA = a.PetsList ? a.PetsList.filter(pet => pet.Rank === 'S').length : 0;
            valB = b.PetsList ? b.PetsList.filter(pet => pet.Rank === 'S').length : 0;
        } else if (field === 'PetSS') {
            valA = a.PetsList ? a.PetsList.filter(pet => 
                pet.Rank === 'SS' || pet.Rank === 'G'
            ).length : 0;
            valB = b.PetsList ? b.PetsList.filter(pet => 
                pet.Rank === 'SS' || pet.Rank === 'G'
            ).length : 0;
        } else {
            valA = String(a[field] || '').toLowerCase();
            valB = String(b[field] || '').toLowerCase();
        }
        
        if (sortState.direction === 'asc') {
            return valA > valB ? 1 : -1;
        } else {
            return valA < valB ? 1 : -1;
        }
    });
    
    pagination.currentPage = 1;
    createPlayersTable(sortedData);
    updateSortingIcons();
}

/**
 * Cập nhật biểu tượng sắp xếp trên tiêu đề bảng
 */
function updateSortingIcons() {
    document.querySelectorAll('.sortable').forEach(th => {
        const thField = th.getAttribute('data-sort');
        if (thField === sortState.field) {
            th.innerHTML = th.textContent.split(' ')[0] + ` <i class="bi bi-arrow-${sortState.direction === 'asc' ? 'up' : 'down'}"></i>`;
        } else {
            th.innerHTML = th.textContent.split(' ')[0] + ` <i class="bi bi-arrow-down-up"></i>`;
        }
    });
}

/**
 * Lọc dữ liệu dựa trên đầu vào tìm kiếm
 */
function filterData() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    
    if (!searchTerm.trim()) {
        // Reset trang về 1 khi lọc
        pagination.currentPage = 1;
        createPlayersTable(currentData);
        return;
    }
    
    const filteredData = currentData.filter(player => {
        return player.PlayerName.toLowerCase().includes(searchTerm);
    });
    
    // Reset trang về 1 khi lọc
    pagination.currentPage = 1;
    createPlayersTable(filteredData);
}

/**
 * Thiết lập sự kiện cho các checkbox
 */
function setupCheckboxListeners() {
    // Checkbox "Chọn tất cả"
    const selectAllCheckbox = document.getElementById('selectAll');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', function() {
            const checkboxes = document.querySelectorAll('.player-checkbox');
            checkboxes.forEach(checkbox => {
                checkbox.checked = this.checked;
            });
            
            // Bật/tắt nút xóa
            document.getElementById('deleteSelectedBtn').disabled = !this.checked;
        });
    }
    
    // Các checkbox riêng lẻ
    document.getElementById('playersContainer').addEventListener('change', function(event) {
        if (event.target.classList.contains('player-checkbox')) {
            // Kiểm tra xem có checkbox nào được chọn không
            const anyChecked = document.querySelectorAll('.player-checkbox:checked').length > 0;
            document.getElementById('deleteSelectedBtn').disabled = !anyChecked;
            
            // Cập nhật checkbox "Chọn tất cả"
            const allChecked = document.querySelectorAll('.player-checkbox:checked').length === 
                              document.querySelectorAll('.player-checkbox').length;
            document.getElementById('selectAll').checked = allChecked;
        }
    });
}

/**
 * Xóa người chơi khỏi hệ thống
 * @param {string} playerName - Tên người chơi cần xóa
 * @returns {Promise<boolean>} Kết quả xóa (thành công hay thất bại)
 */
async function deletePlayer(playerName) {
    if (!confirm(`Bạn có chắc chắn muốn xóa người chơi ${playerName}?`)) {
        return false;
    }
    
    try {
        const apiUrl = getUrl(`/api/player/${playerName}`);
        DEBUG.logAPI('DELETE', apiUrl, { playerName });
        
        const response = await fetch(apiUrl, {
            method: 'DELETE',
            credentials: 'include',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        DEBUG.logAPI('RESPONSE', apiUrl, null, {
            status: response.status,
            statusText: response.statusText
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        DEBUG.logAPI('DELETE RESULT', apiUrl, null, result);
        
        if (result && result.success) {
            console.log(`Successfully deleted player ${playerName}`);
            return true;
        } else {
            throw new Error(result.message || 'Server returned success: false');
        }
    } catch (error) {
        DEBUG.error(`Failed to delete player ${playerName}`, error);
        console.error('Error deleting player:', error);
        alert(`Lỗi khi xóa người chơi ${playerName}: ${error.message}`);
        return false;
    }
}

/**
 * Xóa nhiều người chơi đã chọn
 */
async function deleteSelectedPlayers() {
    const selectedCheckboxes = document.querySelectorAll('.player-checkbox:checked');
    if (selectedCheckboxes.length === 0) {
        alert('Vui lòng chọn ít nhất một người chơi để xóa.');
        return;
    }

    const selectedPlayers = Array.from(selectedCheckboxes).map(checkbox => checkbox.getAttribute('data-player'));
    
    if (!confirm(`Bạn có chắc chắn muốn xóa ${selectedPlayers.length} người chơi đã chọn?`)) {
        return;
    }

    let successCount = 0;
    let failCount = 0;
    let errors = [];

    for (const playerName of selectedPlayers) {
        try {
            const success = await deletePlayer(playerName);
            if (success) {
                successCount++;
            } else {
                failCount++;
            }
        } catch (error) {
            console.error(`Error deleting player ${playerName}:`, error);
            failCount++;
            errors.push(`${playerName}: ${error.message}`);
        }
    }

    // Show results
    let message = `Kết quả xóa người chơi:\n`;
    message += `- Thành công: ${successCount}\n`;
    if (failCount > 0) {
        message += `- Thất bại: ${failCount}\n`;
        if (errors.length > 0) {
            message += `\nLỗi chi tiết:\n${errors.join('\n')}`;
        }
    }
    alert(message);

    // Refresh the data only if we had any successful deletions
    if (successCount > 0) {
        await fetchLatestStats();
    }
}

/**
 * Kiểm tra trạng thái đăng nhập và chuyển hướng nếu cần
 */
async function checkAuthentication() {
    try {
        const response = await fetch(getUrl('/api/players'), {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (response.status === 401) {
            console.warn('User not authenticated, redirecting to login page');
            window.location.href = '/login';
            return false;
        }
        
        return true;
    } catch (error) {
        DEBUG.error('Authentication check failed', error);
        console.error('Error checking authentication:', error);
        return false;
    }
}

/**
 * Thiết lập tất cả các sự kiện khi tài liệu đã sẵn sàng
 */
document.addEventListener('DOMContentLoaded', async function() {
    // Kiểm tra trạng thái đăng nhập trước
    const isAuthenticated = await checkAuthentication();
    if (!isAuthenticated) return;
    
    // Thiết lập sự kiện tìm kiếm
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', filterData);
    }
    
    // Thiết lập nút làm mới
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', fetchLatestStats);
    }
    
    // Thiết lập nút xóa đã chọn
    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    if (deleteSelectedBtn) {
        deleteSelectedBtn.addEventListener('click', () => deleteSelectedPlayers());
    }
    
    // Tự động làm mới mỗi 30 giây
    setInterval(fetchLatestStats, 30000);
    
    // Tải dữ liệu ban đầu
    fetchLatestStats();
});