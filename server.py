from fastapi import FastAPI, Depends, HTTPException, Request, status, Form, Response, Cookie
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.security import HTTPBasic, HTTPBasicCredentials
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
    allow_origins=["*"], # Update this with your public server URL when deployed
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create directories if they don't exist
os.makedirs('templates', exist_ok=True)
os.makedirs('static', exist_ok=True)

# Set up static files and templates
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# MongoDB connection setup
# Get MongoDB URI from environment variable or use a default Atlas URI
# Replace 'your-atlas-connection-string' with your actual MongoDB Atlas connection string
DEFAULT_MONGO_URI = "mongodb://localhost:27017/"
MONGO_URI = os.environ.get("MONGO_URI", DEFAULT_MONGO_URI)

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
    "admin": {
        "password": "admin123",
        "name": "Administrator"
    }
}

# Simple session management
sessions = {}

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """Render the login page."""
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/dashboard", response_class=HTMLResponse)
async def dashboard(request: Request, session: str = Cookie(None)):
    """Render the dashboard page if user is logged in."""
    # Check if session exists and is valid
    if not session or session not in sessions:
        return RedirectResponse(url="/", status_code=303)
    
    return templates.TemplateResponse("dashboard.html", {"request": request})

@app.post("/login")
async def login(request: Request, username: str = Form(...), password: str = Form(...)):
    """Handle login form submission."""
    if username in USERS and USERS[username]["password"] == password:
        # Create a session
        session_token = secrets.token_hex(16)
        sessions[session_token] = {"username": username}
        
        # Create a response with session cookie
        response = RedirectResponse(url="/dashboard", status_code=303)
        response.set_cookie(key="session", value=session_token, httponly=True)
        return response
    else:
        # Return to login page with error as query parameter instead of template context
        return RedirectResponse(url="/?error=Invalid+username+or+password", status_code=303)

@app.get("/logout")
async def logout(session: str = Cookie(None)):
    """Handle user logout."""
    if session and session in sessions:
        del sessions[session]
    
    response = RedirectResponse(url="/", status_code=303)
    response.delete_cookie(key="session")
    return response

@app.post("/ac_stats", status_code=status.HTTP_201_CREATED)
async def update_stats(data: dict):
    """Receive and store player stats from Arise Crossover game."""
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No data provided"
        )
    
    # Add timestamp to the data
    data['timestamp'] = datetime.utcnow()
    
    # Check if player already exists
    player_name = data.get('PlayerName')
    if not player_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="PlayerName is required"
        )
    
    # Find most recent record for player
    existing_record = stats_collection.find_one(
        {"PlayerName": player_name}, 
        sort=[("timestamp", pymongo.DESCENDING)]
    )
    
    if existing_record:
        # Update existing player's latest stats
        result = stats_collection.update_one(
            {"_id": existing_record["_id"]},
            {"$set": data}
        )
        return {"success": True, "updated": True, "id": str(existing_record["_id"])}
    else:
        # Insert new player stats
        result = stats_collection.insert_one(data)
        return {"success": True, "updated": False, "id": str(result.inserted_id)}

@app.delete("/api/player/{player_name}", status_code=status.HTTP_200_OK)
async def delete_player(player_name: str):
    """Delete all records for a specific player."""
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
async def get_players():
    """Get list of all players."""
    # Get unique player names
    pipeline = [
        {"$group": {"_id": "$PlayerName"}},
        {"$project": {"PlayerName": "$_id", "_id": 0}}
    ]
    players = list(stats_collection.aggregate(pipeline))
    return players

@app.get("/api/player/{player_name}")
async def get_player_stats(player_name: str, limit: int = 10):
    """Get stats for a specific player."""
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
async def get_latest_stats():
    """Get latest stats for all players."""
    try:
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
        
        # Convert datetime objects to strings
        for stat in latest_stats:
            if 'timestamp' in stat:
                stat['timestamp'] = stat['timestamp'].isoformat()
        
        return latest_stats
    except Exception as e:
        # Log the error
        print(f"Error in get_latest_stats: {str(e)}")
        # Return error response
        return JSONResponse(
            status_code=500,
            content={"error": "Database error", "detail": str(e)}
        )

if __name__ == "__main__":
    # Check for required files
    if not os.path.exists('templates/index.html'):
        print("❌ Error: templates/index.html not found")
        exit(1)
    
    if not os.path.exists('static/styles.css'):
        print("❌ Error: static/styles.css not found")
        exit(1)
    
    # Check MongoDB connection
    try:
        client.admin.command('ping')
        print("✅ MongoDB connection successful")
    except Exception as e:
        print(f"❌ MongoDB connection failed: {e}")
        print("Please make sure MongoDB is running")
        exit(1)

    # Run the server
    port = int(os.environ.get("PORT", 8080))
    print(f"✅ Server starting at http://localhost:{port}")
    print(f"✅ API documentation available at http://localhost:{port}/docs")
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=True)
