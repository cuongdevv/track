from fastapi import FastAPI, Depends, HTTPException, Request, status, Form, Response, Cookie, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.security import HTTPBasic, HTTPBasicCredentials
import pymongo
from pymongo import MongoClient, ASCENDING, DESCENDING
from datetime import datetime, timedelta
from pydantic import BaseModel
from typing import List, Optional, Dict, Any, Union
import json
import os
import secrets
import logging
from dotenv import load_dotenv
import uvicorn
from functools import lru_cache

# Thiết lập logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
)
logger = logging.getLogger("arise-crossover")

# Load environment variables
load_dotenv()

# Thiết lập thư mục
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")

# Kiểm tra và tạo thư mục nếu cần
os.makedirs(STATIC_DIR, exist_ok=True)
os.makedirs(TEMPLATES_DIR, exist_ok=True)

# FastAPI app
app = FastAPI(
    title="Arise Crossover Stats Tracker", 
    description="API for tracking Arise Crossover player stats",
    version="2.0.0"
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "http://localhost:8080",
        "https://cuonggdev.com",
        "*"  # Allow all origins in development
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Set up static files and templates
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
templates = Jinja2Templates(directory=TEMPLATES_DIR)

# MongoDB connection setup
DEFAULT_MONGO_URI = "mongodb+srv://cuong:cuong17102006@trackstat.5kn8k.mongodb.net/?retryWrites=true&w=majority&appName=trackstat"
MONGO_URI = os.environ.get("MONGO_URI", DEFAULT_MONGO_URI)
CACHE_EXPIRY = int(os.environ.get("CACHE_EXPIRY", "300"))  # 5 minutes cache by default

# In-memory cache
cache = {}

# Lazy singleton pattern for MongoDB connection
class MongoDBClient:
    _instance = None
    client = None
    db = None
    stats_collection = None
    
    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
            cls._instance._connect()
        return cls._instance
    
    def _connect(self):
        try:
            # Optimized connection with timeout and pool settings
            self.client = MongoClient(
                MONGO_URI, 
                serverSelectionTimeoutMS=5000,
                maxPoolSize=10,
                minPoolSize=1,
                maxIdleTimeMS=45000,
                waitQueueTimeoutMS=5000
            )
            self.db = self.client["arise_crossover"]
            self.stats_collection = self.db["player_stats"]
            
            # Create indexes for better performance
            self._ensure_indexes()
            
            # Test connection
            self.client.admin.command('ping')
            logger.info("MongoDB connection initialized and verified")
        except Exception as e:
            logger.error(f"Failed to connect to MongoDB: {e}")
            self.client = None
            self.db = None
            self.stats_collection = None
            raise
    
    def _ensure_indexes(self):
        """Create necessary indexes if they don't exist"""
        try:
            # Check existing indexes
            existing_indexes = self.stats_collection.index_information()
            
            # Create indexes if they don't exist
            if "PlayerName_1" not in existing_indexes:
                logger.info("Creating index on PlayerName field")
                self.stats_collection.create_index([("PlayerName", ASCENDING)])
            
            if "timestamp_-1" not in existing_indexes:
                logger.info("Creating index on timestamp field")
                self.stats_collection.create_index([("timestamp", DESCENDING)])
            
            # Compound index for queries that filter by player and sort by timestamp
            if "PlayerName_1_timestamp_-1" not in existing_indexes:
                logger.info("Creating compound index on PlayerName and timestamp")
                self.stats_collection.create_index([
                    ("PlayerName", ASCENDING), 
                    ("timestamp", DESCENDING)
                ])
                
            logger.info("MongoDB indexes verified")
        except Exception as e:
            logger.error(f"Failed to create indexes: {e}")
            raise

def get_db():
    """Get MongoDB client instance"""
    db_client = MongoDBClient.get_instance()
    if db_client.stats_collection is None:
        # Try to reconnect
        db_client._connect()
        if db_client.stats_collection is None:
            raise HTTPException(
                status_code=503,
                detail="Database connection unavailable"
            )
    return db_client.stats_collection

# Data models
class ItemInfo(BaseModel):
    Name: str
    Amount: int

class PetInfo(BaseModel):
    Name: str
    Level: int
    Rank: str
    RankNum: int
    FolderName: str

class StatsData(BaseModel):
    PlayerName: str
    Cash: int
    FormattedCash: str
    Gems: int
    FormattedGems: str
    PetCount: int
    PetsList: List[Dict[str, Any]]
    ItemsList: List[Dict[str, Any]]
    PassesList: List[Dict[str, Any]]
    timestamp: Optional[datetime] = None

# Simple in-memory user database
USERS = {
    "hopeo": {
        "password": "hopeo123",
        "name": "Hồ"
    }
}

# Simple session management
sessions = {}

# Server-side cache functions
def cache_get(key):
    """Get data from cache if it exists and is not expired"""
    if key in cache:
        entry = cache[key]
        if datetime.now() < entry['expires']:
            logger.debug(f"Cache hit for {key}")
            return entry['data']
    logger.debug(f"Cache miss for {key}")
    return None

def cache_set(key, data, expiry_seconds=CACHE_EXPIRY):
    """Store data in cache with expiration time"""
    cache[key] = {
        'data': data,
        'expires': datetime.now() + timedelta(seconds=expiry_seconds)
    }
    logger.debug(f"Cached {key} for {expiry_seconds} seconds")

def cache_invalidate(key_prefix=None):
    """Invalidate specific cache entries or all if no prefix provided"""
    global cache
    if key_prefix:
        # Delete keys that start with the prefix
        keys_to_remove = [k for k in cache.keys() if k.startswith(key_prefix)]
        for k in keys_to_remove:
            del cache[k]
        logger.debug(f"Invalidated {len(keys_to_remove)} cache entries with prefix {key_prefix}")
    else:
        # Clear all cache
        cache = {}
        logger.debug("Cleared entire cache")

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """Render the login page."""
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/dashboard", response_class=HTMLResponse)
async def dashboard(request: Request, session: str = Cookie(None), token: str = None):
    """Render the dashboard page if user is logged in."""
    # Check if session exists via cookie or URL token
    valid_session = session if (session and session in sessions) else None
    if not valid_session and token and token in sessions:
        valid_session = token
        
    if not valid_session:
        logger.info("Session not valid, redirecting to login")
        return RedirectResponse(url="/", status_code=303)
    
    logger.info(f"Session valid for user: {sessions[valid_session]['username']}, rendering dashboard")
    
    # Create a response with dashboard HTML
    response = templates.TemplateResponse("dashboard.html", {"request": request})
    
    # If authentication was via token, set the cookie
    if token and token in sessions and session != token:
        response.set_cookie(
            key="session",
            value=token,
            httponly=False,
            secure=request.url.scheme == "https",
            samesite="lax",
            path="/"
        )
    
    return response

@app.post("/login")
async def login(request: Request, username: str = Form(...), password: str = Form(...)):
    """Handle login form submission."""
    logger.info(f"Login attempt: {username}")
    
    if username in USERS and USERS[username]["password"] == password:
        # Create a session
        session_token = secrets.token_hex(16)
        sessions[session_token] = {"username": username}
        logger.info(f"Login successful for user: {username}")
        
        # Redirect to dashboard with token in URL
        return RedirectResponse(url=f"/dashboard?token={session_token}", status_code=303)
    else:
        logger.warning(f"Login failed for user: {username}")
        # Return to login page with error as query parameter
        return RedirectResponse(url="/?error=Invalid+username+or+password", status_code=303)

@app.get("/logout")
async def logout(session: str = Cookie(None)):
    """Handle user logout."""
    if session and session in sessions:
        username = sessions[session]["username"]
        logger.info(f"Logout user: {username}")
        del sessions[session]
    
    response = RedirectResponse(url="/", status_code=303)
    response.delete_cookie(key="session")
    return response

@app.post("/ac_stats")
async def update_stats(stats_data: dict, stats_collection = Depends(get_db)):
    """Update player stats from game."""
    try:
        # Validate required fields
        required_fields = ["PlayerName", "Cash", "Gems", "PetCount", "PetsList", "ItemsList"]
        for field in required_fields:
            if field not in stats_data:
                logger.warning(f"Missing required field: {field}")
                return {"success": False, "error": f"Missing required field: {field}"}
                
        # Add timestamp if not provided
        if "timestamp" not in stats_data:
            stats_data["timestamp"] = datetime.utcnow()
            
        # Ensure PassesList exists and is a list
        if "PassesList" not in stats_data or stats_data["PassesList"] is None:
            logger.info("Initializing empty PassesList")
            stats_data["PassesList"] = []
        
        logger.info(f"Processing stats from player: {stats_data['PlayerName']}")
        
        # Đảm bảo các trường dữ liệu không bị null
        for field in ["PetsList", "ItemsList", "PassesList"]:
            if field not in stats_data or stats_data[field] is None:
                logger.info(f"Fixing null {field}")
                stats_data[field] = []
                
        # Kiểm tra xem người chơi đã tồn tại trong database chưa
        existing_player = stats_collection.find_one({"PlayerName": stats_data["PlayerName"]})
        
        # Nếu người chơi đã tồn tại, update bản ghi hiện có
        if existing_player:
            logger.info(f"Player {stats_data['PlayerName']} already exists, updating record")
            
            # Cập nhật thông tin người chơi
            result = stats_collection.update_one(
                {"PlayerName": stats_data["PlayerName"]},
                {"$set": {
                    "Cash": stats_data["Cash"],
                    "FormattedCash": stats_data["FormattedCash"],
                    "Gems": stats_data["Gems"],
                    "FormattedGems": stats_data["FormattedGems"],
                    "PetCount": stats_data["PetCount"],
                    "PetsList": stats_data["PetsList"],
                    "ItemsList": stats_data["ItemsList"],
                    "PassesList": stats_data["PassesList"],
                    "timestamp": stats_data["timestamp"]
                }}
            )
            
            # Invalidate cache for this player
            cache_invalidate(f"player_{stats_data['PlayerName']}")
            cache_invalidate("latest_stats")
            
            return {
                "success": True, 
                "message": "Player data updated",
                "player": stats_data["PlayerName"]
            }
        
        # Nếu người chơi không tồn tại, thêm mới vào database
        else:
            logger.info(f"Player {stats_data['PlayerName']} is new, adding to database")
            
            # Insert into MongoDB
            result = stats_collection.insert_one(stats_data)
            
            # Invalidate latest stats cache
            cache_invalidate("latest_stats")
            
            return {
                "success": True, 
                "id": str(result.inserted_id),
                "message": "New player added"
            }
    except Exception as e:
        logger.error(f"Failed to process stats: {e}", exc_info=True)
        return {"success": False, "error": str(e)}

# API security - require authentication for all API routes
def get_session_user(session: str = Cookie(None)):
    """Get the user from the session cookie"""
    if not session or session not in sessions:
        return None
    return sessions[session].get("username")

@app.get("/api/players")
async def get_players(username: str = Depends(get_session_user), stats_collection = Depends(get_db)):
    """Get list of all players."""
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
        
    # Check cache first
    cache_key = "player_list"
    cached_data = cache_get(cache_key)
    if cached_data:
        return cached_data
        
    # Get unique player names with projection to reduce data transfer
    pipeline = [
        {"$group": {"_id": "$PlayerName"}},
        {"$project": {"PlayerName": "$_id", "_id": 0}}
    ]
    
    players = list(stats_collection.aggregate(pipeline))
    
    # Cache the results
    cache_set(cache_key, players)
    
    return players

@app.get("/api/player/{player_name}")
async def get_player_stats(
    player_name: str, 
    limit: int = 10, 
    username: str = Depends(get_session_user),
    stats_collection = Depends(get_db)
):
    """Get stats for a specific player."""
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
        
    # Check cache first
    cache_key = f"player_{player_name}_limit_{limit}"
    cached_data = cache_get(cache_key)
    if cached_data:
        return cached_data
        
    # Get player stats sorted by timestamp (newest first)
    stats = list(stats_collection.find(
        {"PlayerName": player_name},
        {"_id": 0}
    ).sort("timestamp", pymongo.DESCENDING).limit(limit))
    
    # Convert datetime objects to strings
    for stat in stats:
        if 'timestamp' in stat:
            stat['timestamp'] = stat['timestamp'].isoformat()
    
    # Cache the results
    cache_set(cache_key, stats)
    
    return stats

@app.get("/api/latest")
async def get_latest_stats(
    username: str = Depends(get_session_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=10, le=200),
    search: str = Query(None),  # Thêm tham số search
    stats_collection = Depends(get_db)
):
    """Get latest stats for all players with pagination and search."""
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Log để debug
    logger.info(f"Get latest stats: page={page}, page_size={page_size}, search={search}")
    
    # Cache key bao gồm cả tham số tìm kiếm
    cache_key = f"latest_stats_page_{page}_size_{page_size}_search_{search or 'none'}"
    cached_data = cache_get(cache_key)
    if cached_data:
        return cached_data
    
    try:
        # Tạo match filter
        match_filter = {}
        if search:
            # Tìm kiếm theo tên người chơi (case insensitive)
            match_filter["PlayerName"] = {"$regex": search, "$options": "i"}
        
        # Đếm tổng số bản ghi phù hợp với điều kiện tìm kiếm
        total_count_pipeline = []
        if search:
            total_count_pipeline.append({"$match": match_filter})
        
        total_count_pipeline.extend([
            {"$group": {"_id": "$PlayerName"}},
            {"$count": "count"}
        ])
        
        total_count_cursor = stats_collection.aggregate(total_count_pipeline)
        total_count_list = list(total_count_cursor)
        total_count = total_count_list[0]["count"] if total_count_list else 0
        
        # Skip cho phân trang
        skip = (page - 1) * page_size
        
        # Pipeline cho aggregation
        pipeline = []
        
        # Thêm bước lọc theo search nếu có
        if search:
            pipeline.append({"$match": match_filter})
        
        # Các bước xử lý khác
        pipeline.extend([
            # Sort by timestamp first (newest first)
            {"$sort": {"timestamp": -1}},
            
            # Group by player name and get the most recent record
            {"$group": {
                "_id": "$PlayerName",
                "latest": {"$first": "$$ROOT"}
            }},
            
            # Replace root with the latest document
            {"$replaceRoot": {"newRoot": "$latest"}},
            
            # Sort results by player name
            {"$sort": {"PlayerName": 1}},
            
            # Skip records for pagination
            {"$skip": skip},
            
            # Limit records per page
            {"$limit": page_size},
            
            # Project only needed fields
            {"$project": {
                "_id": 0,
                "PlayerName": 1,
                "Cash": 1,
                "FormattedCash": 1,
                "Gems": 1,
                "FormattedGems": 1,
                "PetCount": 1,
                "PetsList": 1,
                "ItemsList": 1,
                "PassesList": 1,
                "timestamp": 1
            }}
        ])
        
        latest_stats = list(stats_collection.aggregate(pipeline))
        
        # Convert datetime objects to strings
        for stat in latest_stats:
            if 'timestamp' in stat:
                stat['timestamp'] = stat['timestamp'].isoformat()
        
        # Prepare response with pagination info
        response = {
            "data": latest_stats,
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total_items": total_count,
                "total_pages": (total_count + page_size - 1) // page_size,
                "search": search or ""
            }
        }
        
        # Cache the results
        cache_set(cache_key, response)
        
        return response
    except Exception as e:
        logger.error(f"Error in get_latest_stats: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Database error: {str(e)}"
        )

@app.delete("/api/player/{player_name}", status_code=status.HTTP_200_OK)
async def delete_player(
    player_name: str,
    username: str = Depends(get_session_user),
    stats_collection = Depends(get_db)
):
    """Delete all records for a specific player."""
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
        
    try:
        logger.info(f"DELETE request received for player: {player_name}")
        
        # Check if player exists
        player_count = stats_collection.count_documents({"PlayerName": player_name})
        logger.info(f"Found {player_count} records for player {player_name}")
        
        if player_count == 0:
            logger.warning(f"Player {player_name} not found in database")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Player '{player_name}' not found"
            )
        
        # Delete all records for this player
        result = stats_collection.delete_many({"PlayerName": player_name})
        
        logger.info(f"Deleted {result.deleted_count} records for player {player_name}")
        
        # Verify the player was actually deleted
        remaining = stats_collection.count_documents({"PlayerName": player_name})
        if remaining > 0:
            logger.warning(f"Still found {remaining} records for player {player_name} after deletion attempt")
            # Try again with a forceful approach
            result2 = stats_collection.delete_many({"PlayerName": player_name}, {"w": 1})
            logger.info(f"Second deletion attempt result: {result2.deleted_count} records deleted")
            remaining = stats_collection.count_documents({"PlayerName": player_name})
        
        success = (remaining == 0)
        
        # Invalidate cache
        cache_invalidate(f"player_{player_name}")
        cache_invalidate("latest_stats")
        cache_invalidate("player_list")
        
        return {
            "success": success, 
            "player": player_name, 
            "deleted_count": result.deleted_count,
            "remaining_count": remaining
        }
    except HTTPException:
        raise  # Re-raise HTTP exceptions
    except Exception as e:
        logger.error(f"Error deleting player {player_name}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting player: {str(e)}"
        )

@app.delete("/api/players/batch", status_code=status.HTTP_200_OK)
async def delete_multiple_players(
    player_names: List[str],
    username: str = Depends(get_session_user),
    stats_collection = Depends(get_db)
):
    """Delete multiple players at once."""
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
        
    try:
        logger.info(f"BATCH DELETE request received for {len(player_names)} players")
        
        results = {
            "success": True,
            "total_deleted": 0,
            "player_results": []
        }
        
        for player_name in player_names:
            try:
                # Check if player exists
                player_count = stats_collection.count_documents({"PlayerName": player_name})
                
                if player_count == 0:
                    # Skip non-existent players
                    results["player_results"].append({
                        "player": player_name,
                        "success": False,
                        "deleted_count": 0,
                        "error": "Player not found"
                    })
                    continue
                
                # Delete records for this player
                delete_result = stats_collection.delete_many({"PlayerName": player_name})
                
                # Check if deletion was successful
                remaining = stats_collection.count_documents({"PlayerName": player_name})
                
                if remaining > 0:
                    # Try one more time with write concern
                    retry_result = stats_collection.delete_many({"PlayerName": player_name}, {"w": 1})
                    delete_result.deleted_count += retry_result.deleted_count
                    remaining = stats_collection.count_documents({"PlayerName": player_name})
                
                player_success = remaining == 0
                results["total_deleted"] += delete_result.deleted_count
                
                results["player_results"].append({
                    "player": player_name,
                    "success": player_success,
                    "deleted_count": delete_result.deleted_count,
                    "remaining_count": remaining
                })
                
                if not player_success:
                    results["success"] = False
                
                # Invalidate cache for this player
                cache_invalidate(f"player_{player_name}")
                
            except Exception as e:
                logger.error(f"Error deleting player {player_name}: {str(e)}")
                results["player_results"].append({
                    "player": player_name,
                    "success": False,
                    "error": str(e)
                })
                results["success"] = False
        
        # Invalidate general caches
        cache_invalidate("latest_stats")
        cache_invalidate("player_list")
        
        return results
        
    except Exception as e:
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error in batch delete: {str(e)}"
        )

# Endpoint to manually clear cache
@app.post("/api/cache/clear")
async def clear_cache(username: str = Depends(get_session_user), key_prefix: str = None):
    """Clear the cache, either completely or by prefix"""
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
        
    cache_invalidate(key_prefix)
    return {"success": True, "message": "Cache cleared"}

# Endpoint to get cache status
@app.get("/api/cache/status")
async def cache_status(username: str = Depends(get_session_user)):
    """Get cache status information"""
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
        
    cache_info = {
        "entries": len(cache),
        "keys": list(cache.keys()),
        "expires": {k: v["expires"].isoformat() for k, v in cache.items()},
        "size_estimate": sum(len(str(v["data"])) for v in cache.values())
    }
    
    return cache_info

@app.get("/api/latest/count")
async def get_player_count(username: str = Depends(get_session_user), stats_collection = Depends(get_db)):
    """Get total number of unique players"""
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
        
    # Check cache
    cache_key = "player_count"
    cached_data = cache_get(cache_key)
    if cached_data:
        return cached_data
        
    try:
        # Count unique players
        pipeline = [
            {"$group": {"_id": "$PlayerName"}},
            {"$count": "count"}
        ]
        
        result = list(stats_collection.aggregate(pipeline))
        count = result[0]["count"] if result else 0
        
        response = {"count": count}
        
        # Cache the result
        cache_set(cache_key, response)
        
        return response
    except Exception as e:
        logger.error(f"Error getting player count: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Database error: {str(e)}"
        )

if __name__ == "__main__":
    # Check MongoDB connection
    try:
        db_client = MongoDBClient.get_instance()
        record_count = db_client.stats_collection.count_documents({})
        logger.info(f"Found {record_count} records in database")
        
        # Show a sample record if available
        if record_count > 0:
            sample = db_client.stats_collection.find_one({})
            logger.info(f"Sample player: {sample.get('PlayerName', 'Unknown')}")
    except Exception as e:
        logger.error(f"MongoDB connection failed: {e}")
        logger.error("Please make sure MongoDB is running")
        exit(1)

    # Run the server
    port = int(os.environ.get("PORT", 8080))
    logger.info(f"Server starting at http://localhost:{port}")
    logger.info(f"API documentation available at http://localhost:{port}/docs")
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=True)