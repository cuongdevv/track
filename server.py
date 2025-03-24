from fastapi import FastAPI, Depends, HTTPException, Request, status, Form, Response, Cookie
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
import pymongo
from pymongo import MongoClient
from datetime import datetime
import os
from pydantic import BaseModel
from typing import List, Optional, Dict, Any, Union
import json
from dotenv import load_dotenv
import uvicorn
import secrets

# Load environment variables
load_dotenv()

# FastAPI app
app = FastAPI(title="Arise Crossover Stats Tracker", 
              description="API for tracking Arise Crossover player stats",
              version="1.0.0",
              root_path="/robloxtrackstat")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "http://localhost:8080",
        "https://trackstat-production.up.railway.app",
        "https://stats.hopeogame.online",
        "*"  # Allow all origins in development
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB connection setup
# Get MongoDB URI from environment variable or use a default Atlas URI
DEFAULT_MONGO_URI = "mongodb+srv://cuong:cuong17102006@trackstat.5kn8k.mongodb.net/?retryWrites=true&w=majority&appName=trackstat"
MONGO_URI = os.environ.get("MONGO_URI", DEFAULT_MONGO_URI)

# Print the MongoDB URI being used (redacted for security)
if MONGO_URI.startswith("mongodb+srv://"):
    print(f"Using MongoDB Atlas connection")
else:
    print(f"Using MongoDB connection: {MONGO_URI}")

# Connection with timeout settings for better reliability
try:
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    db = client["arise_crossover"]  # Database specific to Arise Crossover game
    stats_collection = db["player_stats"]  # Collection for all player stats
    print("MongoDB connection initialized")
except Exception as e:
    print(f"Warning: MongoDB connection initialization failed: {e}")
    print("The application will attempt to connect when needed")

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
    timestamp: Optional[datetime] = None

# Simple in-memory user database - consider replacing with a proper database
USERS = {
    "hopeo": {
        "password": "hopeo123",
        "name": "Hồ"
    }
}

# Simple session management
sessions = {}

@app.get("/")
async def root():
    """API root endpoint."""
    return {
        "message": "Welcome to Arise Crossover Stats Tracker API",
        "documentation": "/docs",
        "version": "1.0.0"
    }

# API security - require authentication for API routes
def get_api_key(request: Request):
    """Get the API key from the request headers"""
    api_key = request.headers.get("X-API-Key")
    if not api_key or api_key not in USERS:
        return None
    return api_key

@app.post("/ac_stats")
async def update_stats(stats_data: dict):
    """Update player stats from game."""
    try:
        # Print raw received data for debugging
        print(f"Received raw data: {stats_data}")
        
        # Validate required fields
        required_fields = ["PlayerName", "Cash", "Gems", "PetCount", "PetsList", "ItemsList"]
        for field in required_fields:
            if field not in stats_data:
                print(f"❌ Missing required field: {field}")
                return {"success": False, "error": f"Missing required field: {field}"}
                
        # Add timestamp if not provided
        if "timestamp" not in stats_data:
            stats_data["timestamp"] = datetime.utcnow()
        
        # Print debugging information
        print(f"Processing stats from player: {stats_data['PlayerName']}")
        print(f"Cash: {stats_data['Cash']}, Gems: {stats_data['Gems']}, Pets: {stats_data['PetCount']}")
        print(f"Items: {[item['Name'] for item in stats_data['ItemsList'] if 'Name' in item]}")
        
        # Insert into MongoDB
        result = stats_collection.insert_one(stats_data)
        print(f"✅ Inserted document with ID: {result.inserted_id}")
        
        # Update record count
        record_count = stats_collection.count_documents({})
        print(f"✅ Database now has {record_count} records")
        
        return {"success": True, "id": str(result.inserted_id)}
    except Exception as e:
        print(f"❌ Failed to process stats: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}

@app.delete("/api/player/{player_name}", status_code=status.HTTP_200_OK)
async def delete_player(player_name: str, api_key: str = Depends(get_api_key)):
    """Delete all records for a specific player."""
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key"
        )
    
    # Check if player exists
    player_count = stats_collection.count_documents({"PlayerName": player_name})
    
    if player_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Player '{player_name}' not found"
        )
    
    # Delete all records for this player
    result = stats_collection.delete_many({"PlayerName": player_name})
    
    return {
        "success": True, 
        "player": player_name, 
        "deleted_count": result.deleted_count
    }

@app.get("/api/players")
async def get_players(api_key: str = Depends(get_api_key)):
    """Get list of all players."""
    if not api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")
        
    # Get unique player names
    pipeline = [
        {"$group": {"_id": "$PlayerName"}},
        {"$project": {"PlayerName": "$_id", "_id": 0}}
    ]
    players = list(stats_collection.aggregate(pipeline))
    return players

@app.get("/api/player/{player_name}")
async def get_player_stats(player_name: str, limit: int = 10, api_key: str = Depends(get_api_key)):
    """Get stats for a specific player."""
    if not api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")
        
    # Get player stats sorted by timestamp (newest first)
    stats = list(stats_collection.find(
        {"PlayerName": player_name},
        {"_id": 0}
    ).sort("timestamp", pymongo.DESCENDING).limit(limit))
    
    # Convert datetime objects to strings
    for stat in stats:
        if 'timestamp' in stat:
            stat['timestamp'] = stat['timestamp'].isoformat()
    
    return stats

@app.get("/api/latest")
async def get_latest_stats(api_key: str = Depends(get_api_key)):
    """Get latest stats for all players."""
    if not api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")
    
    # Debug info
    record_count = stats_collection.count_documents({})
    print(f"API /api/latest called - DB has {record_count} records total")
    
    try:
        # Check MongoDB connection first
        try:
            client.admin.command('ping')
            print("✅ MongoDB connection is active")
        except Exception as db_error:
            print(f"❌ MongoDB connection error in /api/latest: {str(db_error)}")
            return JSONResponse(
                status_code=500,
                content={"error": "Database connection error", "detail": str(db_error)}
            )
            
        pipeline = [
            {"$sort": {"timestamp": -1}},
            {"$group": {
                "_id": "$PlayerName",
                "latest": {"$first": "$$ROOT"}
            }},
            {"$replaceRoot": {"newRoot": "$latest"}},
            {"$project": {"_id": 0}}
        ]
        
        latest_stats = list(stats_collection.aggregate(pipeline))
        print(f"API /api/latest returned {len(latest_stats)} player records")
        
        # If we have data, print some sample information
        if latest_stats:
            sample_player = latest_stats[0]['PlayerName'] if 'PlayerName' in latest_stats[0] else 'Unknown'
            print(f"✅ Sample player from results: {sample_player}")
            
            # Check if Items data exists in the first record
            if 'ItemsList' in latest_stats[0] and latest_stats[0]['ItemsList']:
                print(f"✅ Sample items: {latest_stats[0]['ItemsList']}")
        
        # Convert datetime objects to strings
        for stat in latest_stats:
            if 'timestamp' in stat:
                stat['timestamp'] = stat['timestamp'].isoformat()
        
        return latest_stats
    except Exception as e:
        # Log the error
        print(f"❌ Error in get_latest_stats: {str(e)}")
        import traceback
        traceback.print_exc()
        # Return error response
        return JSONResponse(
            status_code=500,
            content={"error": "Database error", "detail": str(e)}
        )

if __name__ == "__main__":
    # Check MongoDB connection
    try:
        client.admin.command('ping')
        print("✅ MongoDB connection successful")
        
        # Check data in MongoDB
        record_count = stats_collection.count_documents({})
        print(f"✅ Found {record_count} records in database")
        
        # Show a sample record if available
        if record_count > 0:
            sample = stats_collection.find_one({})
            print(f"✅ Sample player: {sample.get('PlayerName', 'Unknown')}")
    except Exception as e:
        print(f"❌ MongoDB connection failed: {e}")
        print("Please make sure MongoDB is running")
        exit(1)

    # Run the server
    port = int(os.environ.get("PORT", 8080))
    print(f"✅ Server starting at http://localhost:{port}")
    print(f"✅ API documentation available at http://localhost:{port}/docs")
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=True)
