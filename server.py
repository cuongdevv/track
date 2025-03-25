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
              root_path="/trackstat")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500",  # Add Live Server URL
        "http://localhost:5500",
        "http://localhost:8080",
        "https://cuonggdev.com",
        "*"  # Allow all origins in development
    ],
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
DEFAULT_MONGO_URI = "https://localhost:8080"
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
    PassesList: List[Dict[str, Any]]
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

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """Render the login page."""
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/dashboard", response_class=HTMLResponse)
async def dashboard(request: Request, session: str = Cookie(None), token: str = None):
    """Render the dashboard page if user is logged in."""
    # Debugging
    print(f"Dashboard request with session cookie: {session}")
    print(f"Dashboard request with URL token: {token}")
    print(f"Available sessions: {list(sessions.keys())}")
    
    # Check if session exists via cookie or URL token
    valid_session = session if (session and session in sessions) else None
    if not valid_session and token and token in sessions:
        valid_session = token
        
    if not valid_session:
        print(f"Session not valid, redirecting to login")
        return RedirectResponse(url="/", status_code=303)
    
    print(f"Session valid, rendering dashboard")
    
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
    print(f"Login attempt: {username}") # Debug log
    
    if username in USERS and USERS[username]["password"] == password:
        # Create a session
        session_token = secrets.token_hex(16)
        sessions[session_token] = {"username": username}
        print(f"Login successful, created session: {session_token[:5]}...") # Debug log (truncate for security)
        
        # Redirect to dashboard with token in URL
        return RedirectResponse(url=f"/dashboard?token={session_token}", status_code=303)
    else:
        print(f"Login failed for user: {username}") # Debug log
        # Return to login page with error as query parameter
        return RedirectResponse(url="/?error=Invalid+username+or+password", status_code=303)

@app.get("/logout")
async def logout(session: str = Cookie(None)):
    """Handle user logout."""
    if session and session in sessions:
        del sessions[session]
    
    response = RedirectResponse(url="/", status_code=303)
    response.delete_cookie(key="session")
    return response

@app.post("/ac_stats")
async def update_stats(stats_data: dict):
    """Update player stats from game."""
    try:
        # Print raw received data for debugging
        print(f"Received raw data: {stats_data}")
        
        # Kiểm tra chi tiết dữ liệu PassesList
        print("PassesList debugging:")
        if "PassesList" in stats_data:
            passes_list = stats_data["PassesList"]
            print(f"  Type: {type(passes_list)}")
            print(f"  Content: {passes_list}")
            if isinstance(passes_list, list):
                print(f"  Length: {len(passes_list)}")
                for i, pass_info in enumerate(passes_list):
                    print(f"  Pass {i+1}: {pass_info}")
        else:
            print("  PassesList not found in stats_data!")
            # Tạo PassesList trống nếu không tồn tại
            stats_data["PassesList"] = []
        
        # Validate required fields
        required_fields = ["PlayerName", "Cash", "Gems", "PetCount", "PetsList", "ItemsList"]
        for field in required_fields:
            if field not in stats_data:
                print(f"❌ Missing required field: {field}")
                return {"success": False, "error": f"Missing required field: {field}"}
                
        # Add timestamp if not provided
        if "timestamp" not in stats_data:
            stats_data["timestamp"] = datetime.utcnow()
            
        # Ensure PassesList exists and is a list
        if "PassesList" not in stats_data or stats_data["PassesList"] is None:
            print("Initializing empty PassesList")
            stats_data["PassesList"] = []
        
        # Print debugging information
        print(f"Processing stats from player: {stats_data['PlayerName']}")
        print(f"Cash: {stats_data['Cash']}, Gems: {stats_data['Gems']}, Pets: {stats_data['PetCount']}")
        print(f"Items: {[item['Name'] for item in stats_data['ItemsList'] if 'Name' in item]}")
        print(f"Gamepasses: {[pass_info.get('Name', 'Unknown') for pass_info in stats_data['PassesList']]}")
        
        # Kiểm tra xem người chơi đã tồn tại trong database chưa
        existing_player = stats_collection.find_one({"PlayerName": stats_data["PlayerName"]})
        
        # Đảm bảo các trường dữ liệu không bị null
        for field in ["PetsList", "ItemsList", "PassesList"]:
            if field not in stats_data or stats_data[field] is None:
                print(f"Fixing null {field}")
                stats_data[field] = []
                
        # Nếu người chơi đã tồn tại, update bản ghi hiện có
        if existing_player:
            print(f"🔄 Player {stats_data['PlayerName']} already exists, updating record")
            
            # In ra dữ liệu PassesList trước khi cập nhật
            print(f"PassesList before update: {stats_data['PassesList']}")
            
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
            
            print(f"✅ Updated player record: {stats_data['PlayerName']}")
            
            # Update record count
            record_count = stats_collection.count_documents({})
            print(f"✅ Database has {record_count} records")
            
            return {
                "success": True, 
                "message": "Player data updated",
                "player": stats_data["PlayerName"]
            }
        
        # Nếu người chơi không tồn tại, thêm mới vào database
        else:
            print(f"➕ Player {stats_data['PlayerName']} is new, adding to database")
            
            # In ra dữ liệu PassesList trước khi thêm mới
            print(f"PassesList before insert: {stats_data['PassesList']}")
            
            # Insert into MongoDB
            result = stats_collection.insert_one(stats_data)
            print(f"✅ Inserted new player with ID: {result.inserted_id}")
            
            # Update record count
            record_count = stats_collection.count_documents({})
            print(f"✅ Database now has {record_count} records")
            
            return {
                "success": True, 
                "id": str(result.inserted_id),
                "message": "New player added"
            }
    except Exception as e:
        print(f"❌ Failed to process stats: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}

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

# API security - require authentication for all API routes
def get_session_user(session: str = Cookie(None)):
    """Get the user from the session cookie"""
    if not session or session not in sessions:
        return None
    return sessions[session].get("username")
        
@app.get("/api/players")
async def get_players(username: str = Depends(get_session_user)):
    """Get list of all players."""
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
        
    # Get unique player names
    pipeline = [
        {"$group": {"_id": "$PlayerName"}},
        {"$project": {"PlayerName": "$_id", "_id": 0}}
    ]
    players = list(stats_collection.aggregate(pipeline))
    return players

@app.get("/api/player/{player_name}")
async def get_player_stats(player_name: str, limit: int = 10, username: str = Depends(get_session_user)):
    """Get stats for a specific player."""
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
        
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
async def get_latest_stats(username: str = Depends(get_session_user)):
    """Get latest stats for all players."""
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
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
