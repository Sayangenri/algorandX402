// Initialize Algod Client for Testnet
const algodClient = new algosdk.Algodv2(
    "",
    "https://testnet-api.algonode.cloud",
    ""
);

// State Variables
let config = {};
let selectedType = "joke";
let selectedPrice = 0.1; // in ALGO

// DOM Elements
const userAddressEl = document.getElementById("user-address");
const userBalanceEl = document.getElementById("user-balance");
const toggleMnemonicBtn = document.getElementById("toggle-mnemonic-btn");
const userMnemonicContainer = document.getElementById("user-mnemonic-container");
const userMnemonicEl = document.getElementById("user-mnemonic");
const refreshBalanceBtn = document.getElementById("refresh-balance-btn");

const merchantAddressEl = document.getElementById("merchant-address");
const merchantBalanceEl = document.getElementById("merchant-balance");

const priceOptions = document.querySelectorAll(".price-option");
const promptInput = document.getElementById("prompt-input");
const generateBtn = document.getElementById("generate-btn");
const outputContentEl = document.getElementById("output-content");
const successfulTxBadge = document.getElementById("successful-tx-badge");
const explorerLink = document.getElementById("explorer-link");
const copyBtn = document.getElementById("copy-btn");

const statTxs = document.getElementById("stat-txs");
const statAlgos = document.getElementById("stat-algos");
const miniJokeCount = document.getElementById("mini-joke-count");
const miniQuoteCount = document.getElementById("mini-quote-count");
const miniStoryCount = document.getElementById("mini-story-count");

const flowConsole = document.getElementById("flow-console");

// Log levels
const LOG_INFO = "info";
const LOG_SUCCESS = "success";
const LOG_WARNING = "warning";
const LOG_ERROR = "error";

// Write a log line to the dashboard flow terminal console
function logToConsole(message, type = LOG_INFO) {
    const p = document.createElement("p");
    p.className = `console-line ${type}`;
    p.innerHTML = `[${new Date().toLocaleTimeString()}] ${message}`;
    flowConsole.appendChild(p);
    flowConsole.scrollTop = flowConsole.scrollHeight;
}

// Reset Console
function clearConsole() {
    flowConsole.innerHTML = "";
}

// Reset Visual Step Flow Tracker
function resetSteps() {
    document.querySelectorAll(".step").forEach(step => {
        step.classList.remove("active", "completed");
    });
    document.querySelector(".output-card").classList.remove("glow-success");
    successfulTxBadge.classList.add("hidden");
    copyBtn.classList.add("hidden");
}

function updateStepStatus(stepNum, status) {
    const stepEl = document.getElementById(`step-${stepNum}`);
    if (!stepEl) return;
    if (status === "active") {
        stepEl.classList.add("active");
        stepEl.classList.remove("completed");
    } else if (status === "completed") {
        stepEl.classList.add("active", "completed");
    } else {
        stepEl.classList.remove("active", "completed");
    }
}

// Format numbers
function formatAlgo(microAlgos) {
    return (Number(microAlgos) / 1e6).toFixed(2);
}

// Fetch balances from testnet blockchain
async function updateBalances() {
    if (config.userAddress) {
        try {
            const acctInfo = await algodClient.accountInformation(config.userAddress).do();
            userBalanceEl.innerText = formatAlgo(acctInfo.amount);
        } catch (err) {
            console.error("Error fetching user balance", err);
            userBalanceEl.innerText = "Error";
        }
    }
    
    if (config.merchantAddress) {
        try {
            const acctInfo = await algodClient.accountInformation(config.merchantAddress).do();
            merchantBalanceEl.innerText = formatAlgo(acctInfo.amount);
        } catch (err) {
            console.error("Error fetching merchant balance", err);
            merchantBalanceEl.innerText = "Error";
        }
    }
}

// Fetch stats from local backend server database
async function updateStats() {
    try {
        const response = await fetch("/stats");
        const stats = await response.json();
        statTxs.innerText = `${stats.processedCount} Txns`;
        statAlgos.innerText = `${stats.totalAlgosEarned.toFixed(2)} ALGO Earned`;
        
        miniJokeCount.innerText = stats.breakdown.joke || 0;
        miniQuoteCount.innerText = stats.breakdown.quote || 0;
        miniStoryCount.innerText = stats.breakdown.story || 0;
    } catch (err) {
        console.error("Failed to fetch stats", err);
    }
}

// Copy to Clipboard
copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(outputContentEl.innerText);
    logToConsole("Output copied to clipboard!", LOG_SUCCESS);
});

// Hide/Show Seed phrase toggle
toggleMnemonicBtn.addEventListener("click", () => {
    if (userMnemonicContainer.classList.contains("hidden")) {
        userMnemonicContainer.classList.remove("hidden");
        toggleMnemonicBtn.innerHTML = '<i class="fa-solid fa-eye"></i> Hide Seed Phrase';
    } else {
        userMnemonicContainer.classList.add("hidden");
        toggleMnemonicBtn.innerHTML = '<i class="fa-solid fa-eye-slash"></i> Show Seed Phrase';
    }
});

// Price options click handlers
priceOptions.forEach(option => {
    option.addEventListener("click", () => {
        priceOptions.forEach(o => o.classList.remove("active"));
        option.classList.add("active");
        selectedType = option.getAttribute("data-type");
        selectedPrice = parseFloat(option.getAttribute("data-price"));
    });
});

// Initial Setup Load
async function init() {
    try {
        const res = await fetch("/config");
        config = await res.json();

        merchantAddressEl.innerText = config.merchantAddress || "N/A";
        userAddressEl.innerText = config.userAddress || "N/A";
        userMnemonicEl.innerText = config.userMnemonic || "N/A";
        
        await updateBalances();
        await updateStats();
        logToConsole("System initialized. Welcome to the sandbox.");
    } catch (err) {
        logToConsole("Failed to fetch server credentials. Is the backend running?", LOG_ERROR);
    }
}

// Refresh balance triggers
refreshBalanceBtn.addEventListener("click", async () => {
    logToConsole("Refreshing balances from blockchain...");
    await updateBalances();
    await updateStats();
    logToConsole("Balances updated.", LOG_SUCCESS);
});

// Central flow coordinator: executes the HTTP 402 Pay-Per-Request Flow
async function executeFlow() {
    // 0. Initial validation
    if (!config.userMnemonic) {
        logToConsole("Error: User mnemonic is missing. Please check your .env file.", LOG_ERROR);
        return;
    }
    
    // Clear and reset visual states
    clearConsole();
    resetSteps();
    outputContentEl.innerHTML = `<span class="placeholder-text"><i class="fa-solid fa-sync fa-spin"></i> Execution in progress...</span>`;
    
    // Set UI loading state
    generateBtn.disabled = true;
    generateBtn.querySelector(".btn-text").classList.add("hidden");
    generateBtn.querySelector(".btn-loader").classList.remove("hidden");

    const endpointUrl = `/${selectedType}`;
    const amountInMicroAlgos = selectedPrice * 1e6;
    const promptText = promptInput.value.trim();
    
    logToConsole(`Beginning workflow: Type=${selectedType.toUpperCase()}, Amount=${selectedPrice} ALGO (${amountInMicroAlgos} microAlgos)`, LOG_INFO);

    try {
        // --- STEP 1: HTTP 402 CHALLENGE ---
        updateStepStatus(1, "active");
        logToConsole(`Testing payment requirements via POST ${endpointUrl}...`, LOG_INFO);
        
        const challengeRes = await fetch(endpointUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: promptText })
        });
        
        logToConsole(`Received response status code: ${challengeRes.status}`, LOG_INFO);
        
        if (challengeRes.status !== 402) {
            throw new Error(`Expected HTTP 402 challenge, but received HTTP ${challengeRes.status}`);
        }
        
        const challengeData = await challengeRes.json();
        logToConsole(`HTTP 402 Challenge confirmed. Payment Requested: ${challengeData.amount} to receiver ${challengeData.receiver.slice(0, 8)}...`, LOG_SUCCESS);
        updateStepStatus(1, "completed");

        // --- STEP 2: CONSTRUCT & SIGN TRANSACTION ---
        updateStepStatus(2, "active");
        logToConsole("Converting secret key mnemonic...", LOG_INFO);
        
        const sender = algosdk.mnemonicToSecretKey(config.userMnemonic);
        logToConsole(`sender.addr type: ${typeof sender.addr}, value: ${sender.addr}, keys: ${Object.keys(sender)}`, LOG_INFO);
        const senderAddrStr = typeof sender.addr === "string" ? sender.addr : (sender.addr && typeof sender.addr.toString === "function" ? sender.addr.toString() : String(sender.addr));
        logToConsole(`Loading transaction parameters for sender: ${senderAddrStr.slice(0, 8)}...`, LOG_INFO);

        const suggestedParams = await algodClient.getTransactionParams().do();
        logToConsole(`Suggested transaction parameters retrieved. Fee: ${suggestedParams.fee} microAlgos`, LOG_INFO);

        logToConsole(`Building payment txn: ${selectedPrice} ALGO -> ${config.merchantAddress.slice(0, 8)}...`, LOG_INFO);
        const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            sender: sender.addr,
            receiver: config.merchantAddress,
            amount: amountInMicroAlgos,
            suggestedParams
        });

        logToConsole("Signing transaction locally in browser...", LOG_INFO);
        const signedTxn = txn.signTxn(sender.sk);
        logToConsole("Transaction signed successfully.", LOG_SUCCESS);
        updateStepStatus(2, "completed");

        // --- STEP 3: SUBMIT TO BLOCKCHAIN & CONFIRM ---
        updateStepStatus(3, "active");
        logToConsole("Submitting transaction to Algorand Testnet...", LOG_INFO);
        
        const sendResponse = await algodClient.sendRawTransaction(signedTxn).do();
        const txId = sendResponse.txId || sendResponse.txid;
        logToConsole(`Broadcasted! Transaction ID: ${txId}`, LOG_INFO);
        logToConsole("Waiting for network confirmation (approx 3-4 seconds)...", LOG_INFO);
        
        const confirmedTxn = await algosdk.waitForConfirmation(algodClient, txId, 4);
        const confirmedRound = confirmedTxn.confirmedRound || confirmedTxn["confirmed-round"];
        logToConsole(`Transaction confirmed on Algorand Testnet in round ${confirmedRound}!`, LOG_SUCCESS);
        updateStepStatus(3, "completed");

        // --- STEP 4: SUBMIT TRANSACTION ID FOR VERIFICATION ---
        updateStepStatus(4, "active");
        logToConsole(`Sending Transaction ID to backend: POST ${endpointUrl} {"txId": "${txId.slice(0, 8)}..."}`, LOG_INFO);
        
        const apiResponse = await fetch(endpointUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                txId: txId,
                prompt: promptText
            })
        });

        logToConsole(`API responded with status: ${apiResponse.status}`, LOG_INFO);
        
        if (!apiResponse.ok) {
            const errData = await apiResponse.json();
            throw new Error(`API verification failed: ${errData.error || apiResponse.statusText}`);
        }
        
        const result = await apiResponse.json();
        logToConsole("Transaction verified successfully. AI Content unlocked!", LOG_SUCCESS);
        updateStepStatus(4, "completed");

        // --- STEP 5: DISPLAY RESPONSE & REFRESH ---
        updateStepStatus(5, "active");
        logToConsole("Rendering generated AI response...", LOG_INFO);
        
        // Show output
        outputContentEl.innerText = result.response;
        document.querySelector(".output-card").classList.add("glow-success");
        
        // Show tx badge & link
        explorerLink.innerText = txId;
        explorerLink.href = `https://lora.algodev.codes/tx/${txId}`; // Dev explorer link
        successfulTxBadge.classList.remove("hidden");
        copyBtn.classList.remove("hidden");

        updateStepStatus(5, "completed");
        logToConsole("Workflow completed successfully!", LOG_SUCCESS);
        
        // Refresh balance & stats
        await updateBalances();
        await updateStats();
    } catch (error) {
        logToConsole(`Error: ${error.message}`, LOG_ERROR);
        outputContentEl.innerHTML = `<span class="console-line error"><i class="fa-solid fa-circle-xmark"></i> Failure during execution: ${error.message}</span>`;
    } finally {
        // Reset UI loading states
        generateBtn.disabled = false;
        generateBtn.querySelector(".btn-text").classList.remove("hidden");
        generateBtn.querySelector(".btn-loader").classList.add("hidden");
    }
}

// Generate button click handler
generateBtn.addEventListener("click", executeFlow);

// Run initialization on load
init();
