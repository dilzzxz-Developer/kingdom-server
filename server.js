const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

const app = express();
app.use(cors());
app.use(express.json());

/* 🔥 CONNECT FIREBASE */
const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://kingdom-empire-default-rtdb.firebaseio.com/"
});

const db = admin.database();


/* ============================= */
/*  TEST SERVER                  */
/* ============================= */
app.get("/", (req,res)=>{
  res.send("API RUNNING 🔥");
});


/* ============================= */
/*  GET ALL USERS (FIX)          */
/* ============================= */
app.get("/users", async (req,res)=>{
  try{
    const snap = await db.ref("users").once("value");
    const data = snap.val();

    if(!data) return res.json([]);

    // 🔥 penting: object → array
    const usersArray = Object.keys(data).map(key => ({
        username: key,
        ...data[key]
    }));

    res.json(usersArray);
  }catch(err){
    res.status(500).json({error:err.message});
  }
});


/* ============================= */
/*  GET SINGLE USER              */
/* ============================= */
app.get("/user/:username", async (req,res)=>{
  try{
    const username = req.params.username;

    const snap = await db.ref("users/"+username).once("value");
    const data = snap.val();

    if(!data) return res.status(404).json({error:"User not found"});

    res.json(data);
  }catch(err){
    res.status(500).json({error:err.message});
  }
});


/* ============================= */
/*  UPDATE RESOURCE USER         */
/* ============================= */
app.post("/update-resource", async (req,res)=>{
  try{
    const {username, gold, wood, food} = req.body;

    if(!username)
      return res.status(400).json({error:"username required"});

    await db.ref("users/"+username).update({
      gold: gold ?? 0,
      wood: wood ?? 0,
      food: food ?? 0
    });

    res.json({status:"success"});
  }catch(err){
    res.status(500).json({error:err.message});
  }
});


/* ============================= */
/*  START SERVER                 */
/* ============================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log("Server running"));
