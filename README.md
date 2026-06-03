# Algorand X402 Projects

A collection of Algorand blockchain projects and experiments, showcasing HTTP 402 (Payment Required) workflows, microtransactions, and payment verifications on the Algorand Testnet.

---

## 📁 Repository Structure

Each project is contained in its own directory:

*   **[`algox402-joke`](file:///Users/sayangenri/Desktop/algox402-joke/algox402-joke)**: An Express API serving AI jokes guarded by a 0.1 ALGO transaction verification layer (HTTP 402 workflow).

---

## 🚀 Projects Overview

### 1. Algorand-Paid AI Joke API (`algox402-joke`)
Serves artificial intelligence responses (jokes generated via Groq's Llama 3.3 model) guarded by an on-chain verification layer on the Algorand Testnet.
*   **Technologies**: Express.js, Algorand SDK, Groq API, dotenv.
*   **Workflow**:
    1. Request to `/joke` returns `HTTP 402 Payment Required` with merchant wallet details.
    2. Client pays `0.1 ALGO` on the Algorand Testnet and receives a transaction ID (`txId`).
    3. Client submits the `txId` to the API.
    4. Server verifies the transaction on-chain, checks for double-spend, calls Groq LLM, and returns the joke.

---

## ⚙️ General Requirements
To run projects in this repository:
- **Node.js** (v18 or higher)
- **Algorand Testnet Wallet** (funded via dispenser)
- Appropriate environment configurations (e.g., API keys) inside each project folder's `.env` file.

See the README in individual project subdirectories for detailed setup and execution instructions.
