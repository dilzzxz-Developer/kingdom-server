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

    // auto delete OTP after 30 min
    setTimeout(async ()=>{
      const check = await db.ref("otp/"+user).once("value");
      if(check.exists()){
        await db.ref("otp/"+user).remove();
        console.log("OTP expired:", user);
      }
    }, 30 * 60 * 1000);

    /* ================= SEND EMAIL HTML ================= */
    await transporter.sendMail({
      to: data.email,
      subject: "🔐 Verifikasi Login Kingdom Empire",
      html: `
      <div style="font-family:Arial;background:#0f172a;padding:40px;color:#fff">
        <div style="max-width:600px;margin:auto;background:#111827;border-radius:16px;padding:30px;text-align:center">
          
          <h1 style="color:#22c55e;margin-bottom:10px">
            🔐 KINGDOM EMPIRE
          </h1>

          <p style="color:#9ca3af;font-size:16px">
            Kamu mencoba login ke akun Kingdom Empire.
          </p>

          <div style="margin:30px 0;padding:20px;background:#0f172a;border-radius:12px">
            <p style="margin:0;color:#9ca3af">Kode OTP kamu:</p>
            <h2 style="letter-spacing:6px;font-size:40px;margin:10px 0;color:#22c55e">
              ${otp}
            </h2>
            <p style="color:#9ca3af">Berlaku 30 menit</p>
          </div>

          <p style="color:#ef4444;font-size:14px">
            Jangan bagikan kode ini ke siapapun!
          </p>

          <hr style="border:none;border-top:1px solid #1f2937;margin:30px 0">

          <p style="font-size:12px;color:#6b7280">
            Jika kamu tidak merasa login, abaikan email ini.
          </p>

          <p style="font-size:12px;color:#6b7280">
            © Kingdom Empire System
          </p>

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
    if(!user || !otpInput)
      return res.json({status:"invalid_request"});

    const snap = await db.ref("otp/"+user).once("value");
    const data = snap.val();
    if(!data) return res.json({status:"no_otp"});

    if(Date.now() > data.expiresAt){
      await db.ref("otp/"+user).remove();
      return res.json({status:"expired"});
    }

    const hashedInput = hashOTP(otpInput);

    if(hashedInput !== data.hash){
      await db.ref("otp/"+user).remove();
      return res.json({status:"wrong"});
    }

    await db.ref("otp/"+user).remove();

    const token = generateToken();
    tokens[token] = {
      user: user,
      createdAt: Date.now()
    };

    res.json({status:"success", token});
  }catch(err){
    res.status(500).json({error:err.message});
  }
});

/* ================= SAVE GAME ================= */
app.post("/save", async (req,res)=>{
  try{
    const { token, gold, wood, food, x, y } = req.body;

    if(!token || !tokens[token])
      return res.json({status:"invalid_token"});

    const user = tokens[token].user;

    // token sekali pakai (anti spam)
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

/* ================= ROOT ================= */
app.get("/", (req,res)=>{
  res.send("Kingdom API Running 🚀");
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>{
  console.log("Server berjalan di port " + PORT);
});
