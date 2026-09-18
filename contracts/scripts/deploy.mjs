import fs from "fs";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

const abi = JSON.parse(
  fs.readFileSync("./src_PaymentHub_sol_PaymentHub.abi", "utf8")
);

const bytecode =
  "0x" +
  fs
    .readFileSync("./src_PaymentHub_sol_PaymentHub.bin", "utf8")
    .trim();

if (!process.env.PRIVATE_KEY) {
  throw new Error("PRIVATE_KEY environment variable is required");
}

const account = privateKeyToAccount(process.env.PRIVATE_KEY);

const walletClient = createWalletClient({
  account,
  chain: foundry,
  transport: http("http://127.0.0.1:8545"),
});

const publicClient = createPublicClient({
  chain: foundry,
  transport: http("http://127.0.0.1:8545"),
});

console.log("Deploying from:", account.address);

const hash = await walletClient.deployContract({
  abi,
  bytecode,
});

console.log("Deployment transaction:", hash);

const receipt = await publicClient.waitForTransactionReceipt({
  hash,
});

console.log("Contract deployed at:", receipt.contractAddress);
