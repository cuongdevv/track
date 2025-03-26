-- Config values directly in the script
local Config = {
    ServerURL = "https://cuonggdev.com", -- Đường dẫn FastAPI server
    TrackingInterval = 300,
    StatsEndpoint = "/ac_stats"
}

-- Uncomment and modify this line to use local development server
-- Config.ServerURL = "http://localhost:8080"

local HttpService = game:GetService("HttpService")

-- Function to format numbers with commas
local function formatNumber(num)
    local formatted = tostring(math.floor(num))
    local groups = {}
    for i = #formatted, 1, -3 do
        local start = math.max(1, i - 2)
        table.insert(groups, 1, formatted:sub(start, i))
    end
    return table.concat(groups, ",")
end

-- Function to send stats to the server
local function sendStatsToServer(statsData)
    local player = game.Players.LocalPlayer
    if not player then return end
    
    -- Clone the data to avoid any reference issues
    local dataToSend = {}
    for key, value in pairs(statsData) do
        if type(value) == "table" then
            dataToSend[key] = {}
            for i, item in ipairs(value) do
                dataToSend[key][i] = {}
                for k, v in pairs(item) do
                    dataToSend[key][i][k] = v
                end
            end
        else
            dataToSend[key] = value
        end
    end
    
    -- Ensure PassesList is properly initialized
    if not dataToSend.PassesList or #dataToSend.PassesList == 0 then
        print("WARNING: PassesList is empty or nil, initializing it")
        dataToSend.PassesList = {}
    end
    
    -- Debug prints for gamepass data
    print("\nFinal data before serialization:")
    print("PassesList type:", type(dataToSend.PassesList))
    print("PassesList length:", #dataToSend.PassesList)
    
    if #dataToSend.PassesList > 0 then
        for i, pass in ipairs(dataToSend.PassesList) do
            print(string.format("  Pass %d: Name=%s, Owned=%s", 
                i, tostring(pass.Name), tostring(pass.Owned)))
        end
    end
    
    -- Convert to JSON
    local jsonPayload
    local success, errorMsg = pcall(function()
        jsonPayload = HttpService:JSONEncode(dataToSend)
    end)
    
    if not success then
        warn("Failed to encode JSON:", errorMsg)
        -- Fallback: Try sending without PassesList if JSON encoding fails
        warn("Trying to send without PassesList...")
        dataToSend.PassesList = {}
        jsonPayload = HttpService:JSONEncode(dataToSend)
    end
    
    -- Debug: In ra JSON payload
    print("\nJSON payload:", jsonPayload)
    
    -- Ensure proper URL formatting with slash
    local fullUrl = Config.ServerURL
    if string.sub(fullUrl, -1) ~= "/" and string.sub(Config.StatsEndpoint, 1, 1) ~= "/" then
        fullUrl = fullUrl .. "/"
    elseif string.sub(fullUrl, -1) == "/" and string.sub(Config.StatsEndpoint, 1, 1) == "/" then
        fullUrl = fullUrl .. string.sub(Config.StatsEndpoint, 2)
    else
        fullUrl = fullUrl .. Config.StatsEndpoint
    end
    
    print("Sending stats to server:", fullUrl)
    
    -- Send to server using request
    local requestSuccess, response = pcall(function()
        return request({
            Url = fullUrl,
            Method = "POST",
            Headers = {
                ["Content-Type"] = "application/json"
            },
            Body = jsonPayload
        })
    end)
    
    if requestSuccess then
        if response then
            print("\nServer response:")
            print("Status code:", response.StatusCode)
            print("Response body:", response.Body)
            
            if response.Success then
                print("✅ Stats sent successfully")
            else
                warn("❌ Request failed")
                warn("Status message:", response.StatusMessage or "Unknown error")
            end
        else
            warn("❌ No response data received")
        end
    else
        warn("❌ Failed to send stats:", tostring(response))
    end
end

-- Function to track stats from the game
local function trackStats()
    local player = game:GetService("Players").LocalPlayer
    if not player then return end
    
    -- Get player name
    local playerName = player.Name
    
    -- Track Cash with proper number formatting
    local cash = 0
    if player.leaderstats and player.leaderstats:FindFirstChild("Cash") then
        cash = player.leaderstats.Cash.Value
    end
    
    -- Convert to integer by removing decimal part
    cash = math.floor(cash)
    
    -- Format the cash number with commas
    local formattedCash = formatNumber(cash)
    
    -- Track Gems using LastNumber attribute
    local gems = 0
    if player.PlayerGui and player.PlayerGui:FindFirstChild("Hud") then
        local gemsLabel = player.PlayerGui.Hud.BottomContainer:FindFirstChild("Gems")
        if gemsLabel and gemsLabel:GetAttribute("LastNumber") then
            gems = gemsLabel:GetAttribute("LastNumber")
        end
    end
    
    -- Format gems with commas
    local formattedGems = formatNumber(gems)
    
    -- Track Items
    local itemsList = {}
    local ticketAmount = 0
    if player.leaderstats and player.leaderstats:FindFirstChild("Inventory") and 
       player.leaderstats.Inventory:FindFirstChild("Items") then
        local itemsFolder = player.leaderstats.Inventory.Items
        
        -- Chỉ lấy thông tin Ticket
        local ticketFolder = itemsFolder:FindFirstChild("Ticket")
        if ticketFolder then
            ticketAmount = ticketFolder:GetAttribute("Amount") or 0
            
            -- Create item info
            local itemInfo = {
                Name = "Ticket",
                Amount = ticketAmount
            }
            
            table.insert(itemsList, itemInfo)
        end
    end
    
    -- Track Gamepasses
    local passesList = {}

    -- Kiểm tra leaderstats và Passes folder
    local leaderstats = player:FindFirstChild("leaderstats")
    if leaderstats then
        local passesFolder = leaderstats:FindFirstChild("Passes")
        if passesFolder then
            print("Found Passes folder")
            
            -- Lấy tất cả attributes
            local attributes = passesFolder:GetAttributes()
            print("Passes attributes:", attributes)
            
            -- Kiểm tra từng attribute
            for name, value in pairs(attributes) do
                print(string.format("Checking pass: %s = %s", name, tostring(value)))
                if value == true or value == "Active" then
                    print("Adding pass to list:", name)
                    table.insert(passesList, {
                        Name = name,
                        Owned = true
                    })
                end
            end
        else
            print("No Passes folder found in leaderstats")
        end
    else
        print("No leaderstats found")
    end

    -- In ra danh sách gamepass cuối cùng
    print("\nFinal PassesList:")
    for i, pass in ipairs(passesList) do
        print(string.format("  %d. %s (Owned: %s)", i, pass.Name, tostring(pass.Owned)))
    end
    
    -- Rank conversion table: number to letter
    local rankMap = {
        [1] = "E",
        [2] = "D",
        [3] = "C",
        [4] = "B",
        [5] = "A",
        [6] = "S",
        [7] = "SS",
        [8] = "G"
    }
    
    -- Track Pets with detailed information
    local petCount = 0
    local petsList = {}
    
    if player.leaderstats and player.leaderstats:FindFirstChild("Inventory") and 
       player.leaderstats.Inventory:FindFirstChild("Pets") then
        local petsFolder = player.leaderstats.Inventory.Pets
        
        for _, petFolder in pairs(petsFolder:GetChildren()) do
            petCount = petCount + 1
            
            -- Get pet attributes
            local petName = petFolder:GetAttribute("Name") or "Unknown"
            local petLevel = petFolder:GetAttribute("Level") or 0
            local petRankNum = petFolder:GetAttribute("Rank") or 1
            
            -- Convert numeric rank to letter rank
            local petRank = rankMap[petRankNum] or ("Rank" .. tostring(petRankNum))
            
            -- If Name attribute is not available, try to extract from folder name
            if petName == "Unknown" then
                petName = petFolder.Name:match("^(%a+)") or petFolder.Name
            end
            
            -- Create pet info string
            local petInfo = {
                Name = petName,
                Level = petLevel,
                Rank = petRank,
                RankNum = petRankNum,
                FolderName = petFolder.Name
            }
            
            table.insert(petsList, petInfo)
        end
        
        -- Sort by rank (highest first), then by level (highest first), then by name
        table.sort(petsList, function(a, b)
            if a.RankNum ~= b.RankNum then
                return a.RankNum > b.RankNum -- Higher rank first
            elseif a.Level ~= b.Level then
                return a.Level > b.Level -- Higher level second
            else
                return a.Name < b.Name -- Alphabetical by name last
            end
        end)
    end
    
    -- Print the stats with timestamp and player name
    local timeString = os.date("%H:%M:%S")
    print("Player: " .. playerName)
    print(timeString .. " Cash: " .. formattedCash)
    print(timeString .. " Gems: " .. formattedGems)
    print(timeString .. " Pets: " .. tostring(petCount))
    
    -- In ra toàn bộ statsData trước khi gửi
    local statsData = {
        PlayerName = playerName,
        Cash = cash,
        FormattedCash = formattedCash,
        Gems = gems,
        FormattedGems = formattedGems,
        PetCount = petCount,
        PetsList = petsList,
        ItemsList = itemsList,
        PassesList = passesList
    }

    print("\nFinal statsData before sending:")
    print("PassesList in statsData:", statsData.PassesList)
    
    -- Đơn giản hóa hàm gửi data lên server
    local jsonData = HttpService:JSONEncode(statsData)
    
    -- Ensure proper URL formatting with slash
    local fullUrl = Config.ServerURL
    if string.sub(fullUrl, -1) ~= "/" and string.sub(Config.StatsEndpoint, 1, 1) ~= "/" then
        fullUrl = fullUrl .. "/"
    elseif string.sub(fullUrl, -1) == "/" and string.sub(Config.StatsEndpoint, 1, 1) == "/" then
        fullUrl = fullUrl .. string.sub(Config.StatsEndpoint, 2)
    else
        fullUrl = fullUrl .. Config.StatsEndpoint
    end
    
    print("Sending stats to server: " .. fullUrl)
    print("JSON data length: " .. string.len(jsonData))
    
    -- Send to server using request
    local success, response = pcall(function()
        return request({
            Url = fullUrl,
            Method = "POST",
            Headers = {
                ["Content-Type"] = "application/json"
            },
            Body = jsonData
        })
    end)
    
    if success then
        if response then
            print("Stats sent successfully. Status code: " .. (response.StatusCode or "N/A"))
            if response.Body then
                print("Response body: " .. response.Body)
            end
        else
            warn("No response data received")
        end
    else
        warn("Failed to send stats: " .. tostring(response))
    end
    
    return statsData
end

-- Call the function periodically to track stats
local function startTracking(interval)
    interval = interval or Config.TrackingInterval -- Default from config
    
    spawn(function()
        while true do
            local stats = trackStats()
            wait(interval)
        end
    end)
end

-- Start tracking when this script runs
startTracking()