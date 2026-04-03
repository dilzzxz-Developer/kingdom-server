const express = require("express");
const admin = require("firebase-admin");

const app = express();
app.use(express.json());

/* ================= FIREBASE ADMIN CONNECT ================= */

// ambil private key dari Railway Variables
const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://kingdom-empire-default-rtdb.asia-southeast1.firebasedatabase.app/"
});

const db = admin.database();

/* ================= MEMORY TOKEN ================= */

let tokens = {};

/* ================= LOGIN ================= */

app.post("/login", async (req, res) => {
  try {
    let { user, pass } = req.body;

    const snapshot = await db.ref("users/" + user).once("value");
    const data = snapshot.val();

    if (!data || data.password !== pass) {
      return res.json({ status: "fail" });
    }

    // buat token login
    let token = Math.random().toString(36).substring(2);
    tokens[token] = user;

    res.json({ status: "ok", token: token });

  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

/* ================= SAVE GAME ================= */

app.post("/save", async (req, res) => {
  try {
    let { token, gold, wood, food, x, y } = req.body;

    if (!tokens[token]) {
      return res.json({ status: "invalid" });
    }

    let user = tokens[token];

    let body = {
      gold,
      wood,
      food,
      x,
      y,
      lastOnline: Date.now()
    };

    await db.ref("users/" + user).update(body);

    res.json({ status: "saved" });

  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

/* ================= GET ALL USERS (UNTUK WEBSITE ADMIN) ================= */

app.get("/users", async (req, res) => {
  try {
    const snapshot = await db.ref("users").once("value");
    const data = snapshot.val();

    res.json(data || {});
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

/* ================= BAN USER ================= */

app.post("/ban", async (req, res) => {
  try {
    let { username } = req.body;

    await db.ref("users/" + username).update({
      banned: true
    });

    res.json({ status: "user banned" });
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

/* ================= UNBAN USER ================= */

app.post("/unban", async (req, res) => {
  try {
    let { username } = req.body;

    await db.ref("users/" + username).update({
      banned: false
    });

    res.json({ status: "user unbanned" });
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

/* ================= TEST ROOT ================= */

app.get("/", (req, res) => {
  res.send("Kingdom Server Running 🔥");
});

/* ================= START SERVER ================= */

app.listen(3000, () => console.log("Server jalan 🔥"));
