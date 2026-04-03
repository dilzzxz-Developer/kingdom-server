const express = require("express");
const app = express();

app.use(express.json());

const BASE = "https://kingdom-empire-default-rtdb.asia-southeast1.firebasedatabase.app/";

let tokens = {};

// LOGIN
app.post("/login", async (req,res)=>{
    let {user, pass} = req.body;

    let r = await fetch(BASE+"users/"+user+".json");
    let data = await r.json();

    if(!data || data.password !== pass){
        return res.json({status:"fail"});
    }

    let token = Math.random().toString(36).substring(2);
    tokens[token] = user;

    res.json({status:"ok", token:token});
});

// SAVE
app.post("/save", async (req,res)=>{
    let {token, gold, wood, food, x, y} = req.body;

    if(!tokens[token]) return res.json({status:"invalid"});

    let user = tokens[token];

    let body = {
        gold, wood, food, x, y,
        lastOnline: Date.now()
    };

    await fetch(BASE+"users/"+user+".json",{
        method:"PATCH",
        body: JSON.stringify(body)
    });

    res.json({status:"saved"});
});

app.listen(3000, ()=>console.log("Server jalan 🔥"));
