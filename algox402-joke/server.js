require("dotenv").config();

const express = require("express");
const OpenAI = require("openai");
const algosdk = require("algosdk");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const MERCHANT_ADDRESS = (process.env.MERCHANT_ADDRESS || "").trim();
const USER_ADDRESS = (process.env.USER_ADDRESS || "").trim();
const USER_MNEMONIC = (process.env.USER_MNEMONIC || "").trim();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Initialize Algod client connecting to the Algorand Testnet
const algodClient = new algosdk.Algodv2(
    "",
    "https://testnet-api.algonode.cloud",
    ""
);

// Database path for processed transactions and stats
const DB_FILE = path.join(__dirname, "db.json");

let db = {
    processedTxns: [],
    stats: {
        joke: 0,
        quote: 0,
        story: 0,
        totalAlgos: 0
    }
};

// Load database
try {
    if (fs.existsSync(DB_FILE)) {
        const data = fs.readFileSync(DB_FILE, "utf8");
        db = JSON.parse(data);
        if (!db.processedTxns) db.processedTxns = [];
        if (!db.stats) db.stats = { joke: 0, quote: 0, story: 0, totalAlgos: 0 };
    } else {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
    }
} catch (err) {
    console.error("Failed to load/initialize database:", err);
}

function saveDb() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
    } catch (err) {
        console.error("Failed to save database:", err);
    }
}

const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1"
});

async function verifyPayment(txId, requiredAmount) {
    if (!txId || typeof txId !== "string") return false;

    // Check if transaction has already been processed
    if (db.processedTxns.includes(txId)) {
        console.warn(`Transaction ID ${txId} has already been processed.`);
        return false;
    }

    try {
        const txnInfo = await algodClient.pendingTransactionInformation(txId).do();
        if (!txnInfo || !txnInfo.txn || !txnInfo.txn.txn) {
            return false;
        }

        const txn = txnInfo.txn.txn;

        let receiver = "";
        let amount = 0;

        // Extract receiver address robustly
        if (txn.payment && txn.payment.receiver) {
            const rcvObj = txn.payment.receiver;
            if (typeof rcvObj === "string") {
                receiver = rcvObj;
            } else if (typeof rcvObj.toString === "function") {
                receiver = rcvObj.toString();
            } else if (rcvObj.publicKey) {
                receiver = algosdk.encodeAddress(rcvObj.publicKey);
            }
        } else if (txn.rcv) {
            if (typeof txn.rcv === "string") {
                receiver = txn.rcv;
            } else {
                receiver = algosdk.encodeAddress(txn.rcv);
            }
        }

        // Extract amount robustly
        if (txn.payment && txn.payment.amount !== undefined) {
            amount = Number(txn.payment.amount);
        } else if (txn.amt !== undefined) {
            amount = Number(txn.amt);
        }

        const txType = txn.type;

        if (
            txType === "pay" &&
            receiver === MERCHANT_ADDRESS &&
            amount >= requiredAmount
        ) {
            // Also ensure there is no pool error
            if (txnInfo["pool-error"]) {
                console.warn(`Transaction ${txId} failed with pool error: ${txnInfo["pool-error"]}`);
                return false;
            }
            // Mark the transaction as processed
            db.processedTxns.push(txId);
            db.stats.totalAlgos += (amount / 1e6);
            saveDb();
            return true;
        }

        return false;
    } catch (error) {
        console.error(`Error verifying payment for txId ${txId}:`, error);
        return false;
    }
}

// Config endpoint for Frontend client
app.get("/config", (req, res) => {
    res.json({
        merchantAddress: MERCHANT_ADDRESS,
        userAddress: USER_ADDRESS,
        userMnemonic: USER_MNEMONIC
    });
});

// Stats endpoint
app.get("/stats", (req, res) => {
    res.json({
        processedCount: db.processedTxns.length,
        totalAlgosEarned: db.stats.totalAlgos,
        breakdown: {
            joke: db.stats.joke || 0,
            quote: db.stats.quote || 0,
            story: db.stats.story || 0
        }
    });
});

// Helper for calling Groq LLM API
async function generateContent(prompt, systemInstruction) {
    const response = await client.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
            {
                role: "system",
                content: systemInstruction
            },
            {
                role: "user",
                content: prompt
            }
        ]
    });
    return response.choices[0].message.content;
}

// POST /joke (0.1 ALGO)
app.post("/joke", async (req, res) => {
    const txId = req.body?.txId;
    const REQUIRED_AMOUNT = 100000;

    if (!txId) {
        return res.status(402).json({
            error: "Payment Required",
            amount: "0.1 ALGO",
            receiver: MERCHANT_ADDRESS
        });
    }

    const isValid = await verifyPayment(txId, REQUIRED_AMOUNT);
    if (!isValid) {
        return res.status(403).json({
            error: "Invalid Payment"
        });
    }

    const prompt = req.body?.prompt || "Tell me a random joke";
    
    try {
        const joke = await generateContent(prompt, "You are a witty, professional stand-up comedian. Tell a funny, clean joke.");
        
        db.stats.joke = (db.stats.joke || 0) + 1;
        saveDb();

        res.json({ response: joke });
    } catch (apiError) {
        console.error("Error calling Groq API:", apiError);
        res.status(500).json({
            error: "Internal Server Error",
            message: apiError.message
        });
    }
});

// POST /quote (0.05 ALGO)
app.post("/quote", async (req, res) => {
    const txId = req.body?.txId;
    const REQUIRED_AMOUNT = 50000;

    if (!txId) {
        return res.status(402).json({
            error: "Payment Required",
            amount: "0.05 ALGO",
            receiver: MERCHANT_ADDRESS
        });
    }

    const isValid = await verifyPayment(txId, REQUIRED_AMOUNT);
    if (!isValid) {
        return res.status(403).json({
            error: "Invalid Payment"
        });
    }

    const prompt = req.body?.prompt || "Tell me an inspirational quote";
    
    try {
        const quote = await generateContent(prompt, "You are a philosophical mentor. Share a deeply inspiring and thought-provoking quote.");
        
        db.stats.quote = (db.stats.quote || 0) + 1;
        saveDb();

        res.json({ response: quote });
    } catch (apiError) {
        console.error("Error calling Groq API:", apiError);
        res.status(500).json({
            error: "Internal Server Error",
            message: apiError.message
        });
    }
});

// POST /story (0.2 ALGO)
app.post("/story", async (req, res) => {
    const txId = req.body?.txId;
    const REQUIRED_AMOUNT = 200000;

    if (!txId) {
        return res.status(402).json({
            error: "Payment Required",
            amount: "0.2 ALGO",
            receiver: MERCHANT_ADDRESS
        });
    }

    const isValid = await verifyPayment(txId, REQUIRED_AMOUNT);
    if (!isValid) {
        return res.status(403).json({
            error: "Invalid Payment"
        });
    }

    const prompt = req.body?.prompt || "Tell me a short bedtime story";
    
    try {
        const story = await generateContent(prompt, "You are a creative writer. Tell a captivating, brief short story.");
        
        db.stats.story = (db.stats.story || 0) + 1;
        saveDb();

        res.json({ response: story });
    } catch (apiError) {
        console.error("Error calling Groq API:", apiError);
        res.status(500).json({
            error: "Internal Server Error",
            message: apiError.message
        });
    }
});

app.listen(3000, () => {
    console.log("Server running on port 3000");
});