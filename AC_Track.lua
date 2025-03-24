-- Config values directly in the script
local Config = {
    ServerURL = "https://trackstat-production.up.railway.app", -- Đường dẫn FastAPI server
    TrackingInterval = 10,
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
    
    -- Convert to JSON
    local jsonPayload = HttpService:JSONEncode(statsData)
    
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
    
    -- Send to server using request (not RequestAsync)
    local success, response = pcall(function()
        return request({
            Url = fullUrl,
            Method = "POST",
            Headers = {
                ["Content-Type"] = "application/json"
            },
            Body = jsonPayload
        })
    end)
    
    if success then
        if response then
            if response.Success then
                print("Stats sent successfully. Status code: " .. (response.StatusCode or "N/A"))
                if response.Body then
                    print("Response body: " .. response.Body)
                end
            else
                warn("Request was sent but failed. Status code: " .. (response.StatusCode or "N/A"))
                warn("Status message: " .. (response.StatusMessage or "Unknown error"))
            end
        else
            warn("No response data received")
        end
    else
        warn("Failed to send stats: " .. tostring(response))
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
    
    -- Format the cash number with commas (group by 3 digits with commas)
    local formattedCash = tostring(cash)
    
    -- Track Gems using LastNumber attribute
    local gems = 0
    if player.PlayerGui and player.PlayerGui:FindFirstChild("Hud") then
        local gemsLabel = player.PlayerGui.Hud.BottomContainer:FindFirstChild("Gems")
        if gemsLabel and gemsLabel:GetAttribute("LastNumber") then
            gems = gemsLabel:GetAttribute("LastNumber")
        end
    end
    
    -- Format gems with commas
    local formattedGems = tostring(gems)
    local gemsGroups = {}
    for i = #formattedGems, 1, -3 do
        local start = math.max(1, i - 2)
        table.insert(gemsGroups, 1, formattedGems:sub(start, i))
    end
    formattedGems = table.concat(gemsGroups, ",")
    
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
    
    -- Print list of items with details
    if #itemsList > 0 then
        print("Items List:")
        for i, itemInfo in ipairs(itemsList) do
            print(string.format("  %d. %s (x%d)", 
                i, 
                itemInfo.Name,
                itemInfo.Amount
            ))
        end
    end
    
    -- Print list of pets with details
    if #petsList > 0 then
        print("Pets List:")
        for i, petInfo in ipairs(petsList) do
            print(string.format("  %d. %s (Lv.%d, Rank %s)", 
                i, 
                petInfo.Name, 
                petInfo.Level, 
                petInfo.Rank
            ))
        end
    end
    
    -- Prepare data to send to server
    local statsData = {
        PlayerName = playerName,
        Cash = cash,
        FormattedCash = formattedCash,
        Gems = gems,
        FormattedGems = formattedGems,
        PetCount = petCount,
        PetsList = petsList,
        ItemsList = itemsList
    }
    
    -- Send data to server
    sendStatsToServer(statsData)
    
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