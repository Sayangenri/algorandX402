require("dotenv").config();
const algosdk = require("algosdk");

const algodClient = new algosdk.Algodv2(
    "",
    "https://testnet-api.algonode.cloud",
    ""
);

async function run() {
    const userMnemonic = process.env.USER_MNEMONIC;
    const merchantAddress = process.env.MERCHANT_ADDRESS;

    if (!userMnemonic || !merchantAddress) {
        console.error("Please configure USER_MNEMONIC and MERCHANT_ADDRESS in .env file.");
        process.exit(1);
    }

    const sender = algosdk.mnemonicToSecretKey(userMnemonic);
    console.log(`Sender Address: ${sender.addr}`);
    console.log(`Receiver (Merchant) Address: ${merchantAddress}`);

    // Check balance first
    try {
        const accountInfo = await algodClient.accountInformation(sender.addr).do();
        const balance = Number(accountInfo.amount); // in microAlgos
        console.log(`Sender current balance: ${balance / 1e6} ALGO (${balance} microAlgos)`);

        if (balance < 101000) {
            console.error("\n[ERROR] Insufficient balance to send 0.1 ALGO + tx fee.");
            console.error(`Please fund the user wallet at the Algorand Testnet Faucet:`);
            console.error(`https://bank.testnet.algorand.network/`);
            console.error(`Address to fund: ${sender.addr}\n`);
            process.exit(1);
        }
    } catch (err) {
        console.error("Error retrieving sender account information. Is the address funded or active?", err.message);
        console.error(`Please fund the user wallet at the Algorand Testnet Faucet:`);
        console.error(`https://bank.testnet.algorand.network/`);
        console.error(`Address to fund: ${sender.addr}\n`);
        process.exit(1);
    }

    console.log("Preparing transaction...");
    // Get suggested params
    const suggestedParams = await algodClient.getTransactionParams().do();

    // Create transaction
    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: sender.addr,
        receiver: merchantAddress,
        amount: 100000, // 0.1 ALGO = 100,000 microAlgos
        suggestedParams
    });

    // Sign transaction
    const signedTxn = txn.signTxn(sender.sk);

    console.log("Submitting transaction to Algorand Testnet...");
    const sendResponse = await algodClient.sendRawTransaction(signedTxn).do();
    const txId = sendResponse.txId || sendResponse.txid;
    console.log(`Submitted! Transaction ID: ${txId}`);

    console.log("Waiting for confirmation (usually takes 3-4 seconds)...");
    const confirmedTxn = await algosdk.waitForConfirmation(algodClient, txId, 4);
    const confirmedRound = confirmedTxn.confirmedRound || confirmedTxn["confirmed-round"];
    console.log(`Transaction confirmed in round: ${confirmedRound}`);

    console.log("Sending txId to API...");
    try {
        const response = await fetch("http://localhost:3000/joke", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ txId })
        });

        const status = response.status;
        const result = await response.json();
        console.log(`API Status Code: ${status}`);
        console.log("API Response:", JSON.stringify(result, null, 2));
    } catch (apiErr) {
        console.error("Failed to connect to the API server:", apiErr.message);
    }
}

run().catch((err) => {
    console.error("Unhandled error in payment script:", err);
});
