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
DEFAULT_MONGO_URI = "https://localhost:8080"
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
    search: str = Query(None),
    # Thêm các tham số filter mới
    cash_min: int = Query(None, description="Min Cash value"),
    cash_max: int = Query(None, description="Max Cash value"),
    gems_min: int = Query(None, description="Min Gems value"),
    gems_max: int = Query(None, description="Max Gems value"),
    tickets_min: int = Query(None, description="Min Tickets value"),
    tickets_max: int = Query(None, description="Max Tickets value"),
    s_pets_min: int = Query(None, description="Min S rank pets"),
    ss_pets_min: int = Query(None, description="Min SS rank pets"),
    gamepass_min: int = Query(None, description="Min gamepass count"),
    gamepass_max: int = Query(None, description="Max gamepass count"),
    stats_collection = Depends(get_db)
):
    """Get latest stats for all players with pagination and search."""
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Log filter parameters
    logger.info(f"Get latest stats: page={page}, page_size={page_size}, search={search}, " 
                f"cash_min={cash_min}, cash_max={cash_max}, gems_min={gems_min}, gems_max={gems_max}, "
                f"tickets_min={tickets_min}, tickets_max={tickets_max}, s_pets_min={s_pets_min}, "
                f"ss_pets_min={ss_pets_min}, gamepass_min={gamepass_min}, gamepass_max={gamepass_max}")
    
    # Build cache key with all filter parameters
    filter_params = f"cash_{cash_min}_{cash_max}_gems_{gems_min}_{gems_max}_tickets_{tickets_min}_{tickets_max}_" \
                    f"s_pets_{s_pets_min}_ss_pets_{ss_pets_min}_gamepass_{gamepass_min}_{gamepass_max}"
    cache_key = f"latest_stats_page_{page}_size_{page_size}_search_{search or 'none'}_filter_{filter_params}"
    
    cached_data = cache_get(cache_key)
    if cached_data:
        return cached_data
    
    try:
        # Create base match filter
        match_filter = {}
        
        # Add search filter if provided
        if search:
            match_filter["PlayerName"] = {"$regex": search, "$options": "i"}
        
        # Add filters for numerical fields
        if cash_min is not None or cash_max is not None:
            match_filter["Cash"] = {}
            if cash_min is not None:
                match_filter["Cash"]["$gte"] = cash_min
            if cash_max is not None:
                match_filter["Cash"]["$lte"] = cash_max
                
        if gems_min is not None or gems_max is not None:
            match_filter["Gems"] = {}
            if gems_min is not None:
                match_filter["Gems"]["$gte"] = gems_min
            if gems_max is not None:
                match_filter["Gems"]["$lte"] = gems_max
        
        # We'll use MongoDB aggregation for more complex filters on arrays and nested fields
        
        # Pipeline for counting total records matching the filter
        total_count_pipeline = []
        if match_filter:
            total_count_pipeline.append({"$match": match_filter})
        
        # Additional filter stages for complex filtering will be applied after getting initial data
        # First get all unique players that match basic filters
        total_count_pipeline.extend([
            {"$sort": {"timestamp": -1}},
            {"$group": {"_id": "$PlayerName", "doc": {"$first": "$$ROOT"}}},
            {"$replaceRoot": {"newRoot": "$doc"}}
        ])
        
        # Apply complex filters on tickets, pets, and gamepasses
        if tickets_min is not None or tickets_max is not None:
            ticket_match = {}
            if tickets_min is not None:
                ticket_match["$match"] = {
                    "$expr": {
                        "$gte": [
                            {"$ifNull": [
                                {"$arrayElemAt": [
                                    {"$filter": {
                                        "input": {"$ifNull": ["$ItemsList", []]},
                                        "as": "item",
                                        "cond": {"$eq": ["$$item.Name", "Ticket"]}
                                    }},
                                    0
                                ]}, 
                                {"Amount": 0}
                            ]}.Amount,
                            tickets_min
                        ]
                    }
                }
                total_count_pipeline.append(ticket_match)
            
            if tickets_max is not None:
                ticket_match = {"$match": {
                    "$expr": {
                        "$lte": [
                            {"$ifNull": [
                                {"$arrayElemAt": [
                                    {"$filter": {
                                        "input": {"$ifNull": ["$ItemsList", []]},
                                        "as": "item",
                                        "cond": {"$eq": ["$$item.Name", "Ticket"]}
                                    }},
                                    0
                                ]}, 
                                {"Amount": 0}
                            ]}.Amount,
                            tickets_max
                        ]
                    }
                }}
                total_count_pipeline.append(ticket_match)
        
        # Apply S-rank pets filter
        if s_pets_min is not None:
            s_pet_match = {"$match": {
                "$expr": {
                    "$gte": [
                        {"$size": {
                            "$filter": {
                                "input": {"$ifNull": ["$PetsList", []]},
                                "as": "pet",
                                "cond": {"$eq": ["$$pet.Rank", "S"]}
                            }
                        }},
                        s_pets_min
                    ]
                }
            }}
            total_count_pipeline.append(s_pet_match)
        
        # Apply SS-rank pets filter
        if ss_pets_min is not None:
            ss_pet_match = {"$match": {
                "$expr": {
                    "$gte": [
                        {"$size": {
                            "$filter": {
                                "input": {"$ifNull": ["$PetsList", []]},
                                "as": "pet",
                                "cond": {"$or": [
                                    {"$eq": ["$$pet.Rank", "SS"]},
                                    {"$eq": ["$$pet.Rank", "G"]}
                                ]}
                            }
                        }},
                        ss_pets_min
                    ]
                }
            }}
            total_count_pipeline.append(ss_pet_match)
        
        # Apply gamepass filter
        if gamepass_min is not None or gamepass_max is not None:
            gamepass_match = {"$match": {}}
            expr_conditions = []
            
            if gamepass_min is not None:
                expr_conditions.append({
                    "$gte": [
                        {"$size": {"$ifNull": ["$PassesList", []]}},
                        gamepass_min
                    ]
                })
            
            if gamepass_max is not None:
                expr_conditions.append({
                    "$lte": [
                        {"$size": {"$ifNull": ["$PassesList", []]}},
                        gamepass_max
                    ]
                })
            
            if len(expr_conditions) == 1:
                gamepass_match["$match"]["$expr"] = expr_conditions[0]
            else:
                gamepass_match["$match"]["$expr"] = {"$and": expr_conditions}
            
            total_count_pipeline.append(gamepass_match)
        
        # Count final results
        total_count_pipeline.append({"$count": "count"})
        
        total_count_cursor = stats_collection.aggregate(total_count_pipeline)
        total_count_list = list(total_count_cursor)
        total_count = total_count_list[0]["count"] if total_count_list else 0
        
        # Skip for pagination
        skip = (page - 1) * page_size
        
        # Pipeline for actual data retrieval
        pipeline = []
        
        # Apply basic match filters first
        if match_filter:
            pipeline.append({"$match": match_filter})
        
        # Sort and group to get most recent stats for each player
        pipeline.extend([
            {"$sort": {"timestamp": -1}},
            {"$group": {
                "_id": "$PlayerName",
                "latest": {"$first": "$$ROOT"}
            }},
            {"$replaceRoot": {"newRoot": "$latest"}}
        ])
        
        # Apply complex filters - same as in count pipeline
        if tickets_min is not None or tickets_max is not None:
            if tickets_min is not None:
                ticket_match = {"$match": {
                    "$expr": {
                        "$gte": [
                            {"$ifNull": [
                                {"$arrayElemAt": [
                                    {"$filter": {
                                        "input": {"$ifNull": ["$ItemsList", []]},
                                        "as": "item",
                                        "cond": {"$eq": ["$$item.Name", "Ticket"]}
                                    }},
                                    0
                                ]}, 
                                {"Amount": 0}
                            ]}.Amount,
                            tickets_min
                        ]
                    }
                }}
                pipeline.append(ticket_match)
            
            if tickets_max is not None:
                ticket_match = {"$match": {
                    "$expr": {
                        "$lte": [
                            {"$ifNull": [
                                {"$arrayElemAt": [
                                    {"$filter": {
                                        "input": {"$ifNull": ["$ItemsList", []]},
                                        "as": "item",
                                        "cond": {"$eq": ["$$item.Name", "Ticket"]}
                                    }},
                                    0
                                ]}, 
                                {"Amount": 0}
                            ]}.Amount,
                            tickets_max
                        ]
                    }
                }}
                pipeline.append(ticket_match)
        
        # Apply S-rank pets filter
        if s_pets_min is not None:
            s_pet_match = {"$match": {
                "$expr": {
                    "$gte": [
                        {"$size": {
                            "$filter": {
                                "input": {"$ifNull": ["$PetsList", []]},
                                "as": "pet",
                                "cond": {"$eq": ["$$pet.Rank", "S"]}
                            }
                        }},
                        s_pets_min
                    ]
                }
            }}
            pipeline.append(s_pet_match)
        
        # Apply SS-rank pets filter
        if ss_pets_min is not None:
            ss_pet_match = {"$match": {
                "$expr": {
                    "$gte": [
                        {"$size": {
                            "$filter": {
                                "input": {"$ifNull": ["$PetsList", []]},
                                "as": "pet",
                                "cond": {"$or": [
                                    {"$eq": ["$$pet.Rank", "SS"]},
                                    {"$eq": ["$$pet.Rank", "G"]}
                                ]}
                            }
                        }},
                        ss_pets_min
                    ]
                }
            }}
            pipeline.append(ss_pet_match)
        
        # Apply gamepass filter
        if gamepass_min is not None or gamepass_max is not None:
            gamepass_match = {"$match": {}}
            expr_conditions = []
            
            if gamepass_min is not None:
                expr_conditions.append({
                    "$gte": [
                        {"$size": {"$ifNull": ["$PassesList", []]}},
                        gamepass_min
                    ]
                })
            
            if gamepass_max is not None:
                expr_conditions.append({
                    "$lte": [
                        {"$size": {"$ifNull": ["$PassesList", []]}},
                        gamepass_max
                    ]
                })
            
            if len(expr_conditions) == 1:
                gamepass_match["$match"]["$expr"] = expr_conditions[0]
            else:
                gamepass_match["$match"]["$expr"] = {"$and": expr_conditions}
            
            pipeline.append(gamepass_match)
        
        # Final sorting, pagination and projection
        pipeline.extend([
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
        
        # Prepare response with pagination info and filter parameters
        response = {
            "data": latest_stats,
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total_items": total_count,
                "total_pages": (total_count + page_size - 1) // page_size,
                "search": search or ""
            },
            "filters": {
                "cash_min": cash_min,
                "cash_max": cash_max,
                "gems_min": gems_min,
                "gems_max": gems_max,
                "tickets_min": tickets_min,
                "tickets_max": tickets_max,
                "s_pets_min": s_pets_min,
                "ss_pets_min": ss_pets_min,
                "gamepass_min": gamepass_min,
                "gamepass_max": gamepass_max
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