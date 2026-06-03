require("dotenv").config();

const express = require("express");
const OpenAI = require("openai");
const algosdk = require("algosdk");

const app = express();

app.use(express.json());

// Initialize Algod client connecting to the Algorand Testnet
const algodClient = new algosdk.Algodv2(
    "",
    "https://testnet-api.algonode.cloud",
    ""
);

// In-memory set to prevent double-spending / transaction replay attacks
const processedTxns = new Set();

const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1"
});

async function verifyPayment(txId) {
    if (!txId || typeof txId !== "string") return false;

    // Check if transaction has already been processed
    if (processedTxns.has(txId)) {
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

        // Required: 0.1 ALGO = 100,000 microAlgos
        const REQUIRED_AMOUNT = 100000;

        if (
            txType === "pay" &&
            receiver === process.env.MERCHANT_ADDRESS &&
            amount >= REQUIRED_AMOUNT
        ) {
            // Also ensure there is no pool error
            if (txnInfo["pool-error"]) {
                console.warn(`Transaction ${txId} failed with pool error: ${txnInfo["pool-error"]}`);
                return false;
            }
            // Mark the transaction as processed
            processedTxns.add(txId);
            return true;
        }

        return false;
    } catch (error) {
        console.error(`Error verifying payment for txId ${txId}:`, error);
        return false;
    }
}

app.post("/joke", async (req, res) => {
    const txId = req.body?.txId;

    if (!txId) {
        return res.status(402).json({
            error: "Payment Required",
            amount: "0.1 ALGO",
            receiver: process.env.MERCHANT_ADDRESS
        });
    }

    const isValid = await verifyPayment(txId);
    if (!isValid) {
        return res.status(403).json({
            error: "Invalid Payment"
        });
    }

    const prompt = req.body?.prompt || "Tell me a random joke";
    
    try {
        const response = await client.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [
                {
                    role: "user",
                    content: prompt
                }
            ]
        });

        res.json({
            response: response.choices[0].message.content
        });
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