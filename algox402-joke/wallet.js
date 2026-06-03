const fs = require("fs");
const path = require("path");
const algosdk = require("algosdk");

function generateWallet(name) {
    const account = algosdk.generateAccount();
    const mnemonic = algosdk.secretKeyToMnemonic(account.sk);
    console.log(`=== Generated ${name} Wallet ===`);
    console.log(`Address: ${account.addr}`);
    console.log(`Mnemonic: ${mnemonic}`);
    console.log(`==================================\n`);
    return {
        address: account.addr,
        mnemonic: mnemonic
    };
}

const merchant = generateWallet("Merchant");
const user = generateWallet("User");

// Read existing .env to preserve other variables (like GROQ_API_KEY)
const envPath = path.join(__dirname, ".env");
let envContent = "";
if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, "utf8");
}

// Ensure there is a newline at the end of existing content
if (envContent && !envContent.endsWith("\n")) {
    envContent += "\n";
}

// Append the new keys
envContent += `MERCHANT_ADDRESS=${merchant.address}\n`;
envContent += `MERCHANT_MNEMONIC=${merchant.mnemonic}\n`;
envContent += `USER_ADDRESS=${user.address}\n`;
envContent += `USER_MNEMONIC=${user.mnemonic}\n`;

fs.writeFileSync(envPath, envContent, "utf8");
console.log("Successfully appended wallet credentials to .env");
