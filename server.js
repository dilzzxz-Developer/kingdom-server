    const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

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

// ================= EMAIL CONFIG =================
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// ================= TOKEN STORAGE =================
let tokens = {};

// ================= HELPER =================
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function hashOTP(otp) {
  return crypto.createHash("sha1").update(otp).digest("hex");
}

// ================= REQUEST OTP =================
app.post("/request-otp", async (req,res)=>{
  try{
    let {user} = req.body;

    const snap = await db.ref("users/"+user).once("value");
    let data = snap.val();

    if(!data) return res.json({status:"user_not_found"});
    if(data.banned) return res.json({status:"banned"});
    if(!data.email) return res.json({status:"no_email"});

    const otp = generateOTP();
    const hashed = hashOTP(otp);

    const now = Date.now();
    const expires = now + (30 * 60 * 1000); // 30 menit

    await db.ref("otp/"+user).set({
      hash: hashed,
      attempts: 0,
      expiresAt: expires
    });

    await transporter.sendMail({
      to: data.email,
      subject: "Kode OTP Kingdom Empire",
      text: `Halo ${user},

Kode OTP kamu adalah: ${otp}

Kode berlaku selama 30 menit.
Jangan berikan kode ini ke siapapun.

Kingdom Empire`
    });

    res.json({status:"otp_sent"});

  }catch(err){
    res.status(500).json({error:err.message});
  }
});

// ================= VERIFY OTP =================
app.post("/verify-otp", async (req,res)=>{
  try{
    let {user, otpInput} = req.body;

    const snap = await db.ref("otp/"+user).once("value");
    let data = snap.val();

    if(!data) return res.json({status:"no_otp"});

    if(Date.now() > data.expiresAt){
      await db.ref("otp/"+user).remove();
      return res.json({status:"expired"});
    }

    if(data.attempts >= 3){
      await db.ref("otp/"+user).remove();
      return res.json({status:"blocked"});
    }

    if(hashOTP(otpInput) !== data.hash){
      await db.ref("otp/"+user+"/attempts")
        .set(data.attempts + 1);
      return res.json({status:"wrong"});
    }

    // OTP benar
    await db.ref("otp/"+user).remove();

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

// ================= GET USERS =================
app.get("/users", async (req,res)=>{
  try{
    const snap = await db.ref("users").once("value");
    const data = snap.val();

    if(!data) return res.json([]);

    let result = Object.keys(data).map(username => ({
      id: username,
      username: username,
      email: data[username].email || "-",
      gold: data[username].gold || 0,
      wood: data[username].wood || 0,
      food: data[username].food || 0,
      banned: data[username].banned || false
    }));

    res.json(result);
  }catch(err){
    res.status(500).json({error:err.message});
  }
});

// ================= BAN =================
app.post("/ban", async (req,res)=>{
  try{
    let {username} = req.body;
    await db.ref("users/"+username).update({banned:true});
    res.json({status:"banned"});
  }catch(err){
    res.status(500).json({error:err.message});
  }
});

// ================= UNBAN =================
app.post("/unban", async (req,res)=>{
  try{
    let {username} = req.body;
    await db.ref("users/"+username).update({banned:false});
    res.json({status:"unbanned"});
  }catch(err){
    res.status(500).json({error:err.message});
  }
});

// ================= ROOT =================
app.get("/", (req,res)=>{
  res.send("Kingdom API Running 🚀");
});

// ================= START =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server jalan di port " + PORT));
