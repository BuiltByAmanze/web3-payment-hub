CREATE TABLE IF NOT EXISTS payment_requests (
    id VARCHAR(64) PRIMARY KEY,
    description TEXT NOT NULL,
    amount VARCHAR(100) NOT NULL,
    token VARCHAR(20) NOT NULL DEFAULT 'ETH',
    status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    recipient VARCHAR(42) NOT NULL,
    payment_url TEXT NOT NULL,
    tx_hash VARCHAR(66),
    payer VARCHAR(42),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payment_requests_status
    ON payment_requests(status);

CREATE INDEX IF NOT EXISTS idx_payment_requests_recipient
    ON payment_requests(recipient);
