const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

const app = express();
app.use(cors());
app.use(express.json());

// 🔐 FIREBASE PRIVATE KEY dari Railway ENV
const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://kingdom-empire-default-rtdb.asia-southeast1.firebasedatabase.app/"
});

const db = admin.database();

let tokens = {};


// ================= LOGIN =================
app.post("/login", async (req,res)=>{
  try{
    let {user, pass} = req.body;

    const snap = await db.ref("users/"+user).once("value");
    let data = snap.val();

    if(!data || data.password !== pass){
      return res.json({status:"fail"});
    }

    if(data.banned){
      return res.json({status:"banned"});
    }

    let token = Math.random().toString(36).substring(2);
    tokens[token] = user;

    res.json({status:"ok", token});
  }catch(err){
    res.status(500).json({error:err.message});
  }
});


// ================= SAVE GAME =================
app.post("/save", async (req,res)=>{
  try{
    let {token, gold, wood, food, x, y} = req.body;

    if(!tokens[token]) return res.json({status:"invalid"});
    let user = tokens[token];

    await db.ref("users/"+user).update({
      gold, wood, food, x, y,
      lastOnline: Date.now()
    });

    res.json({status:"saved"});
  }catch(err){
    res.status(500).json({error:err.message});
  }
});


// ================= GET ALL USERS (UNTUK WEBSITE ADMIN) =================
app.get("/users", async (req,res)=>{
  try{
    const snap = await db.ref("users").once("value");
    const data = snap.val();

    if(!data) return res.json([]);

    let result = Object.keys(data).map(username => ({
      id: username,
      username: username,
      email: data[username].email || "-",
      password: data[username].password || "-",
      gold: data[username].gold || 0,
      wood: data[username].wood || 0,
      food: data[username].food || 0,
      x: data[username].x || 0,
      y: data[username].y || 0,
      banned: data[username].banned || false
    }));

    res.json(result);
  }catch(err){
    res.status(500).json({error:err.message});
  }
});


// ================= BAN USER =================
app.post("/ban", async (req,res)=>{
  try{
    let {username} = req.body;
    await db.ref("users/"+username).update({banned:true});
    res.json({status:"banned"});
  }catch(err){
    res.status(500).json({error:err.message});
  }
});


// ================= UNBAN USER =================
app.post("/unban", async (req,res)=>{
  try{
    let {username} = req.body;
    await db.ref("users/"+username).update({banned:false});
    res.json({status:"unbanned"});
  }catch(err){
    res.status(500).json({error:err.message});
  }
});


// ================= ROOT TEST =================
app.get("/", (req,res)=>{
  res.send("Kingdom API Running 🚀");
});


// 🔥 WAJIB UNTUK RAILWAY
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server jalan di port " + PORT));
