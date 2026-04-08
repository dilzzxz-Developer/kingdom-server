const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const app = express();
app.use(cors());
app.use(express.json());

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
let tokens = {};

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

/* ================= REQUEST OTP ================= */
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

    await db.ref("otp/"+user).set({
      hash: hashed,
      expiresAt: expiresAt
    });

    // auto delete OTP
    setTimeout(async ()=>{
      const check = await db.ref("otp/"+user).once("value");
      if(check.exists()) await db.ref("otp/"+user).remove();
    }, 30 * 60 * 1000);

    // ✉️ EMAIL HTML TEMPLATE
    await transporter.sendMail({
      to: data.email,
      subject: "🔐 Verifikasi Login Kingdom Empire",
      html: `
      <div style="font-family:Arial;background:#0f172a;padding:40px;color:#fff">
        <div style="max-width:600px;margin:auto;background:#111827;border-radius:16px;padding:30px;text-align:center">
          <h1 style="color:#22c55e">🔐 KINGDOM EMPIRE</h1>
          <p style="color:#9ca3af">Kode OTP login kamu:</p>
          <h2 style="letter-spacing:6px;font-size:40px;color:#22c55e">${otp}</h2>
          <p style="color:#9ca3af">Berlaku 30 menit</p>
          <p style="color:#ef4444">Jangan bagikan kode ini!</p>
        </div>
      </div>`
    });

    res.json({status:"otp_sent"});
  }catch(err){
    res.status(500).json({error:err.message});
  }
});

/* ================= VERIFY OTP ================= */
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

/* ================= VERIFY TOKEN (UNTUK WEBSOCKET) ================= */
app.post("/verify-token", async (req,res)=>{
  const { token } = req.body;
  if(!token || !tokens[token]) return res.json({valid:false});
  res.json({valid:true, user:tokens[token].user});
});

/* ================= SAVE GAME ================= */
app.post("/save", async (req,res)=>{
  try{
    const { token, gold, wood, food, x, y } = req.body;
    if(!token || !tokens[token]) return res.json({status:"invalid_token"});

    const user = tokens[token].user;
    delete tokens[token]; // sekali pakai

    await db.ref("users/"+user).update({
      gold, wood, food, x, y,
      lastOnline: Date.now()
    });

    res.json({status:"saved"});
  }catch(err){
    res.status(500).json({error:err.message});
  }
});

/* ================= ADMIN: GET USERS ================= */
app.get("/get-users", async (req,res)=>{
  const snap = await db.ref("users").once("value");
  const data = snap.val();
  if(!data) return res.json([]);

  const users = Object.keys(data).map(u => ({
    username: u,
    email: data[u].email || "-",
    gold: data[u].gold || 0,
    wood: data[u].wood || 0,
    food: data[u].food || 0,
    banned: data[u].banned || false,
    lastOnline: data[u].lastOnline || 0
  }));

  res.json(users);
});

/* ================= ADMIN EDIT RESOURCE ================= */
app.post("/admin/edit-resource", async (req,res)=>{
  const { username, gold, wood, food } = req.body;
  await db.ref("users/"+username).update({
    gold:Number(gold),
    wood:Number(wood),
    food:Number(food)
  });
  res.json({status:"updated"});
});

/* ================= ADMIN BAN ================= */
app.post("/admin/ban", async (req,res)=>{
  const { username, status } = req.body;
  await db.ref("users/"+username).update({ banned:status });
  res.json({status:"done"});
});

/* ================= ROOT ================= */
app.get("/", (req,res)=> res.send("Kingdom API Running 🚀"));

/* ================= START ================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log("Server jalan di port " + PORT));
