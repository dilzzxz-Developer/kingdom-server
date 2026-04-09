const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = "KINGDOM_SECRET";

/* ================= FIREBASE ================= */
const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://kingdom-empire-default-rtdb.asia-southeast1.firebasedatabase.app/"
});

const db = admin.database();

/* ================= EMAIL CONFIG ================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/* ================= TOKEN MEMORY ================= */
let tokens = {}; // token OTP (lama)

/* ================= HELPER ================= */
function generateOTP(){
  return Math.floor(100000 + Math.random() * 900000).toString();
}
function hashOTP(otp){
  return crypto.createHash("sha1").update(otp).digest("hex");
}
function generateToken(){
  return crypto.randomBytes(32).toString("hex");
}

/* ================= JWT HELPER (BARU) ================= */
function createJWT(user){
  return jwt.sign(user, JWT_SECRET, { expiresIn:"30d" });
}
function verifyJWT(token){
  try { return jwt.verify(token, JWT_SECRET); }
  catch { return null; }
}

/* =======================================================
   🧑‍🚀 AUTH BARU UNTUK GAME (WEBSOCKET LOGIN)
   ======================================================= */

/* GUEST LOGIN */
app.post("/auth/guest",(req,res)=>{
  const user = {
    id: "guest_"+Date.now(),
    username: "Guest_"+Math.floor(Math.random()*9999)
  };
  const token = createJWT(user);
  res.json({status:"success", user:user.username, token});
});

/* GOOGLE LOGIN */
app.post("/auth/google",(req,res)=>{
  const { email, name } = req.body;
  if(!email) return res.json({status:"email_required"});

  const user = { id:"user_"+Date.now(), username:name, email };
  const token = createJWT(user);

  res.json({status:"success", user:name, token});
});

/* FACEBOOK LOGIN */
app.post("/auth/facebook",(req,res)=>{
  const { email, name } = req.body;
  if(!email) return res.json({status:"email_required"});

  const user = { id:"user_"+Date.now(), username:name, email };
  const token = createJWT(user);

  res.json({status:"success", user:name, token});
});

/* VERIFY JWT (dipakai WebSocket) */
app.post("/verifyToken",(req,res)=>{
  const data = verifyJWT(req.body.token);
  if(!data) return res.json({valid:false});
  res.json({valid:true, user:data.username});
});

/* =======================================================
   🔐 OTP SYSTEM (LAMA — TIDAK DIUBAH)
   ======================================================= */

app.post("/request-otp", async (req,res)=>{
  try{
    const { user } = req.body;
    if(!user) return res.json({status:"no_user"});

    const snap = await db.ref("users/"+user).once("value");
    const data = snap.val();

    if(!data) return res.json({status:"user_not_found"});
    if(data.banned) return res.json({status:"banned"});
    if(!data.email) return res.json({status:"no_email"});

    const otp = generateOTP();
    const hashed = hashOTP(otp);
    const expiresAt = Date.now() + (30 * 60 * 1000);

    await db.ref("otp/"+user).set({ hash: hashed, expiresAt });

    setTimeout(async ()=>{
      const check = await db.ref("otp/"+user).once("value");
      if(check.exists()) await db.ref("otp/"+user).remove();
    }, 30 * 60 * 1000);

    await transporter.sendMail({
      to: data.email,
      subject: "🔐 Verifikasi Login Kingdom Empire",
      html: `<h1>OTP kamu: ${otp}</h1>`
    });

    res.json({status:"otp_sent"});
  }catch(err){
    res.status(500).json({error:err.message});
  }
});

app.post("/verify-otp", async (req,res)=>{
  try{
    const { user, otpInput } = req.body;
    const snap = await db.ref("otp/"+user).once("value");
    const data = snap.val();
    if(!data) return res.json({status:"no_otp"});

    if(Date.now() > data.expiresAt){
      await db.ref("otp/"+user).remove();
      return res.json({status:"expired"});
    }

    if(hashOTP(otpInput) !== data.hash){
      await db.ref("otp/"+user).remove();
      return res.json({status:"wrong"});
    }

    await db.ref("otp/"+user).remove();

    const token = generateToken();
    tokens[token] = { user, createdAt: Date.now() };

    res.json({status:"success", token});
  }catch(err){
    res.status(500).json({error:err.message});
  }
});

/* VERIFY TOKEN SAVE GAME */
app.post("/verify-token",(req,res)=>{
  const { token } = req.body;
  if(!token || !tokens[token]) return res.json({valid:false});
  res.json({valid:true, user:tokens[token].user});
});

/* SAVE GAME */
app.post("/save", async (req,res)=>{
  try{
    const { token, gold, wood, food, x, y } = req.body;
    if(!token || !tokens[token]) return res.json({status:"invalid_token"});

    const user = tokens[token].user;
    delete tokens[token];

    await db.ref("users/"+user).update({
      gold, wood, food, x, y,
      lastOnline: Date.now()
    });

    res.json({status:"saved"});
  }catch(err){
    res.status(500).json({error:err.message});
  }
});

/* ADMIN */
app.get("/get-users", async (req,res)=>{
  const snap = await db.ref("users").once("value");
  const data = snap.val();
  if(!data) return res.json([]);

  const users = Object.keys(data).map(u => ({
    username:u,
    email:data[u].email||"-",
    gold:data[u].gold||0
  }));

  res.json(users);
});

app.get("/", (req,res)=> res.send("Kingdom API Running 🚀"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log("Server jalan " + PORT));
