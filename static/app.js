/**
 * Roblox Trackstats - Main Application Script
 * Xử lý tất cả các tính năng của ứng dụng theo dõi thống kê
 */

// Add API base URL variable at the top of the file
const API_BASE_URL = 'https://cuonggdev.com'; // Đường dẫn đến FastAPI serve

// Remove trailing slash if exists to avoid double slash
function getUrl(endpoint) {
    // Ensure endpoint starts with a slash
    if (!endpoint.startsWith('/')) {
        endpoint = '/' + endpoint;
    }
    
    // Remove trailing slash from base URL if it exists
    const baseUrl = API_BASE_URL.endsWith('/') 
        ? API_BASE_URL.slice(0, -1) 
        : API_BASE_URL;
        
    return baseUrl + endpoint;
}

// Add a function to check API connectivity
async function checkApiConnectivity() {
    try {
        const response = await fetch(getUrl('/debug.json'));
        if (response.ok) {
            console.log('API connectivity test successful');
            return true;
        } else {
            console.error('API connectivity test failed:', response.status);
            return false;
        }
    } catch (error) {
        console.error('API connectivity test error:', error);
        return false;
    }
}

// Call this at the start
checkApiConnectivity();

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
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Tạo bảng dữ liệu từ mảng người chơi
 * @param {Array} players - Mảng dữ liệu người chơi
 */
function createPlayersTable(players) {
    const container = document.getElementById('playersContainer');
    if (!container) return;
    
    filteredData = [...players]; // Lưu dữ liệu hiện tại vào filteredData
    
    // Tính toán tổng số trang
    pagination.totalPages = Math.ceil(players.length / pagination.itemsPerPage);
    
    // Giới hạn dữ liệu hiển thị theo trang hiện tại
    const startIndex = (pagination.currentPage - 1) * pagination.itemsPerPage;
    const paginatedPlayers = players.slice(startIndex, startIndex + pagination.itemsPerPage);
    
    // Tạo cấu trúc bảng
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
                    <th class="sortable text-center" data-sort="PetS">S Pets <i class="bi bi-arrow-down-up"></i></th>
                    <th class="sortable text-center" data-sort="PetSS">SS Pets <i class="bi bi-arrow-down-up"></i></th>
                    <th class="sortable" data-sort="timestamp">Last Updated <i class="bi bi-arrow-down-up"></i></th>
                </tr>
            </thead>
            <tbody id="playersTableBody">
                ${paginatedPlayers.map(player => {
                    // Đếm số lượng pet có rank S và SS riêng biệt
                    const sPets = player.PetsList ? player.PetsList.filter(pet => pet.Rank === 'S').length : 0;
                    const ssPets = player.PetsList ? player.PetsList.filter(pet => pet.Rank === 'SS' || pet.Rank === 'G').length : 0;
                    
                    return `
                    <tr>
                        <td class="text-center">
                            <input type="checkbox" class="form-check-input player-checkbox" data-player="${player.PlayerName}">
                        </td>
                        <td>
                            <strong class="text-light">${player.PlayerName}</strong>
                        </td>
                        <td class="text-light">${player.FormattedCash || formatNumber(player.Cash || 0)}</td>
                        <td class="text-light">${player.FormattedGems || formatNumber(player.Gems || 0)}</td>
                        <td class="text-center">
                            <span class="badge pet-rank-S">${sPets}</span>
                        </td>
                        <td class="text-center">
                            <span class="badge pet-rank-SS">${ssPets}</span>
                        </td>
                        <td class="text-light">${new Date(player.timestamp).toLocaleString()}</td>
                    </tr>
                `}).join('')}
            </tbody>
        </table>
        
        <!-- Phân trang -->
        ${createPaginationControls()}
    `;
    
    container.innerHTML = tableHtml;

    // Thiết lập chức năng sắp xếp
    setupSortingListeners();
    
    // Thiết lập các tính năng khác
    initTableFeatures();
    
    // Thiết lập sự kiện cho itemsPerPage select
    const itemsPerPageSelect = document.getElementById('itemsPerPageSelect');
    if (itemsPerPageSelect) {
        itemsPerPageSelect.addEventListener('change', function() {
            pagination.itemsPerPage = parseInt(this.value);
            pagination.currentPage = 1; // Reset về trang 1
            createPlayersTable(filteredData);
        });
    }
    
    // Thiết lập sự kiện cho các nút phân trang
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
    try {
        const response = await fetch(getUrl('/api/latest'));
        const data = await response.json();
        
        // Không dùng mock data nữa
        // const data = mockData;
        currentData = data;
        createPlayersTable(data);
    } catch (error) {
        console.error('Error fetching data:', error);
        document.getElementById('playersContainer').innerHTML = `
            <div class="col-12 text-center">
                <div class="alert alert-danger">
                    Failed to load data. Please try again.
                </div>
            </div>
        `;
    }
}

/**
 * Sắp xếp dữ liệu theo trường chỉ định
 * @param {string} field - Tên trường cần sắp xếp
 */
function sortData(field) {
    if (sortState.field === field) {
        // Đảo chiều nếu cùng trường
        sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
        // Trường mới, mặc định tăng dần
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
        } else if (field === 'PetS') {
            // Đếm số lượng pet rank S cho việc sắp xếp
            valA = a.PetsList ? a.PetsList.filter(pet => pet.Rank === 'S').length : 0;
            valB = b.PetsList ? b.PetsList.filter(pet => pet.Rank === 'S').length : 0;
        } else if (field === 'PetSS') {
            // Đếm số lượng pet rank SS và G cho việc sắp xếp
            valA = a.PetsList ? a.PetsList.filter(pet => 
                pet.Rank === 'SS' || pet.Rank === 'G'
            ).length : 0;
            valB = b.PetsList ? b.PetsList.filter(pet => 
                pet.Rank === 'SS' || pet.Rank === 'G'
            ).length : 0;
        } else if (field === 'PetCount') {
            // Không còn sử dụng, nhưng giữ lại cho tương thích ngược
            valA = a.PetCount || 0;
            valB = b.PetCount || 0;
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
    
    // Reset trang về 1 khi sắp xếp
    pagination.currentPage = 1;
    createPlayersTable(sortedData);
    
    // Cập nhật biểu tượng trên tiêu đề bảng
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
 * Xóa một người chơi
 * @param {string} playerName - Tên người chơi cần xóa
 */
async function deletePlayer(playerName) {
    if (!confirm(`Bạn có chắc chắn muốn xóa người chơi ${playerName}?`)) {
        return false;
    }
    
    try {
        const response = await fetch(getUrl(`/api/player/${playerName}`), {
            method: 'DELETE',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        if (result.success) {
            console.log(`Successfully deleted player ${playerName}`);
            return true;
        } else {
            throw new Error('Server returned success: false');
        }
    } catch (error) {
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
 * Thiết lập tất cả các sự kiện khi tài liệu đã sẵn sàng
 */
document.addEventListener('DOMContentLoaded', function() {
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