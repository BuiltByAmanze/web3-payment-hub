require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { query } = require("./db");
const rateLimit = require("express-rate-limit");
const { createPublicClient, http } = require("viem");
const { sepolia } = require("viem/chains");

const sepoliaClient = createPublicClient({
  chain: sepolia,
  transport: http(process.env.SEPOLIA_RPC_URL),
});

const etherToWei = (etherAmount) => {
  const [wholePart, fractionalPart = ""] = etherAmount.trim().split(".");
  const paddedFractional = fractionalPart.padEnd(18, "0").slice(0, 18);
  const weiString = `${wholePart || "0"}${paddedFractional}`.replace(/^0+(?=\d)/, "");
  return BigInt(weiString === "" ? "0" : weiString);
};


const app = express();
const PORT = process.env.PORT || 4000;

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
  })
);
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    service: "Web3 Payment Hub API",
    status: "running",
  });
});

app.get("/api/db-health", async (req, res) => {
  try {
    const result = await query("SELECT NOW() AS time");

    res.json({
      success: true,
      database: "connected",
      time: result.rows[0].time,
    });
  } catch (error) {
    console.error("Database health error:", error);

    res.status(500).json({
      success: false,
      database: "disconnected",
      error: error.message,
    });
  }
});

app.post("/api/payment-requests", async (req, res) => {
  try {
    const {
      id,
      description,
      amount,
      token = "ETH",
      recipient,
      paymentUrl,
    } = req.body;

    if (!id || !description || !amount || !recipient || !paymentUrl) {
      return res.status(400).json({
        success: false,
        error: "id, description, amount, recipient, and paymentUrl are required.",
      });
    }

    if (Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        error: "Amount must be greater than zero.",
      });
    }

    const result = await query(
      `
      INSERT INTO payment_requests (
        id,
        description,
        amount,
        token,
        status,
        recipient,
        payment_url
      )
      VALUES ($1, $2, $3, $4, 'Pending', $5, $6)
      RETURNING *
      `,
      [
        id,
        description,
        String(amount),
        token,
        recipient,
        paymentUrl,
      ]
    );

    res.status(201).json({
      success: true,
      paymentRequest: result.rows[0],
    });
  } catch (error) {
    console.error("Create payment request error:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        error: "A payment request with this ID already exists.",
      });
    }

    res.status(500).json({
      success: false,
      error: "Failed to create payment request.",
    });
  }
});

app.get("/api/payment-requests", async (req, res) => {
  try {
    const { recipient } = req.query;

    const addressPattern = /^0x[a-fA-F0-9]{40}$/;

    if (recipient && !addressPattern.test(recipient)) {
      return res.status(400).json({
        success: false,
        error: "recipient is not a valid Ethereum address.",
      });
    }

    const result = recipient
      ? await query(
          `
          SELECT
            id, description, amount, token, status, recipient,
            payment_url, tx_hash, payer, created_at, paid_at
          FROM payment_requests
          WHERE LOWER(recipient) = LOWER($1)
          ORDER BY created_at DESC
          `,
          [recipient]
        )
      : await query(
          `
          SELECT
            id, description, amount, token, status, recipient,
            payment_url, tx_hash, payer, created_at, paid_at
          FROM payment_requests
          ORDER BY created_at DESC
          `
        );

    res.json({
      success: true,
      paymentRequests: result.rows,
    });
  } catch (error) {
    console.error("List payment requests error:", error);

    res.status(500).json({
      success: false,
      error: "Failed to list payment requests.",
    });
  }
});

app.get("/api/payment-requests/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `
      SELECT
        id,
        description,
        amount,
        token,
        status,
        recipient,
        payment_url,
        tx_hash,
        payer,
        created_at,
        paid_at
      FROM payment_requests
      WHERE id = $1
      LIMIT 1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Payment request not found.",
      });
    }

    res.json({
      success: true,
      paymentRequest: result.rows[0],
    });
  } catch (error) {
    console.error("Get payment request error:", error);

    res.status(500).json({
      success: false,
      error: "Failed to retrieve payment request.",
    });
  }
});

const markPaidLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many requests. Please try again shortly.",
  },
});

app.patch("/api/payment-requests/:id/paid", markPaidLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const { txHash, payer } = req.body;

    const txHashPattern = /^0x[a-fA-F0-9]{64}$/;
    const addressPattern = /^0x[a-fA-F0-9]{40}$/;

    if (!txHash || !payer) {
      return res.status(400).json({
        success: false,
        error: "txHash and payer are required.",
      });
    }

    if (!txHashPattern.test(txHash)) {
      return res.status(400).json({
        success: false,
        error: "txHash is not a valid Ethereum transaction hash.",
      });
    }

    if (!addressPattern.test(payer)) {
      return res.status(400).json({
        success: false,
        error: "payer is not a valid Ethereum address.",
      });
    }

    const existing = await query(
      `SELECT * FROM payment_requests WHERE id = $1 LIMIT 1`,
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Payment request not found.",
      });
    }

    if (existing.rows[0].status === "Paid") {
      return res.json({
        success: true,
        paymentRequest: existing.rows[0],
        note: "Payment request was already marked Paid.",
      });
    }

    const paymentRequest = existing.rows[0];

    let receipt;
    let transaction;

    try {
      [receipt, transaction] = await Promise.all([
        sepoliaClient.getTransactionReceipt({ hash: txHash }),
        sepoliaClient.getTransaction({ hash: txHash }),
      ]);
    } catch (chainError) {
      console.error("On-chain lookup error:", chainError.message);

      return res.status(400).json({
        success: false,
        error:
          "Could not find this transaction on Sepolia. It may not exist yet, or may still be pending.",
      });
    }

    if (receipt.status !== "success") {
      return res.status(400).json({
        success: false,
        error: "This transaction failed on-chain and cannot be marked as paid.",
      });
    }

    const expectedRecipient = paymentRequest.recipient.toLowerCase();
    const actualRecipient = (transaction.to || "").toLowerCase();

    if (actualRecipient !== expectedRecipient) {
      return res.status(400).json({
        success: false,
        error: "Transaction recipient does not match the payment request's recipient address.",
      });
    }

    const expectedWei = etherToWei(paymentRequest.amount);
    const actualWei = transaction.value;

    if (actualWei !== expectedWei) {
      return res.status(400).json({
        success: false,
        error: "Transaction amount does not match the payment request's amount.",
      });
    }

    const actualPayer = (transaction.from || "").toLowerCase();

    if (actualPayer !== payer.toLowerCase()) {
      return res.status(400).json({
        success: false,
        error: "Transaction sender does not match the provided payer address.",
      });
    }

    const result = await query(
      `
      UPDATE payment_requests
      SET status = 'Paid',
          tx_hash = $1,
          payer = $2,
          paid_at = NOW()
      WHERE id = $3
      RETURNING *
      `,
      [txHash, payer, id]
    );

    res.json({
      success: true,
      paymentRequest: result.rows[0],
    });
  } catch (error) {
    console.error("Mark payment paid error:", error);

    res.status(500).json({
      success: false,
      error: "Failed to update payment request.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Payment Hub API running on http://localhost:${PORT}`);
});
