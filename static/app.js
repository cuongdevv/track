/**
 * Roblox Trackstats - Main Application Script
 * Xử lý tất cả các tính năng của ứng dụng theo dõi thống kê
 */

// Version signature to verify code updates
const APP_VERSION = "3.0.0";
const APP_BUILD_DATE = "2025-03-26";

// Add API base URL variable at the top of the file
let apiUrl = '';
if (typeof isDevelopment !== 'undefined') {
    apiUrl = isDevelopment ? 'http://localhost:8080' : '';
} else {
    // Fallback nếu app.js chưa được tải
    const localDev = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
    apiUrl = localDev ? 'http://localhost:8080' : '';
}
const API_BASE_URL = isDevelopment
    ? 'http://localhost:8080'  // Đường dẫn phát triển local
    : ''; // Empty string for production to use relative URLs

// Debugging utilities - Enable in development, disable in production
const DEBUG = {
    enabled: isDevelopment,
    logAPI: function (method, url, data, response) {
        if (!this.enabled) return;
        
        console.group(`API ${method}: ${url}`);
        if (data) console.log('Request data:', data);
        if (response) console.log('Response:', response);
        console.groupEnd();
    },
    error: function (message, error) {
        console.error(`[DEBUG] ${message}`, error);
    }
};

console.log(`✅ Arise Crossover Stats - Version ${APP_VERSION} (${APP_BUILD_DATE})`);
console.log(`✅ Running in ${isDevelopment ? 'DEVELOPMENT' : 'PRODUCTION'} mode`);

// Thêm cache manager để lưu trữ dữ liệu và cải thiện hiệu suất
const CacheManager = {
    // Thời gian cache hết hạn (10 phút)
    EXPIRY_TIME: 10 * 60 * 1000,

    // Cache lưu trữ
    cache: {},

    // Kiểm tra xem có thể sử dụng localStorage hay không
    canUseLocalStorage: function () {
        try {
            localStorage.setItem('test_storage', 'test');
            localStorage.removeItem('test_storage');
            return true;
        } catch (e) {
            console.warn(`⚠️ localStorage không khả dụng: ${e.message}`);
            return false;
        }
    },

    // Kiểm tra khả năng lưu trữ
    init: function () {
        const storageAvailable = this.canUseLocalStorage();
        console.log(`🗄️ Local storage ${storageAvailable ? 'khả dụng' : 'không khả dụng'}`);

        if (!storageAvailable) {
            // Hiển thị thông báo cho người dùng khi localStorage không khả dụng
            document.addEventListener('DOMContentLoaded', () => {
                const storageAlert = document.createElement('div');
                storageAlert.className = 'alert alert-warning alert-dismissible fade show';
                storageAlert.innerHTML = `
                    <strong>Lưu ý:</strong> Trình duyệt của bạn không cho phép lưu trữ cục bộ.
                    Dữ liệu sẽ được tải lại mỗi khi làm mới trang. 
                    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                `;

                const container = document.querySelector('.container') || document.body;
                if (container) {
                    container.insertBefore(storageAlert, container.firstChild);
                }
            });
        }

        return storageAvailable;
    },

    // Lưu data vào cache
    setCache: function (key, data) {
        console.log(`🗄️ Caching data for key: ${key}, size: ${JSON.stringify(data).length} bytes`);

        // Luôn lưu trong memory cache
        this.cache[key] = {
            data: data,
            timestamp: Date.now()
        };

        // Nếu localStorage khả dụng, lưu ở đó
        if (this.canUseLocalStorage()) {
            try {
                // Sử dụng try-catch để xử lý lỗi quota exceeded
                const stringData = JSON.stringify({
                    data: data,
                    timestamp: Date.now()
                });

                // Kiểm tra kích thước trước khi lưu
                if (stringData.length < 4.5 * 1024 * 1024) { // Giới hạn 4.5MB để an toàn
                    localStorage.setItem(`cache_${key}`, stringData);
                    console.log(`🗄️ Data also cached to localStorage (${formatFileSize(stringData.length)})`);
                } else {
                    console.warn(`📛 Dữ liệu quá lớn để lưu vào localStorage: ${formatFileSize(stringData.length)}`);

                    // Thử nén dữ liệu chỉ lưu thông tin cần thiết
                    const compressedData = Array.isArray(data) ? data.map(item => {
                        return {
                            PlayerName: item.PlayerName,
                            Cash: item.Cash,
                            Gems: item.Gems,
                            PetCount: item.PetCount
                        };
                    }) : data;

                    const compressedString = JSON.stringify({
                        data: compressedData,
                        timestamp: Date.now(),
                        compressed: true
                    });

                    if (compressedString.length < 4.5 * 1024 * 1024) {
                        localStorage.setItem(`cache_${key}_compressed`, compressedString);
                        console.log(`🗄️ Compressed data cached to localStorage (${formatFileSize(compressedString.length)})`);
                    } else {
                        console.warn(`📛 Ngay cả dữ liệu nén vẫn quá lớn: ${formatFileSize(compressedString.length)}`);
                    }
                }
            } catch (e) {
                console.warn(`📛 Không thể lưu vào localStorage: ${e.message}`);
            }
        } else {
            console.warn("📛 localStorage không khả dụng, chỉ lưu trong bộ nhớ");
        }
    },

    // Lấy data từ cache
    getCache: function (key) {
        // Ưu tiên cache bộ nhớ
        const memoryCache = this.cache[key];
        if (memoryCache && Date.now() - memoryCache.timestamp < this.EXPIRY_TIME) {
            console.log(`🗄️ Serving data from memory cache for key: ${key}`);
            return memoryCache.data;
        }

        // Thử lấy từ localStorage nếu khả dụng
        if (this.canUseLocalStorage()) {
            try {
                // Thử lấy dữ liệu đầy đủ
                const storedCache = localStorage.getItem(`cache_${key}`);
                if (storedCache) {
                    const parsedCache = JSON.parse(storedCache);
                    if (Date.now() - parsedCache.timestamp < this.EXPIRY_TIME) {
                        console.log(`🗄️ Serving data from localStorage cache for key: ${key}`);
                        // Cập nhật cache bộ nhớ
                        this.cache[key] = parsedCache;
                        return parsedCache.data;
                    } else {
                        console.log(`⌛ Cache expired for key: ${key}`);
                        localStorage.removeItem(`cache_${key}`);
                    }
                }

                // Thử lấy dữ liệu nén nếu có
                const compressedCache = localStorage.getItem(`cache_${key}_compressed`);
                if (compressedCache) {
                    const parsedCompressed = JSON.parse(compressedCache);
                    if (Date.now() - parsedCompressed.timestamp < this.EXPIRY_TIME) {
                        console.log(`🗄️ Serving compressed data from localStorage for key: ${key}`);
                        console.warn(`⚠️ Đang sử dụng dữ liệu nén có thông tin hạn chế`);
                        return parsedCompressed.data;
                    } else {
                        console.log(`⌛ Compressed cache expired for key: ${key}`);
                        localStorage.removeItem(`cache_${key}_compressed`);
                    }
                }
            } catch (e) {
                console.warn(`📛 Lỗi đọc từ localStorage: ${e.message}`);
            }
        }

        return null;
    },

    // Xóa cache theo key
    clearCache: function (key) {
        console.log(`🧹 Clearing cache for key: ${key}`);
        delete this.cache[key];

        if (this.canUseLocalStorage()) {
            try {
                localStorage.removeItem(`cache_${key}`);
                localStorage.removeItem(`cache_${key}_compressed`);
            } catch (e) {
                console.warn(`📛 Lỗi xóa từ localStorage: ${e.message}`);
            }
        }
    },

    // Xóa toàn bộ cache
    clearAllCache: function () {
        console.log(`🧹 Clearing all caches`);
        this.cache = {};

        if (this.canUseLocalStorage()) {
            try {
                // Chỉ xóa các item có prefix cache_
                const keysToRemove = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith('cache_')) {
                        keysToRemove.push(key);
                    }
                }

                // Xóa các key đã thu thập
                keysToRemove.forEach(key => {
                    localStorage.removeItem(key);
                });

                console.log(`🧹 Đã xóa ${keysToRemove.length} cache items từ localStorage`);
            } catch (e) {
                console.warn(`📛 Lỗi xóa từ localStorage: ${e.message}`);
            }
        }
    }
};

// Khởi tạo CacheManager ngay khi script được tải
CacheManager.init();

// Remove trailing slash if exists to avoid double slash
function getUrl(endpoint) {
    // Ensure endpoint starts with a slash
    if (!endpoint.startsWith('/')) {
        endpoint = '/' + endpoint;
    }
    
    // If in production, use relative URLs
    if (!isDevelopment) {
        return endpoint;
    }
    
    // Remove trailing slash from base URL if it exists
    const baseUrl = API_BASE_URL.endsWith('/') 
        ? API_BASE_URL.slice(0, -1) 
        : API_BASE_URL;
        
    const fullUrl = baseUrl + endpoint;
    DEBUG.logAPI('URL', `Generated URL: ${fullUrl}`);
    return fullUrl;
}

// Biến toàn cục cho dữ liệu người chơi
let currentData = [];
let filteredData = []; // Thêm biến lưu dữ liệu đã lọc
let isLoadingData = false;
let loadingErrorOccurred = false;

// Cài đặt phân trang
const pagination = {
    itemsPerPage: 20, // Mặc định hiển thị 20 người chơi mỗi trang
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    serverSidePagination: true // Enable server-side pagination
};

// Trạng thái sắp xếp
const sortState = {
    field: 'PlayerName',
    direction: 'asc'
};

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
 * Định dạng thời gian đơn giản
 * @param {string} dateString - Chuỗi thời gian
 * @return {string} Chuỗi thời gian đã định dạng
 */
function formatDateTime(dateString) {
    if (!dateString) return "";
    
    // Tạo đối tượng Date từ chuỗi
    const date = new Date(dateString);
    
    // Format giờ phút
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    
    // Format ngày tháng
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    
    // Kết hợp thành chuỗi định dạng: "HH:MM:SS DD/MM/YYYY"
    return `${hours}:${minutes}:${seconds} ${day}/${month}/${year}`;
}

/**
 * Format file size để hiển thị thân thiện
 * @param {number} bytes - Kích thước tính bằng bytes
 * @returns {string} Kích thước đã định dạng
 */
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1048576) return Math.round(bytes / 1024) + ' KB';
    else return Math.round(bytes / 1048576 * 10) / 10 + ' MB';
}

/**
 * Tạo bảng dữ liệu từ mảng người chơi
 * @param {Array} players - Mảng dữ liệu người chơi
 */
async function createPlayersTable(players) {
    const container = document.getElementById('playersContainer');
    if (!container) return;

    // Nếu không có dữ liệu người chơi
    if (!players || players.length === 0) {
        container.innerHTML = `
            <div class="alert alert-warning">
                <i class="bi bi-exclamation-triangle-fill me-2"></i> 
                Không có dữ liệu người chơi. Vui lòng đợi người chơi tham gia trò chơi hoặc thử làm mới dữ liệu.
            </div>
        `;
        return;
    }
    
    filteredData = [...players];
    
    // Tính toán số trang
    const totalItems = pagination.serverSidePagination ? pagination.totalItems : players.length;
    pagination.totalPages = Math.ceil(totalItems / pagination.itemsPerPage);

    // Xác định người chơi hiển thị trên trang hiện tại
    let paginatedPlayers;

    if (pagination.serverSidePagination) {
        // Server đã xử lý phân trang, hiển thị toàn bộ dữ liệu đã nhận
        paginatedPlayers = players;
    } else {
        // Phân trang phía client
    const startIndex = (pagination.currentPage - 1) * pagination.itemsPerPage;
        paginatedPlayers = players.slice(startIndex, startIndex + pagination.itemsPerPage);
    }

    // Xử lý dữ liệu song song
    const processedPlayerData = await Promise.all(paginatedPlayers.map(async player => {
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
        const ticket = player.ItemsList ? player.ItemsList.find(item => item.Name === 'Ticket') : null;
        const ticketAmount = ticket ? ticket.Amount : 0;

        // Tạo danh sách gamepass
        const gamepasses = player.PassesList ? player.PassesList.map(pass => pass.Name).join(', ') : '';
        const gamepassCount = player.PassesList ? player.PassesList.length : 0;

        return {
            player,
            sPets,
            ssPets,
            itemsTooltip,
            totalItems,
            ticketAmount,
            gamepasses,
            gamepassCount
        };
    }));
    
    const tableHtml = `
        <div class="d-flex justify-content-between align-items-center mb-3">
            <div>
                <h5>Total Accounts: <span class="badge bg-primary">${pagination.totalItems}</span></h5>
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
        
        <div class="table-responsive">
        <table class="table table-dark table-striped table-hover">
                <thead class="table-dark sticky-top">
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
                    ${processedPlayerData.map(data => {
                    return `
                    <tr>
                        <td class="text-center">
                                <input type="checkbox" class="form-check-input player-checkbox" data-player="${data.player.PlayerName}">
                        </td>
                        <td>
                                <strong class="text-light">${data.player.PlayerName}</strong>
                        </td>
                            <td class="text-light">${formatNumber(data.player.Cash || 0)}</td>
                            <td class="text-light">${formatNumber(data.player.Gems || 0)}</td>
                        <td class="text-center">
                                <span class="badge bg-warning text-dark">${formatNumber(data.ticketAmount)}</span>
                        </td>
                        <td class="text-center">
                                <span class="badge pet-rank-S">${data.sPets}</span>
                        </td>
                        <td class="text-center">
                                <span class="badge pet-rank-SS">${data.ssPets}</span>
                        </td>
                        <td class="text-center">
                            <span class="badge bg-info gamepass-badge" 
                                  style="cursor: pointer;" 
                                  data-bs-toggle="modal" 
                                  data-bs-target="#gamepassModal"
                                      data-player="${data.player.PlayerName}"
                                      data-gamepasses='${JSON.stringify(data.player.PassesList || [])}'>
                                    ${data.gamepassCount}
                            </span>
                        </td>
                    </tr>
                `}).join('')}
            </tbody>
        </table>
        </div>
        
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

    // Thiết lập tất cả sự kiện và tính năng cần thiết
    await Promise.all([
        setupGamepassBadges(),
        setupSortingListeners(),
        initTableFeatures(),
        setupItemsPerPageSelect(),
        setupPaginationListeners()
    ]);

    // Cập nhật biểu tượng sắp xếp
    updateSortingIcons();
}
/**
 * Tạo điều khiển phân trang
 * @returns {string} HTML cho điều khiển phân trang
 */
function createPaginationControls() {
    if (pagination.totalPages <= 1) {
        return '';
    }

    console.log(`Creating pagination: Current page=${pagination.currentPage}, Total pages=${pagination.totalPages}`);
    
    let paginationHtml = `
        <nav aria-label="Page navigation" class="mt-3">
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

function setupPaginationListeners() {
    console.log('Setting up pagination listeners');

    // Xóa tất cả event listeners cũ
    const oldPagination = document.querySelectorAll('.pagination');
    if (oldPagination) {
        oldPagination.forEach(p => {
            const clone = p.cloneNode(true);
            p.parentNode.replaceChild(clone, p);
        });
    }

    // Áp dụng event listeners mới
    document.querySelectorAll('.pagination .page-link').forEach(link => {
        link.addEventListener('click', async function (e) {
            e.preventDefault();
            
            const page = this.getAttribute('data-page');
            console.log(`Pagination link clicked: ${page}`);

            let newPage = pagination.currentPage;
            
            if (page === 'prev') {
                if (pagination.currentPage > 1) {
                    newPage = pagination.currentPage - 1;
                }
            } else if (page === 'next') {
                if (pagination.currentPage < pagination.totalPages) {
                    newPage = pagination.currentPage + 1;
                }
            } else {
                newPage = parseInt(page);
            }

            if (newPage !== pagination.currentPage) {
                console.log(`Chuyển trang từ ${pagination.currentPage} sang ${newPage}`);
                pagination.currentPage = newPage;

                // Luôn tải dữ liệu mới khi chuyển trang để đảm bảo dữ liệu chính xác
                await fetchLatestStats(false);

                // Cuộn lên đầu bảng
                const tableTop = document.querySelector('.table');
                if (tableTop) {
                    window.scrollTo({ top: tableTop.offsetTop - 20, behavior: 'smooth' });
                }
            }
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
 * Hiển thị thông báo loading
 */
function showLoadingIndicator() {
    const container = document.getElementById('playersContainer');
    if (!container) return;

    container.innerHTML = `
        <div class="text-center my-5">
            <div class="spinner-border text-primary" role="status" style="width: 3rem; height: 3rem;">
                <span class="visually-hidden">Loading...</span>
            </div>
            <p class="mt-3 text-light">Đang tải dữ liệu người chơi...</p>
        </div>
    `;
}

/**
 * Hiển thị thông báo lỗi
 * @param {string} error - Thông báo lỗi
 */
function showErrorMessage(error) {
    const container = document.getElementById('playersContainer');
    if (!container) return;

    container.innerHTML = `
        <div class="alert alert-danger">
            <h4 class="alert-heading">Lỗi khi tải dữ liệu!</h4>
            <p>${error}</p>
            <hr>
            <div class="d-flex justify-content-end">
                <button id="retryBtn" class="btn btn-outline-danger">
                    <i class="bi bi-arrow-clockwise me-1"></i> Thử lại
                </button>
            </div>
        </div>
    `;

    // Thêm hàm xử lý nút thử lại
    document.getElementById('retryBtn').addEventListener('click', () => {
        fetchLatestStats(true);
    });
}

/**
 * Lấy dữ liệu mới nhất từ server
 * @param {boolean} forceRefresh - Có bắt buộc tải mới từ server không, bỏ qua cache
 */
async function fetchLatestStats(forceRefresh = false) {
    // Lấy từ khóa tìm kiếm hiện tại nếu có
    const searchTerm = document.getElementById('searchInput').value.trim();

    // Tạo key cache bao gồm cả tham số tìm kiếm
    const CACHE_KEY = `latest_stats_page_${pagination.currentPage}_size_${pagination.itemsPerPage}_search_${searchTerm || 'none'}`;

    // Tránh tải đồng thời nhiều lần
    if (isLoadingData) {
        console.log('Đang tải dữ liệu, bỏ qua yêu cầu mới...');
        return;
    }

    isLoadingData = true;
    console.log(`Fetching data - Page: ${pagination.currentPage}, Items per page: ${pagination.itemsPerPage}, Search: "${searchTerm || 'none'}"`);

    // Hiển thị loading state
    const container = document.getElementById('playersContainer');

    // Kiểm tra cache trước khi hiển thị loading nếu không phải force refresh
    if (!forceRefresh) {
        const cachedData = CacheManager.getCache(CACHE_KEY);
        if (cachedData) {
            console.log(`🗄️ Using cached data for page ${pagination.currentPage} with search "${searchTerm || 'none'}"`);

            // Extract data và pagination info từ cache
            let data, paginationInfo;

            if (cachedData.data && cachedData.pagination) {
                data = cachedData.data;
                paginationInfo = cachedData.pagination;

                // Đảm bảo thông tin phân trang được cập nhật đúng
                pagination.currentPage = paginationInfo.page;
                pagination.totalItems = paginationInfo.total_items;
                pagination.totalPages = paginationInfo.total_pages;
                pagination.serverSidePagination = true;

                console.log(`Cache hit - Page ${pagination.currentPage}/${pagination.totalPages}, Total items: ${pagination.totalItems}`);
            } else {
                // Format cũ - chỉ là mảng người chơi
                data = cachedData;
                pagination.totalItems = data.length;
                pagination.totalPages = Math.ceil(data.length / pagination.itemsPerPage);
                pagination.serverSidePagination = false;
            }

            currentData = data;
            filteredData = data;

            await createPlayersTable(data);

            // Hiển thị thông báo nhỏ về việc dùng cache
            const alertDiv = document.createElement('div');
            alertDiv.className = 'alert alert-info alert-dismissible fade show mt-2';
            alertDiv.innerHTML = `
                <small>Đang hiển thị dữ liệu trang ${pagination.currentPage} từ bộ nhớ cache. <a href="#" id="forceRefreshLink">Tải mới</a> để cập nhật dữ liệu mới nhất.</small>
                <button type="button" class="btn-close btn-sm" data-bs-dismiss="alert" aria-label="Close"></button>
            `;
            container.insertAdjacentElement('afterbegin', alertDiv);

            // Thêm event listener cho link tải mới
            document.getElementById('forceRefreshLink').addEventListener('click', function (e) {
                e.preventDefault();
                fetchLatestStats(true);
            });

            isLoadingData = false;
            return;
        }
    }

    // Nếu không có cache hoặc force refresh, hiển thị loading indicator
    showLoadingIndicator();

    try {
        // Tạo URL API với thông tin phân trang
        let apiUrl = getUrl('/api/latest');
        apiUrl += `?page=${pagination.currentPage}&page_size=${pagination.itemsPerPage}`;

        // Thêm tham số tìm kiếm nếu có
        if (searchTerm) {
            apiUrl += `&search=${encodeURIComponent(searchTerm)}`;
        }

        // Nếu force refresh, thêm thông số để tránh cache browser
        if (forceRefresh) {
            apiUrl += `&_t=${Date.now()}`;
        }

        console.log('Gọi API:', apiUrl);
        DEBUG.logAPI('GET', apiUrl);
        
        const response = await fetch(apiUrl, {
            method: 'GET',
            credentials: 'include', // Include cookies
            headers: {
                'Accept': 'application/json',
                'Cache-Control': forceRefresh ? 'no-cache, no-store, must-revalidate' : ''
            }
        });
        
        console.log('API Response status:', response.status, response.statusText);
        
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status} - ${response.statusText}`);
        }
        
        const responseData = await response.json();
        console.log('API response received:', responseData);

        let data, paginationInfo;

        // Check if the response is already structured with data and pagination
        if (responseData.data && responseData.pagination) {
            data = responseData.data;
            paginationInfo = responseData.pagination;

            console.log('Phân trang từ server:', paginationInfo);

            // Update pagination state
            pagination.currentPage = paginationInfo.page;
            pagination.totalItems = paginationInfo.total_items;
            pagination.totalPages = paginationInfo.total_pages;
            pagination.serverSidePagination = true;

            console.log(`Trang hiện tại: ${pagination.currentPage}/${pagination.totalPages}, Tổng số mục: ${pagination.totalItems}`);
        } else {
            // Legacy format - just an array of players
            data = responseData;
            pagination.totalItems = data.length;
            pagination.totalPages = Math.ceil(data.length / pagination.itemsPerPage);
            pagination.serverSidePagination = false;

            console.log('Không có thông tin phân trang từ server, sử dụng phân trang client-side');
        }

        // Validate data format
        if (!Array.isArray(data)) {
            console.error('Invalid data format received:', data);
            DEBUG.error('Invalid data format', data);
            throw new Error('Invalid data format received from server');
        }
        
        // Check if we have valid data
        if (data.length === 0) {
            console.log('No player data available in response');

            if (searchTerm) {
                // Hiển thị thông báo không tìm thấy kết quả
            container.innerHTML = `
                    <div class="alert alert-warning">
                        <i class="bi bi-exclamation-triangle-fill me-2"></i>
                        Không tìm thấy người chơi nào tên "${searchTerm}".
                        <button class="btn btn-sm btn-outline-secondary ms-3" id="clearSearchBtn">
                            <i class="bi bi-x-circle me-1"></i> Xóa tìm kiếm
                        </button>
                    </div>
                `;

                // Thêm sự kiện cho nút xóa tìm kiếm
                document.getElementById('clearSearchBtn').addEventListener('click', () => {
                    document.getElementById('searchInput').value = '';
                    fetchLatestStats(true);
                });
            } else {
                // Hiển thị thông báo không có dữ liệu
                container.innerHTML = `
                    <div class="alert alert-warning">
                        <i class="bi bi-exclamation-triangle-fill me-2"></i>
                        Không có dữ liệu người chơi. Vui lòng đợi người chơi tham gia trò chơi.
                </div>
            `;
            }

            isLoadingData = false;
            return;
        }
        
        console.log(`Nhận được ${data.length} bản ghi người chơi`);

        // Lưu vào cache với khóa bao gồm thông tin phân trang và tìm kiếm
        if (data.length > 0) {
            CacheManager.setCache(CACHE_KEY, responseData);
        }

        currentData = data;
        filteredData = data;

        // Reset error state
        loadingErrorOccurred = false;

        // Cập nhật bảng dữ liệu
        await createPlayersTable(data);

        // Cập nhật thời gian refresh
        const lastUpdatedEl = document.getElementById('last-updated');
        if (lastUpdatedEl) {
            lastUpdatedEl.textContent = new Date().toLocaleTimeString();
        }

    } catch (error) {
        console.error('Error fetching data:', error);
        DEBUG.error('Fetch error', error);

        // Set error state
        loadingErrorOccurred = true;

        // Nếu có lỗi, thử dùng cache nếu có
        const cachedData = CacheManager.getCache(CACHE_KEY);
        if (cachedData && !forceRefresh) {
            console.log(`🗄️ Fallback to cached data for page ${pagination.currentPage} due to error`);

            // Extract data from cache
            let data;
            if (cachedData.data && Array.isArray(cachedData.data)) {
                data = cachedData.data;

                // Update pagination if available
                if (cachedData.pagination) {
                    pagination.currentPage = cachedData.pagination.page || pagination.currentPage;
                    pagination.totalItems = cachedData.pagination.total_items || data.length;
                    pagination.totalPages = cachedData.pagination.total_pages ||
                        Math.ceil(pagination.totalItems / pagination.itemsPerPage);
                }
            } else {
                data = cachedData;
                pagination.totalItems = data.length;
                pagination.totalPages = Math.ceil(data.length / pagination.itemsPerPage);
            }

        container.innerHTML = `
                <div class="alert alert-warning alert-dismissible fade show mb-3">
                    <strong>Lỗi kết nối:</strong> ${error.message}. Đang hiển thị dữ liệu từ bộ nhớ cache.
                    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
            </div>
        `;
        
            currentData = data;
            filteredData = data;
            await createPlayersTable(data);
        } else {
            // Hiển thị thông báo lỗi nếu không có cache
            showErrorMessage(`Không thể tải dữ liệu: ${error.message}`);
        }
    } finally {
        isLoadingData = false;

        // Đảm bảo rằng nút phân trang được thiết lập đúng
        setTimeout(() => {
            setupPaginationListeners();

            // Cập nhật UI để hiển thị đúng trang hiện tại
            document.querySelectorAll('.pagination .page-item').forEach(item => {
                const pageLink = item.querySelector('.page-link');
                if (pageLink && pageLink.getAttribute('data-page') == pagination.currentPage) {
                    item.classList.add('active');
                } else if (item.classList.contains('active') && pageLink && pageLink.getAttribute('data-page') != pagination.currentPage) {
                    item.classList.remove('active');
                }
            });

        }, 100);
    }
}

/**
 * Sắp xếp dữ liệu theo trường chỉ định
 * @param {string} field - Tên trường cần sắp xếp
 */
async function sortData(field) {
    if (sortState.field === field) {
        sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
        sortState.field = field;
        sortState.direction = 'asc';
    }
    
    // Sử dụng requestAnimationFrame để làm mượt việc sort
    await new Promise(resolve => {
        requestAnimationFrame(async () => {
            const sortedData = [...filteredData].sort((a, b) => {
        let valA, valB;
        
        if (field === 'timestamp') {
            valA = new Date(a[field]).getTime();
            valB = new Date(b[field]).getTime();
        } else if (field === 'Cash' || field === 'Gems') {
            valA = Number(a[field]) || 0;
            valB = Number(b[field]) || 0;
        } else if (field === 'Ticket') {
                    // Tìm ticket trong ItemsList
                    const ticketA = a.ItemsList ? a.ItemsList.find(item => item.Name === 'Ticket') : null;
                    const ticketB = b.ItemsList ? b.ItemsList.find(item => item.Name === 'Ticket') : null;
                    valA = ticketA ? ticketA.Amount : 0;
                    valB = ticketB ? ticketB.Amount : 0;
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

                // Xử lý giá trị null/undefined
                if (valA === null || valA === undefined) valA = sortState.direction === 'asc' ? Number.MIN_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
                if (valB === null || valB === undefined) valB = sortState.direction === 'asc' ? Number.MIN_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
        
        if (sortState.direction === 'asc') {
                    return valA > valB ? 1 : valA < valB ? -1 : 0;
        } else {
                    return valA < valB ? 1 : valA > valB ? -1 : 0;
        }
    });
    
            // Nếu sử dụng phân trang phía client, reset về trang 1
            if (!pagination.serverSidePagination) {
    pagination.currentPage = 1;
            }

            await createPlayersTable(sortedData);
    updateSortingIcons();
            resolve();
        });
    });
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
/**
 * Lọc dữ liệu dựa trên đầu vào tìm kiếm
 */
async function filterData() {
    const searchTerm = document.getElementById('searchInput').value.trim();

    // Reset phân trang về trang 1 khi tìm kiếm
        pagination.currentPage = 1;

    // Sử dụng debounce để tránh gửi quá nhiều request
    clearTimeout(window.filterTimeout);

    window.filterTimeout = setTimeout(async () => {
        // Nếu đang tải dữ liệu, bỏ qua
        if (isLoadingData) return;

        console.log(`Đang thực hiện tìm kiếm: "${searchTerm}"`);

        // Hiển thị indicator tìm kiếm
        const searchIcon = document.querySelector('#searchInput + .spinner-border');
        if (searchIcon) {
            searchIcon.classList.remove('d-none');
        }

        // Reset lại currentPage khi tìm kiếm
    pagination.currentPage = 1;

        // Gọi API để tìm kiếm
        await fetchLatestStats(true);

        // Ẩn indicator tìm kiếm
        if (searchIcon) {
            searchIcon.classList.add('d-none');
        }
    }, 500); // Delay 500ms để tránh gửi quá nhiều request
}

function setupCheckboxListeners() {
    // Checkbox "Chọn tất cả"
    const selectAllCheckbox = document.getElementById('selectAll');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', function () {
            const checkboxes = document.querySelectorAll('.player-checkbox');
            checkboxes.forEach(checkbox => {
                checkbox.checked = this.checked;
            });
            
            // Bật/tắt nút xóa
            document.getElementById('deleteSelectedBtn').disabled = !this.checked;
        });
    }
    
    // Các checkbox riêng lẻ
    document.getElementById('playersContainer').addEventListener('change', function (event) {
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
 * @returns {Promise<{success: boolean, error: string}>} Kết quả xóa
 */
async function deletePlayer(playerName) {
    console.log(`⚡ Xóa người chơi: ${playerName}`);
    try {
        const apiUrl = getUrl(`/api/player/${playerName}`);
        console.log(`Gửi request đến: ${apiUrl}`);
        
        const response = await fetch(apiUrl, {
            method: 'DELETE',
            credentials: 'include',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }
        
        const result = await response.json();
        
        if (result && result.success) {
            console.log(`✅ Đã xóa thành công người chơi ${playerName}`);

            // Xóa cache sau khi xóa người chơi
            CacheManager.clearCache('latest_stats');

            return { 
                success: true,
                deletedCount: result.deleted_count || 0,
                remainingCount: result.remaining_count || 0
            };
        } else {
            console.log(`❌ Không thể xóa người chơi ${playerName}`);
            return { 
                success: false, 
                error: result.detail || result.message || 'Server returned success: false'
            };
        }
    } catch (error) {
        console.error('Error deleting player:', error);
        return { 
            success: false, 
            error: error.message || 'Unknown error occurred'
        };
    }
}

/**
 * Xóa nhiều người chơi đã chọn
 */
async function deleteSelectedPlayers() {
    console.log(`⚡ Bắt đầu quá trình xóa nhiều người chơi`);
    
    const selectedCheckboxes = document.querySelectorAll('.player-checkbox:checked');
    if (selectedCheckboxes.length === 0) {
        alert('Vui lòng chọn ít nhất một người chơi để xóa.');
        return;
    }

    const selectedPlayers = Array.from(selectedCheckboxes).map(checkbox => checkbox.getAttribute('data-player'));
    console.log(`Đã chọn ${selectedPlayers.length} người chơi để xóa`);
    
    if (!confirm(`Bạn có chắc chắn muốn xóa ${selectedPlayers.length} người chơi đã chọn?`)) {
        console.log("Người dùng đã hủy xóa");
        return;
    }
    
    console.log("Tiến hành xóa người chơi...");

    // Hiển thị thông báo đang xử lý
    const container = document.getElementById('playersContainer');
    const originalContent = container.innerHTML;
    container.innerHTML = `
        <div class="text-center my-5">
            <div class="spinner-border text-danger" role="status" style="width: 3rem; height: 3rem;">
                <span class="visually-hidden">Đang xóa...</span>
            </div>
            <p class="mt-3 text-light">Đang xóa ${selectedPlayers.length} người chơi...</p>
            <div class="progress mt-3" style="height: 25px;">
                <div id="deleteProgress" class="progress-bar progress-bar-striped progress-bar-animated bg-danger" 
                     role="progressbar" style="width: 0%;" 
                     aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">
                    0%
                </div>
            </div>
        </div>
    `;

    let successCount = 0;
    let failCount = 0;
    let errors = [];
    let totalRecordsDeleted = 0;

    // Function to update progress bar
    const updateProgress = (current, total) => {
        const percent = Math.round((current / total) * 100);
        const progressBar = document.getElementById('deleteProgress');
        if (progressBar) {
            progressBar.style.width = `${percent}%`;
            progressBar.setAttribute('aria-valuenow', percent);
            progressBar.textContent = `${percent}% (${current}/${total})`;
        }
    };

    // Xóa tuần tự
    for (let i = 0; i < selectedPlayers.length; i++) {
        const playerName = selectedPlayers[i];
        try {
            console.log(`Đang xóa: ${playerName}`);
            const result = await deletePlayer(playerName);
            if (result.success) {
                successCount++;
                totalRecordsDeleted += result.deletedCount || 0;
                console.log(`Đã xóa thành công: ${playerName}`);
            } else {
                failCount++;
                errors.push(`${playerName}: ${result.error || 'Lỗi không xác định'}`);
                console.log(`Xóa thất bại: ${playerName} - ${result.error || 'Lỗi không xác định'}`);
            }
        } catch (error) {
            console.error(`Error deleting player ${playerName}:`, error);
            failCount++;
            errors.push(`${playerName}: ${error.message || 'Lỗi không xác định'}`);
        }

        // Update progress
        updateProgress(i + 1, selectedPlayers.length);
    }

    // Hiển thị kết quả
    let message = `Kết quả xóa người chơi:\n`;
    message += `- Thành công: ${successCount} người chơi\n`;
    message += `- Tổng số bản ghi đã xóa: ${totalRecordsDeleted}\n`;
    
    if (failCount > 0) {
        message += `- Thất bại: ${failCount} người chơi\n`;
        
        if (errors.length > 0 && errors.length <= 5) {
            message += `\nLỗi chi tiết:\n${errors.join('\n')}`;
        } else if (errors.length > 5) {
            message += `\nLỗi chi tiết:\n${errors.slice(0, 5).join('\n')}\n...và ${errors.length - 5} lỗi khác`;
        }
    }
    
    alert(message);
    console.log(`Đã xóa xong. Thành công: ${successCount}, Thất bại: ${failCount}`);

    // Refresh the data to show current state
    await fetchLatestStats(true);
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
            window.location.href = '/';
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
document.addEventListener('DOMContentLoaded', async function () {
    // Kiểm tra trạng thái đăng nhập trước
    const isAuthenticated = await checkAuthentication();
    if (!isAuthenticated) return;
    
    // Thiết lập tất cả các sự kiện song song bằng Promise.all
    await Promise.all([
        setupSearchInput(),
        setupRefreshButton(),
        setupDeleteButton(),
        setupCacheControls()
    ]);

    // Tải dữ liệu ban đầu (ưu tiên cache trước)
    await fetchLatestStats(false);

    // Tự động làm mới mỗi 5 phút nếu người dùng không hoạt động
    let inactivityTime = 0;
    const autoRefreshInterval = 5 * 60; // 5 phút

    // Reset inactivity timer khi có tương tác người dùng
    const resetInactivityTimer = () => {
        inactivityTime = 0;
    };

    // Gắn các sự kiện tương tác người dùng
    ['click', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(eventType => {
        document.addEventListener(eventType, resetInactivityTimer, true);
    });

    // Thiết lập timer kiểm tra tự động làm mới
    setInterval(() => {
        inactivityTime += 1;

        // Nếu không hoạt động trong [autoRefreshInterval] giây và không có lỗi, làm mới dữ liệu
        if (inactivityTime >= autoRefreshInterval && !isLoadingData && !loadingErrorOccurred) {
            console.log(`Tự động làm mới sau ${autoRefreshInterval} giây không hoạt động`);
            fetchLatestStats(false);
        }
    }, 1000); // Kiểm tra mỗi giây
});

/**
 * Thiết lập sự kiện tìm kiếm
 */
async function setupSearchInput() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        // Thêm placeholder
        searchInput.placeholder = "Tìm kiếm người chơi...";

        // Thêm indicator tìm kiếm
        const inputGroup = searchInput.parentElement;
        if (inputGroup && !inputGroup.querySelector('.spinner-border')) {
            const spinner = document.createElement('div');
            spinner.className = 'spinner-border spinner-border-sm text-secondary d-none';
            spinner.style.position = 'absolute';
            spinner.style.right = '10px';
            spinner.style.top = '50%';
            spinner.style.transform = 'translateY(-50%)';
            spinner.setAttribute('role', 'status');
            spinner.innerHTML = '<span class="visually-hidden">Đang tìm kiếm...</span>';

            inputGroup.style.position = 'relative';
            inputGroup.appendChild(spinner);
        }

        // Gắn sự kiện input để tìm kiếm khi gõ
        searchInput.addEventListener('input', filterData);

        // Xử lý phím Enter
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                filterData();
            }
        });

        // Nút xóa tìm kiếm
        const clearButtonContainer = document.createElement('div');
        clearButtonContainer.style.position = 'absolute';
        clearButtonContainer.style.right = '10px';
        clearButtonContainer.style.top = '50%';
        clearButtonContainer.style.transform = 'translateY(-50%)';
        clearButtonContainer.style.zIndex = '5';

        const clearButton = document.createElement('button');
        clearButton.type = 'button';
        clearButton.className = 'btn btn-sm btn-link text-secondary d-none';
        clearButton.innerHTML = '<i class="bi bi-x-circle"></i>';
        clearButton.title = 'Xóa tìm kiếm';
        clearButton.style.padding = '0';
        clearButton.style.margin = '0';
        clearButton.addEventListener('click', () => {
            searchInput.value = '';
            clearButton.classList.add('d-none');
            filterData();
        });

        clearButtonContainer.appendChild(clearButton);
        inputGroup.appendChild(clearButtonContainer);

        // Hiển thị/ẩn nút xóa dựa trên giá trị input
        searchInput.addEventListener('input', () => {
            if (searchInput.value.trim()) {
                clearButton.classList.remove('d-none');
            } else {
                clearButton.classList.add('d-none');
            }
        });
    }

    return Promise.resolve();
}

async function setupRefreshButton() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => fetchLatestStats(true));
    }
    return Promise.resolve();
    }
    
/**
 * Thiết lập nút xóa đã chọn
 */
async function setupDeleteButton() {
    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    if (deleteSelectedBtn) {
        deleteSelectedBtn.addEventListener('click', () => deleteSelectedPlayers());
    }
    return Promise.resolve();
}

/**
 * Thiết lập sự kiện cho gamepass badges 
 */
async function setupGamepassBadges() {
    const badges = document.querySelectorAll('.gamepass-badge');
    const promises = Array.from(badges).map(badge => {
        return new Promise(resolve => {
            badge.addEventListener('click', function () {
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
            resolve();
        });
    });

    await Promise.all(promises);
}

/**
 * Thiết lập sự kiện cho itemsPerPage select
 */
async function setupItemsPerPageSelect() {
    const itemsPerPageSelect = document.getElementById('itemsPerPageSelect');
    if (itemsPerPageSelect) {
        return new Promise(resolve => {
            itemsPerPageSelect.addEventListener('change', async function () {
                pagination.itemsPerPage = parseInt(this.value);
                pagination.currentPage = 1;

                if (pagination.serverSidePagination) {
                    // Tải lại dữ liệu từ server với page size mới
                    await fetchLatestStats(false);
                } else {
                    // Cập nhật UI với dữ liệu hiện tại
                    pagination.totalPages = Math.ceil(filteredData.length / pagination.itemsPerPage);
                    await createPlayersTable(filteredData);
                }
                resolve();
            });
            resolve();
        });
    }
    return Promise.resolve();
}

/**
 * Thiết lập controls để quản lý cache
 */
async function setupCacheControls() {
    // Tìm navbar-nav để thêm nút quản lý cache
    const navbarNav = document.querySelector('.navbar-nav');
    if (navbarNav) {
        const cacheControlsLi = document.createElement('li');
        cacheControlsLi.className = 'nav-item dropdown';
        cacheControlsLi.innerHTML = `
            <a class="nav-link dropdown-toggle" href="#" id="cacheDropdown" role="button" 
               data-bs-toggle="dropdown" aria-expanded="false">
                <i class="bi bi-cpu"></i> Cache ${CacheManager.canUseLocalStorage() ? '' : '⚠️'}
            </a>
            <ul class="dropdown-menu dropdown-menu-dark" aria-labelledby="cacheDropdown">
                <li><a class="dropdown-item" href="#" id="clearCacheBtn">
                    <i class="bi bi-trash"></i> Xóa tất cả cache
                </a></li>
                <li><a class="dropdown-item" href="#" id="forceRefreshBtn">
                    <i class="bi bi-arrow-clockwise"></i> Tải mới (bỏ qua cache)
                </a></li>
                <li><hr class="dropdown-divider"></li>
                <li><a class="dropdown-item" href="#" id="viewCacheStatsBtn">
                    <i class="bi bi-info-circle"></i> Thông tin cache
                </a></li>
                ${!CacheManager.canUseLocalStorage() ? `
                <li><hr class="dropdown-divider"></li>
                <li><a class="dropdown-item disabled text-warning" href="#">
                    <i class="bi bi-exclamation-triangle"></i> localStorage không khả dụng
                </a></li>` : ''}
            </ul>
        `;
        navbarNav.appendChild(cacheControlsLi);

        // Gắn sự kiện cho các nút
        document.getElementById('clearCacheBtn').addEventListener('click', function (e) {
            e.preventDefault();
            CacheManager.clearAllCache();
            alert('Đã xóa tất cả cache');
        });

        document.getElementById('forceRefreshBtn').addEventListener('click', function (e) {
            e.preventDefault();
            fetchLatestStats(true);
        });

        document.getElementById('viewCacheStatsBtn').addEventListener('click', function (e) {
            e.preventDefault();

            // Tính dung lượng cache
            let totalSize = 0;
            let cacheItems = [];

            // Kiểm tra memory cache
            for (const key in CacheManager.cache) {
                const itemSize = JSON.stringify(CacheManager.cache[key]).length;
                totalSize += itemSize;
                cacheItems.push({
                    key: key,
                    size: formatFileSize(itemSize),
                    time: new Date(CacheManager.cache[key].timestamp).toLocaleString()
                });
            }

            // Kiểm tra localStorage cache nếu khả dụng
            let localStorageSize = 0;
            let localStorageItems = 0;

            if (CacheManager.canUseLocalStorage()) {
                try {
                    localStorageItems = 0;
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        if (key && key.startsWith('cache_')) {
                            const value = localStorage.getItem(key);
                            localStorageSize += value.length;
                            localStorageItems++;
                        }
                    }
                } catch (e) {
                    console.warn(`Error reading localStorage size: ${e.message}`);
                }
            }

            // Hiển thị thông tin
            alert(`Thông tin Cache:
- Bộ nhớ RAM: ${formatFileSize(totalSize)}
- Số lượng cache trong RAM: ${Object.keys(CacheManager.cache).length} item(s)
${CacheManager.canUseLocalStorage() ?
                    `- localStorage: ${formatFileSize(localStorageSize)}
- Số lượng cache trong localStorage: ${localStorageItems} item(s)` :
                    `- localStorage: Không khả dụng`}
- Thời gian hết hạn: ${CacheManager.EXPIRY_TIME / 60000} phút`);
        });
    }

    return Promise.resolve();
}

/**
 * Format file size để hiển thị thân thiện
 * @param {number} bytes - Kích thước tính bằng bytes
 * @returns {string} Kích thước đã định dạng
 */
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1048576) return Math.round(bytes / 1024) + ' KB';
    else return Math.round(bytes / 1048576 * 10) / 10 + ' MB';
}