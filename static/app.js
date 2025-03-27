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

// Biến lưu trạng thái filter
const filterState = {
    isActive: false,
    serverSideFiltering: false, // Trạng thái lọc từ phía server
    cashMin: 0,
    cashMax: Infinity,
    gemsMin: 0,
    gemsMax: Infinity,
    ticketsMin: 0,
    ticketsMax: Infinity,
    sPetsMin: 0,
    ssPetsMin: 0,
    gamepassMin: 0,
    gamepassMax: Infinity
};

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
                <span class="me-2 items-per-page-label">Items per page:</span>
                <select id="itemsPerPageSelect" class="form-select form-select-sm">
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
                    <th class="sortable text-center" data-sort="Gamepass">Gamepasses <i class="bi bi-arrow-down-up"></i></th>
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

                // Tải dữ liệu mới khi chuyển trang
                await fetchLatestStats(false);
                
                // Áp dụng lại filter nếu có
                if (filterState.isActive) {
                    // Lọc dữ liệu với filter đã lưu
                    filteredData = currentData.filter(player => {
                        // Lọc theo Cash
                        const cash = Number(player.Cash) || 0;
                        if (cash < filterState.cashMin || cash > filterState.cashMax) return false;
                        
                        // Lọc theo Gems
                        const gems = Number(player.Gems) || 0;
                        if (gems < filterState.gemsMin || gems > filterState.gemsMax) return false;
                        
                        // Lọc theo Tickets
                        const ticketItem = player.ItemsList ? player.ItemsList.find(item => item.Name === 'Ticket') : null;
                        const tickets = ticketItem ? Number(ticketItem.Amount) : 0;
                        if (tickets < filterState.ticketsMin || tickets > filterState.ticketsMax) return false;
                        
                        // Lọc theo S Pets
                        const sPets = player.PetsList ? player.PetsList.filter(pet => pet.Rank === 'S').length : 0;
                        if (sPets < filterState.sPetsMin) return false;
                        
                        // Lọc theo SS/G Pets
                        const ssPets = player.PetsList ? player.PetsList.filter(pet => 
                            pet.Rank === 'SS' || pet.Rank === 'G'
                        ).length : 0;
                        if (ssPets < filterState.ssPetsMin) return false;
                        
                        // Lọc theo số lượng Gamepass
                        const gamepassCount = player.PassesList ? player.PassesList.length : 0;
                        if (gamepassCount < filterState.gamepassMin || gamepassCount > filterState.gamepassMax) return false;
                        
                        return true;
                    });
                    
                    // Cập nhật UI với dữ liệu đã lọc
                    await createPlayersTable(filteredData);
                    
                    // Hiển thị thông báo filter đang hoạt động
                    showFilterActiveMessage();
                }

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

    // Tạo key cache bao gồm cả tham số tìm kiếm và filter status
    let cacheKeyFilters = '';
    if (filterState.isActive && filterState.serverSideFiltering) {
        cacheKeyFilters = `_cash_${filterState.cashMin}_${filterState.cashMax}`
            + `_gems_${filterState.gemsMin}_${filterState.gemsMax}`
            + `_tickets_${filterState.ticketsMin}_${filterState.ticketsMax}`
            + `_spets_${filterState.sPetsMin}_sspets_${filterState.ssPetsMin}`
            + `_gamepass_${filterState.gamepassMin}_${filterState.gamepassMax}`;
    }
    
    const CACHE_KEY = `latest_stats_page_${pagination.currentPage}_size_${pagination.itemsPerPage}_search_${searchTerm || 'none'}${cacheKeyFilters}`;

    // Tránh tải đồng thời nhiều lần
    if (isLoadingData) {
        console.log('Đang tải dữ liệu, bỏ qua yêu cầu mới...');
        return;
    }

    isLoadingData = true;
    console.log(`Fetching data - Page: ${pagination.currentPage}, Items per page: ${pagination.itemsPerPage}, Search: "${searchTerm || 'none'}", Filters active: ${filterState.isActive}`);

    // Hiển thị loading state
    const container = document.getElementById('playersContainer');

    // Kiểm tra cache trước khi hiển thị loading nếu không phải force refresh
    if (!forceRefresh) {
        const cachedData = CacheManager.getCache(CACHE_KEY);
        if (cachedData) {
            console.log(`🗄️ Using cached data for page ${pagination.currentPage} with search "${searchTerm || 'none'}" and filters: ${filterState.isActive}`);

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
        
        // Thêm các tham số filter nếu filter đang hoạt động và sử dụng server-side filtering
        if (filterState.isActive && filterState.serverSideFiltering) {
            // Chỉ thêm tham số nếu giá trị khác giá trị mặc định
            if (filterState.cashMin > 0) {
                apiUrl += `&cash_min=${filterState.cashMin}`;
            }
            if (filterState.cashMax < Infinity) {
                apiUrl += `&cash_max=${filterState.cashMax}`;
            }
            
            if (filterState.gemsMin > 0) {
                apiUrl += `&gems_min=${filterState.gemsMin}`;
            }
            if (filterState.gemsMax < Infinity) {
                apiUrl += `&gems_max=${filterState.gemsMax}`;
            }
            
            if (filterState.ticketsMin > 0) {
                apiUrl += `&tickets_min=${filterState.ticketsMin}`;
            }
            if (filterState.ticketsMax < Infinity) {
                apiUrl += `&tickets_max=${filterState.ticketsMax}`;
            }
            
            if (filterState.sPetsMin > 0) {
                apiUrl += `&s_pets_min=${filterState.sPetsMin}`;
            }
            if (filterState.ssPetsMin > 0) {
                apiUrl += `&ss_pets_min=${filterState.ssPetsMin}`;
            }
            
            if (filterState.gamepassMin > 0) {
                apiUrl += `&gamepass_min=${filterState.gamepassMin}`;
            }
            if (filterState.gamepassMax < Infinity) {
                apiUrl += `&gamepass_max=${filterState.gamepassMax}`;
            }
            
            console.log('Đang áp dụng filter từ phía server');
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
        } else if (field === 'Gamepass') {
            valA = a.PassesList ? a.PassesList.length : 0;
            valB = b.PassesList ? b.PassesList.length : 0;
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
async function filterData() {
    const searchTerm = document.getElementById('searchInput').value.trim().toLowerCase();
    
    // Reset phân trang về trang 1 khi tìm kiếm
    pagination.currentPage = 1;

    // Sử dụng debounce để tránh gửi quá nhiều request
    clearTimeout(window.filterTimeout);

    window.filterTimeout = setTimeout(async () => {
        // Nếu đang tải dữ liệu, bỏ qua
        if (isLoadingData) return;

        console.log(`Đang thực hiện tìm kiếm: "${searchTerm}"`);

        // Luôn lọc từ toàn bộ dữ liệu gốc, không chỉ từ trang hiện tại
        if (!searchTerm) {
            // Nếu không có từ khóa tìm kiếm, hiển thị tất cả dữ liệu
            filteredData = [...currentData];
        } else {
            // Lọc dữ liệu dựa trên tên người chơi và gamepass
            filteredData = currentData.filter(player => {
                const nameMatch = player.PlayerName.toLowerCase().includes(searchTerm);
                const gamepassMatch = player.PassesList && player.PassesList.some(pass => 
                    pass.Name.toLowerCase().includes(searchTerm)
                );
                return nameMatch || gamepassMatch;
            });
        }

        // Áp dụng bộ lọc min/max nếu có
        filteredData = applyMinMaxFilters(filteredData);
        
        // Reset trang về 1 khi áp dụng filter
        pagination.currentPage = 1;

        // Cập nhật UI với toàn bộ dữ liệu đã lọc
        await createPlayersTable(filteredData);
    }, 500);
}

/**
 * Áp dụng bộ lọc min/max cho dữ liệu người chơi
 * @param {Array} data - Mảng dữ liệu người chơi sau khi đã lọc theo từ khóa tìm kiếm
 * @returns {Array} Dữ liệu sau khi áp dụng bộ lọc min/max
 */
function applyMinMaxFilters(data) {
    // Lấy giá trị từ các trường lọc nếu chưa có trong filterState
    if (!filterState.isActive) {
        // Đọc giá trị từ các trường input
        filterState.cashMin = Number(document.getElementById('cashMin').value) || 0;
        filterState.cashMax = document.getElementById('cashMax').value ? Number(document.getElementById('cashMax').value) : Infinity;
        
        filterState.gemsMin = Number(document.getElementById('gemsMin').value) || 0;
        filterState.gemsMax = document.getElementById('gemsMax').value ? Number(document.getElementById('gemsMax').value) : Infinity;
        
        filterState.ticketsMin = Number(document.getElementById('ticketsMin').value) || 0;
        filterState.ticketsMax = document.getElementById('ticketsMax').value ? Number(document.getElementById('ticketsMax').value) : Infinity;
        
        filterState.sPetsMin = Number(document.getElementById('sPetsMin').value) || 0;
        filterState.ssPetsMin = Number(document.getElementById('ssPetsMin').value) || 0;
        
        // Lấy giá trị bộ lọc gamepass
        filterState.gamepassMin = Number(document.getElementById('gamepassMin').value) || 0;
        filterState.gamepassMax = document.getElementById('gamepassMax').value ? Number(document.getElementById('gamepassMax').value) : Infinity;
    }
    
    // Kiểm tra xem có bộ lọc nào được áp dụng không
    const hasFilters = filterState.cashMin > 0 || filterState.cashMax < Infinity || 
                     filterState.gemsMin > 0 || filterState.gemsMax < Infinity || 
                     filterState.ticketsMin > 0 || filterState.ticketsMax < Infinity || 
                     filterState.sPetsMin > 0 || filterState.ssPetsMin > 0 ||
                     filterState.gamepassMin > 0 || filterState.gamepassMax < Infinity;
    
    // Cập nhật trạng thái lọc
    filterState.isActive = hasFilters;
    
    // Cập nhật trạng thái hiển thị cho indicator trạng thái lọc
    updateFilterIndicator(hasFilters);
    
    // Đồng bộ UI với trạng thái filter
    if (hasFilters) {
        syncFilterUIWithState();
    }
    
    // Nếu không có bộ lọc nào được áp dụng, trả về dữ liệu nguyên bản
    if (!hasFilters) return data;
    
    console.log('Áp dụng bộ lọc min/max:', {
        cash: [filterState.cashMin, filterState.cashMax],
        gems: [filterState.gemsMin, filterState.gemsMax],
        tickets: [filterState.ticketsMin, filterState.ticketsMax],
        pets: { S: filterState.sPetsMin, SS: filterState.ssPetsMin },
        gamepasses: [filterState.gamepassMin, filterState.gamepassMax]
    });
    
    // Lọc dữ liệu theo điều kiện min/max
    return data.filter(player => {
        // Lọc theo Cash
        const cash = Number(player.Cash) || 0;
        if (cash < filterState.cashMin || cash > filterState.cashMax) return false;
        
        // Lọc theo Gems
        const gems = Number(player.Gems) || 0;
        if (gems < filterState.gemsMin || gems > filterState.gemsMax) return false;
        
        // Lọc theo Tickets
        const ticketItem = player.ItemsList ? player.ItemsList.find(item => item.Name === 'Ticket') : null;
        const tickets = ticketItem ? Number(ticketItem.Amount) : 0;
        if (tickets < filterState.ticketsMin || tickets > filterState.ticketsMax) return false;
        
        // Lọc theo S Pets
        const sPets = player.PetsList ? player.PetsList.filter(pet => pet.Rank === 'S').length : 0;
        if (sPets < filterState.sPetsMin) return false;
        
        // Lọc theo SS/G Pets
        const ssPets = player.PetsList ? player.PetsList.filter(pet => 
            pet.Rank === 'SS' || pet.Rank === 'G'
        ).length : 0;
        if (ssPets < filterState.ssPetsMin) return false;
        
        // Lọc theo số lượng Gamepass
        const gamepassCount = player.PassesList ? player.PassesList.length : 0;
        if (gamepassCount < filterState.gamepassMin || gamepassCount > filterState.gamepassMax) return false;
        
        // Nếu vượt qua tất cả bộ lọc, giữ lại người chơi này
        return true;
    });
}

/**
 * Đồng bộ UI với trạng thái filter
 */
function syncFilterUIWithState() {
    if (filterState.cashMin > 0) document.getElementById('cashMin').value = filterState.cashMin;
    if (filterState.cashMax < Infinity) document.getElementById('cashMax').value = filterState.cashMax;
    
    if (filterState.gemsMin > 0) document.getElementById('gemsMin').value = filterState.gemsMin;
    if (filterState.gemsMax < Infinity) document.getElementById('gemsMax').value = filterState.gemsMax;
    
    if (filterState.ticketsMin > 0) document.getElementById('ticketsMin').value = filterState.ticketsMin;
    if (filterState.ticketsMax < Infinity) document.getElementById('ticketsMax').value = filterState.ticketsMax;
    
    if (filterState.sPetsMin > 0) document.getElementById('sPetsMin').value = filterState.sPetsMin;
    if (filterState.ssPetsMin > 0) document.getElementById('ssPetsMin').value = filterState.ssPetsMin;
    
    if (filterState.gamepassMin > 0) document.getElementById('gamepassMin').value = filterState.gamepassMin;
    if (filterState.gamepassMax < Infinity) document.getElementById('gamepassMax').value = filterState.gamepassMax;
}

/**
 * Cập nhật indicator hiển thị khi có bộ lọc được áp dụng
 * @param {boolean} hasFilters - Có bộ lọc được áp dụng hay không
 */
function updateFilterIndicator(hasFilters) {
    const filterCardHeader = document.querySelector('.filter-card .card-header h5');
    
    // Xóa indicator cũ nếu có
    const existingBadge = filterCardHeader ? filterCardHeader.querySelector('.filter-active-badge') : null;
    if (existingBadge) {
        existingBadge.remove();
    }
    
    if (hasFilters && filterCardHeader) {
        // Thêm badge cho trạng thái có bộ lọc
        const badge = document.createElement('span');
        badge.className = 'badge bg-primary ms-2 filter-active-badge';
        badge.textContent = 'Active';
        badge.style.fontSize = '0.7rem';
        filterCardHeader.appendChild(badge);
    }
}

/**
 * Thiết lập bảng lọc với các điều khiển min/max
 */
async function setupFilterTable() {
    console.log('Thiết lập bảng lọc min/max');
    
    // Khởi tạo tooltips cho icons
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.forEach(tooltipTriggerEl => {
        new bootstrap.Tooltip(tooltipTriggerEl, {
            boundary: document.body
        });
    });
    
    // Xử lý hiển thị/ẩn bảng lọc
    const toggleFilterBtn = document.getElementById('toggleFilterBtn');
    const filterCardBody = document.getElementById('filterCardBody');
    
    if (toggleFilterBtn && filterCardBody) {
        toggleFilterBtn.addEventListener('click', function() {
            const isCollapsed = filterCardBody.classList.contains('d-none');
            
            if (isCollapsed) {
                // Mở rộng
                filterCardBody.classList.remove('d-none');
                toggleFilterBtn.innerHTML = '<i class="bi bi-chevron-up"></i>';
                
                // Animation
                filterCardBody.style.opacity = '0';
                filterCardBody.style.maxHeight = '0';
                
                setTimeout(() => {
                    filterCardBody.style.transition = 'opacity 0.3s, max-height 0.3s';
                    filterCardBody.style.opacity = '1';
                    filterCardBody.style.maxHeight = '500px';
                }, 10);
            } else {
                // Thu gọn
                filterCardBody.style.opacity = '0';
                filterCardBody.style.maxHeight = '0';
                
                setTimeout(() => {
                    filterCardBody.classList.add('d-none');
                    toggleFilterBtn.innerHTML = '<i class="bi bi-chevron-down"></i>';
                }, 300);
            }
        });
    }
    
    // Nút áp dụng bộ lọc
    const applyFilterBtn = document.getElementById('applyFilterBtn');
    if (applyFilterBtn) {
        applyFilterBtn.addEventListener('click', async function() {
            // Lưu trạng thái filter vào biến global
            filterState.cashMin = Number(document.getElementById('cashMin').value) || 0;
            filterState.cashMax = document.getElementById('cashMax').value ? Number(document.getElementById('cashMax').value) : Infinity;
            
            filterState.gemsMin = Number(document.getElementById('gemsMin').value) || 0;
            filterState.gemsMax = document.getElementById('gemsMax').value ? Number(document.getElementById('gemsMax').value) : Infinity;
            
            filterState.ticketsMin = Number(document.getElementById('ticketsMin').value) || 0;
            filterState.ticketsMax = document.getElementById('ticketsMax').value ? Number(document.getElementById('ticketsMax').value) : Infinity;
            
            filterState.sPetsMin = Number(document.getElementById('sPetsMin').value) || 0;
            filterState.ssPetsMin = Number(document.getElementById('ssPetsMin').value) || 0;
            
            filterState.gamepassMin = Number(document.getElementById('gamepassMin').value) || 0;
            filterState.gamepassMax = document.getElementById('gamepassMax').value ? Number(document.getElementById('gamepassMax').value) : Infinity;
            
            // Đánh dấu filter đang hoạt động
            filterState.isActive = true;
            
            // Reset về trang 1
            pagination.currentPage = 1;
            
            // Đánh dấu lọc máy chủ đang được sử dụng
            filterState.serverSideFiltering = true;
            
            // Gọi hàm tải dữ liệu từ server với các tham số lọc
            await fetchLatestStats(true); // Force refresh để bỏ qua cache
            
            // Hiển thị thông báo filter đang hoạt động
            showFilterActiveMessage();
        });
    }
    
    // Nút reset bộ lọc
    const resetFilterBtn = document.getElementById('resetFilterBtn');
    if (resetFilterBtn) {
        resetFilterBtn.addEventListener('click', function() {
            // Reset tất cả các trường input
            document.querySelectorAll('.filter-input').forEach(input => {
                input.value = '';
            });
            
            // Reset biến lưu trạng thái filter
            filterState.isActive = false;
            filterState.serverSideFiltering = false;
            filterState.cashMin = 0;
            filterState.cashMax = Infinity;
            filterState.gemsMin = 0;
            filterState.gemsMax = Infinity;
            filterState.ticketsMin = 0;
            filterState.ticketsMax = Infinity;
            filterState.sPetsMin = 0;
            filterState.ssPetsMin = 0;
            filterState.gamepassMin = 0;
            filterState.gamepassMax = Infinity;
            
            // Xóa indicator
            updateFilterIndicator(false);
            
            // Xóa thông báo filter results nếu có
            const existingAlert = document.querySelector('.filter-results-alert');
            if (existingAlert) {
                existingAlert.remove();
            }
            
            // Tải lại dữ liệu từ server không có filter
            pagination.currentPage = 1;
            fetchLatestStats(true);
        });
    }
    
    // Xử lý phím Enter trong các trường lọc
    document.querySelectorAll('.filter-input').forEach(input => {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                applyFilterBtn.click();
            }
        });
    });
    
    return Promise.resolve();
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
    
    // Thu gọn bảng lọc lúc khởi đầu
    const filterCardBody = document.getElementById('filterCardBody');
    const toggleFilterBtn = document.getElementById('toggleFilterBtn');
    if (filterCardBody && toggleFilterBtn) {
        filterCardBody.classList.add('d-none');
        toggleFilterBtn.innerHTML = '<i class="bi bi-chevron-down"></i>';
    }
    
    // Thiết lập tất cả các sự kiện song song bằng Promise.all
    await Promise.all([
        setupSearchInput(),
        setupRefreshButton(),
        setupDeleteButton(),
        setupFilterTable(),
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
    const clearButton = document.getElementById('search-clear-btn');
    
    if (searchInput) {
        // Thêm indicator tìm kiếm
        const inputGroup = searchInput.parentElement;
        if (inputGroup && !inputGroup.querySelector('.spinner-border')) {
            const spinner = document.createElement('div');
            spinner.className = 'spinner-border spinner-border-sm text-secondary d-none';
            spinner.style.position = 'absolute';
            spinner.style.right = '40px';
            spinner.style.top = '50%';
            spinner.style.transform = 'translateY(-50%)';
            spinner.setAttribute('role', 'status');
            spinner.innerHTML = '<span class="visually-hidden">Đang tìm kiếm...</span>';
            inputGroup.appendChild(spinner);
        }

        // Gắn sự kiện input để tìm kiếm khi gõ
        searchInput.addEventListener('input', () => {
            // Hiển thị/ẩn nút xóa dựa trên giá trị input
            if (searchInput.value.trim()) {
                clearButton.classList.remove('d-none');
            } else {
                clearButton.classList.add('d-none');
            }
            
            filterData();
        });

        // Xử lý phím Enter
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                filterData();
            }
        });

        // Xử lý nút xóa tìm kiếm
        if (clearButton) {
            clearButton.addEventListener('click', () => {
                searchInput.value = '';
                clearButton.classList.add('d-none');
                filterData();
                searchInput.focus();
            });
        }
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
                
                // Hiển thị modal qua Bootstrap API
                const gamepassModal = new bootstrap.Modal(document.getElementById('gamepassModal'));
                gamepassModal.show();
            });
            resolve();
        });
    });

    // Thêm sự kiện đóng modal
    const gamepassModal = document.getElementById('gamepassModal');
    if (gamepassModal) {
        // Xử lý nút close
        const closeButton = gamepassModal.querySelector('.btn-close');
        if (closeButton) {
            closeButton.addEventListener('click', function() {
                const modal = bootstrap.Modal.getInstance(gamepassModal);
                if (modal) {
                    modal.hide();
                    removeBackdrop();
                }
            });
        }
        
        // Xử lý backdrop click
        gamepassModal.addEventListener('click', function(e) {
            if (e.target === gamepassModal) {
                const modal = bootstrap.Modal.getInstance(gamepassModal);
                if (modal) {
                    modal.hide();
                    removeBackdrop();
                }
            }
        });
        
        // Xử lý nút Close ở footer
        const closeModalBtn = gamepassModal.querySelector('.modal-footer .btn-secondary');
        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', function() {
                const modal = bootstrap.Modal.getInstance(gamepassModal);
                if (modal) {
                    modal.hide();
                    removeBackdrop();
                }
            });
        }
        
        // Thêm sự kiện khi modal đóng hoàn toàn
        gamepassModal.addEventListener('hidden.bs.modal', function() {
            removeBackdrop();
        });
    }
    
    // Hàm xóa modal backdrop
    function removeBackdrop() {
        const backdrops = document.querySelectorAll('.modal-backdrop');
        backdrops.forEach(backdrop => {
            backdrop.remove();
        });
        // Đảm bảo body không còn class modal-open
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
    }

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
 * Hiển thị thông báo về filter đang hoạt động
 */
function showFilterActiveMessage() {
    if (!filterState.isActive) return;
    
    const container = document.getElementById('playersContainer');
    if (!container) return;
    
    // Lấy phần tử hiển thị thông báo filter trước đó nếu có
    const existingAlert = container.querySelector('.filter-results-alert');
    if (existingAlert) {
        existingAlert.remove();
    }
    
    // Tạo mô tả về các bộ lọc đã áp dụng
    const filterDescriptions = [];
    
    if (filterState.cashMin > 0 || filterState.cashMax < Infinity) {
        let cashDesc = 'Cash: ';
        if (filterState.cashMin > 0 && filterState.cashMax < Infinity) {
            cashDesc += `${formatNumber(filterState.cashMin)} - ${formatNumber(filterState.cashMax)}`;
        } else if (filterState.cashMin > 0) {
            cashDesc += `≥ ${formatNumber(filterState.cashMin)}`;
        } else {
            cashDesc += `≤ ${formatNumber(filterState.cashMax)}`;
        }
        filterDescriptions.push(cashDesc);
    }
    
    if (filterState.gemsMin > 0 || filterState.gemsMax < Infinity) {
        let gemsDesc = 'Gems: ';
        if (filterState.gemsMin > 0 && filterState.gemsMax < Infinity) {
            gemsDesc += `${formatNumber(filterState.gemsMin)} - ${formatNumber(filterState.gemsMax)}`;
        } else if (filterState.gemsMin > 0) {
            gemsDesc += `≥ ${formatNumber(filterState.gemsMin)}`;
        } else {
            gemsDesc += `≤ ${formatNumber(filterState.gemsMax)}`;
        }
        filterDescriptions.push(gemsDesc);
    }
    
    if (filterState.ticketsMin > 0 || filterState.ticketsMax < Infinity) {
        let ticketsDesc = 'Tickets: ';
        if (filterState.ticketsMin > 0 && filterState.ticketsMax < Infinity) {
            ticketsDesc += `${formatNumber(filterState.ticketsMin)} - ${formatNumber(filterState.ticketsMax)}`;
        } else if (filterState.ticketsMin > 0) {
            ticketsDesc += `≥ ${formatNumber(filterState.ticketsMin)}`;
        } else {
            ticketsDesc += `≤ ${formatNumber(filterState.ticketsMax)}`;
        }
        filterDescriptions.push(ticketsDesc);
    }
    
    if (filterState.sPetsMin > 0) {
        filterDescriptions.push(`S Pets: ≥ ${filterState.sPetsMin}`);
    }
    
    if (filterState.ssPetsMin > 0) {
        filterDescriptions.push(`SS Pets: ≥ ${filterState.ssPetsMin}`);
    }
    
    if (filterState.gamepassMin > 0 || filterState.gamepassMax < Infinity) {
        let gamepassDesc = 'Gamepasses: ';
        if (filterState.gamepassMin > 0 && filterState.gamepassMax < Infinity) {
            gamepassDesc += `${filterState.gamepassMin} - ${filterState.gamepassMax}`;
        } else if (filterState.gamepassMin > 0) {
            gamepassDesc += `≥ ${filterState.gamepassMin}`;
        } else {
            gamepassDesc += `≤ ${filterState.gamepassMax}`;
        }
        filterDescriptions.push(gamepassDesc);
    }
    
    // Tạo thông báo kết quả filter
    const filterAlert = document.createElement('div');
    filterAlert.className = 'alert alert-info mb-3 filter-results-alert';
    
    // Tạo nội dung thông báo
    let alertContent = `
        <div class="d-flex justify-content-between align-items-center">
            <div>
                <i class="bi bi-funnel-fill me-2"></i>
                <strong>Filter applied:</strong> Showing ${filteredData.length} of ${currentData.length} accounts
            </div>
            <button type="button" class="btn-close btn-close-white" aria-label="Close" id="clearFilterBtn"></button>
        </div>
    `;
    
    // Nếu có mô tả filter, thêm chúng vào thông báo
    if (filterDescriptions.length > 0) {
        alertContent += `
            <div class="mt-2">
                <small>Active filters: 
                    <div class="d-flex flex-wrap gap-2 mt-1">
                        ${filterDescriptions.map(desc => `<span class="badge">${desc}</span>`).join('')}
                    </div>
                </small>
            </div>
        `;
    }
    
    filterAlert.innerHTML = alertContent;
    
    // Chèn thông báo vào đầu container (trước bảng)
    const tableElement = container.querySelector('.table-responsive');
    if (tableElement) {
        container.insertBefore(filterAlert, tableElement);
    } else {
        container.prepend(filterAlert);
    }
    
    // Thêm sự kiện cho nút đóng
    const clearFilterBtn = document.getElementById('clearFilterBtn');
    if (clearFilterBtn) {
        clearFilterBtn.addEventListener('click', function() {
            // Kích hoạt nút reset filter
            document.getElementById('resetFilterBtn').click();
        });
    }
}