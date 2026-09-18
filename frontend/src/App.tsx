import { useEffect, useState } from 'react'
import './App.css'

type PaymentStatus = 'Pending' | 'Paid'

type PaymentRequest = {
  id: string
  description: string
  amount: string
  token: string
  status: PaymentStatus
  created: string
  recipient: string
  paymentUrl: string
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

const etherToWeiHex = (etherAmount: string): string => {
  const [wholePart, fractionalPart = ''] = etherAmount.trim().split('.')
  const paddedFractional = fractionalPart.padEnd(18, '0').slice(0, 18)
  const weiString = `${wholePart || '0'}${paddedFractional}`.replace(/^0+(?=\d)/, '')
  const weiBigInt = BigInt(weiString === '' ? '0' : weiString)
  return '0x' + weiBigInt.toString(16)
}

const createPaymentId = () =>
  `PAY-${Math.random().toString(36).substring(2, 8).toUpperCase()}`

function App() {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showToast = (message: string, type: 'success' | 'error' = 'error') => {
    setToast({ message, type })
    window.setTimeout(() => setToast(null), 4000)
  }

  const [address, setAddress] = useState('')
  const [chainId, setChainId] = useState('')
  const [dashboard, setDashboard] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [copiedId, setCopiedId] = useState('')
  const [paying, setPaying] = useState(false)
  const [paymentComplete, setPaymentComplete] = useState(false)
  const [lastTxHash, setLastTxHash] = useState('')

  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [token, setToken] = useState('ETH')
  const [recipient, setRecipient] = useState('')

  const [payments, setPayments] = useState<PaymentRequest[]>([])

  const path = window.location.pathname
  const paymentMatch = path.match(/^\/pay\/([^/]+)$/)
  const paymentId = paymentMatch ? paymentMatch[1] : null

  useEffect(() => {
    if (!address || paymentId) {
      return
    }

    let cancelled = false

    const loadMerchantPayments = async () => {
      try {
        const response = await fetch(
          `${API_URL}/api/payment-requests?recipient=${address}`
        )

        if (!response.ok || cancelled) {
          return
        }

        const data = await response.json()
        const records = data.paymentRequests || []

        const mapped: PaymentRequest[] = records.map((record: any) => ({
          id: record.id,
          description: record.description,
          amount: record.amount,
          token: record.token,
          status: record.status,
          created: new Date(record.created_at).toLocaleDateString(),
          recipient: record.recipient,
          paymentUrl: record.payment_url,
        }))

        if (!cancelled) {
          setPayments(mapped)
        }
      } catch (error) {
        console.error('Failed to load merchant payments:', error)
      }
    }

    loadMerchantPayments()

    return () => {
      cancelled = true
    }
  }, [address, paymentId])

  const [loadingPayment, setLoadingPayment] = useState(Boolean(paymentId))

  useEffect(() => {
    if (!paymentId) {
      return
    }

    let cancelled = false

    const loadPayment = async () => {
      try {
        const response = await fetch(
          `${API_URL}/api/payment-requests/${paymentId}`
        )

        if (!response.ok) {
          if (!cancelled) {
            setLoadingPayment(false)
          }
          return
        }

        const data = await response.json()
        const record = data.paymentRequest

        if (!record || cancelled) {
          return
        }

        const fetchedPayment: PaymentRequest = {
          id: record.id,
          description: record.description,
          amount: record.amount,
          token: record.token,
          status: record.status,
          created: new Date(record.created_at).toLocaleDateString(),
          recipient: record.recipient,
          paymentUrl: record.payment_url,
        }

        setPayments((current) => {
          const exists = current.some(
            (item) => item.id === fetchedPayment.id
          )
          if (exists) {
            return current.map((item) =>
              item.id === fetchedPayment.id ? fetchedPayment : item
            )
          }
          return [fetchedPayment, ...current]
        })
      } catch (error) {
        console.error('Failed to load payment request:', error)
      } finally {
        if (!cancelled) {
          setLoadingPayment(false)
        }
      }
    }

    loadPayment()

    return () => {
      cancelled = true
    }
  }, [paymentId])

  useEffect(() => {
    if (!window.ethereum) {
      return
    }

    const restoreConnection = async () => {
      if (!window.ethereum) {
        return
      }

      try {
        const accounts = (await window.ethereum.request({
          method: "eth_accounts",
        })) as string[]

        if (accounts.length > 0) {
          const currentChainId = await window.ethereum.request({
            method: "eth_chainId",
          })

          setAddress(accounts[0])
          setChainId(currentChainId as string)
        }
      } catch (error) {
        console.error("Failed to restore wallet connection:", error)
      }
    }

    restoreConnection()
  }, [])

  const connectWallet = async () => {
    if (!window.ethereum) {
      showToast('MetaMask is not installed in this browser.', 'error')
      return
    }

    try {
      const accounts = (await window.ethereum.request({
        method: 'eth_requestAccounts',
      })) as string[]

      const currentChainId = await window.ethereum.request({
        method: 'eth_chainId',
      })

      if (accounts.length > 0) {
        setAddress(accounts[0])
        setChainId(currentChainId as string)
      }
    } catch (error) {
      console.error('Wallet connection failed:', error)
    }
  }

  const getNetworkName = () => {
    switch (chainId) {
      case '0x1':
        return 'Ethereum Mainnet'
      case '0xaa36a7':
        return 'Ethereum Sepolia'
      case '0x89':
        return 'Polygon'
      case '0x38':
        return 'BNB Chain'
      case '0xa':
        return 'Optimism'
      case '0xa4b1':
        return 'Arbitrum One'
      default:
        return chainId ? `Chain ${chainId}` : 'Unknown Network'
    }
  }

  const shortAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : ''

  const openDashboard = () => {
    setDashboard(true)
    setShowCreateForm(false)
  }

  const createPaymentRequest = async () => {
    if (!description.trim()) {
      showToast('Please enter a description.', 'error')
      return
    }

    if (!amount || Number(amount) <= 0) {
      showToast('Please enter a valid amount.', 'error')
      return
    }

    if (!recipient.trim()) {
      showToast('Please enter the recipient wallet address.', 'error')
      return
    }

    const id = createPaymentId()

    const newPayment: PaymentRequest = {
      id,
      description: description.trim(),
      amount,
      token,
      status: 'Pending',
      created: 'Just now',
      recipient: recipient.trim(),
      paymentUrl: `${window.location.origin}/pay/${id}`,
    }

    try {
      const response = await fetch(`${API_URL}/api/payment-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: newPayment.id,
          description: newPayment.description,
          amount: newPayment.amount,
          token: newPayment.token,
          recipient: newPayment.recipient,
          paymentUrl: newPayment.paymentUrl,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.error || 'Failed to save payment request.'
        )
      }

      setPayments((current) => [newPayment, ...current])

      setDescription('')
      setAmount('')
      setToken('ETH')
      setRecipient('')
      setShowCreateForm(false)

      showToast('Payment request created successfully.', 'success')
    } catch (error) {
      console.error('Failed to save payment request:', error)

      showToast(
        'Could not save the payment request. Make sure the backend server is running on port 4000.',
        'error'
      )
    }
  }

  const copyPaymentLink = async (payment: PaymentRequest) => {
    try {
      await navigator.clipboard.writeText(payment.paymentUrl)

      setCopiedId(payment.id)

      setTimeout(() => {
        setCopiedId('')
      }, 2000)
    } catch (error) {
      console.error('Could not copy payment link:', error)
    }
  }

  const handleTestPayment = async () => {
    if (paying || paymentComplete || !payment) {
      return
    }

    if (!window.ethereum) {
      showToast('MetaMask is not installed in this browser.', 'error')
      return
    }

    if (!address) {
      showToast('Please connect your wallet first.', 'error')
      return
    }

    if (chainId !== '0xaa36a7') {
      showToast('Please switch MetaMask to the Ethereum Sepolia network.', 'error')
      return
    }

    setPaying(true)

    try {
      const amountWei = etherToWeiHex(payment.amount)

      const txHash = (await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [
          {
            from: address,
            to: payment.recipient,
            value: amountWei,
          },
        ],
      })) as string

      setLastTxHash(txHash)

      const response = await fetch(
        `${API_URL}/api/payment-requests/${payment.id}/paid`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            txHash,
            payer: address,
          }),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to record payment.')
      }

      setPaymentComplete(true)
    } catch (error) {
      console.error('Payment failed:', error)
      showToast('Payment failed or was rejected. Please try again.', 'error')
    } finally {
      setPaying(false)
    }
  }

  const payment = paymentId
    ? payments.find((item) => item.id === paymentId)
    : null

  if (paymentId) {
    if (!payment && loadingPayment) {
      return (
        <div className="app">
          {toast && (
            <div className={`toast toast-${toast.type}`}>
              {toast.message}
            </div>
          )}
          <main className="payment-page">
            <div className="payment-card">
              <p>Loading payment...</p>
            </div>
          </main>
        </div>
      )
    }

    if (!payment) {
      return (
        <div className="app">
          {toast && (
            <div className={`toast toast-${toast.type}`}>
              {toast.message}
            </div>
          )}
          <nav className="navbar">
            <div className="brand">PayHub</div>

            <div className="nav-actions">
              {address ? (
                <div className="wallet-pill">
                  <span className="wallet-dot" />
                  <div>
                    <strong>{shortAddress}</strong>
                    <small>{getNetworkName()}</small>
                  </div>
                </div>
              ) : (
                <button
                  className="connect-button"
                  onClick={connectWallet}
                >
                  Connect Wallet
                </button>
              )}
            </div>
          </nav>

          <main className="payment-page">
            <div className="payment-card">
              <div className="payment-icon">!</div>

              <h1>Payment Not Found</h1>

              <p>
                This payment request does not exist or is no longer
                available.
              </p>

              <button
                className="primary-button"
                onClick={() => {
                  window.location.href = '/'
                }}
              >
                Back to PayHub
              </button>
            </div>
          </main>
        </div>
      )
    }

    return (
      <div className="app">
        {toast && (
          <div className={`toast toast-${toast.type}`}>
            {toast.message}
          </div>
        )}
        <nav className="navbar">
          <div className="brand">PayHub</div>

          <div className="nav-actions">
            {address ? (
              <div className="wallet-pill">
                <span className="wallet-dot" />

                <div>
                  <strong>{shortAddress}</strong>
                  <small>{getNetworkName()}</small>
                </div>
              </div>
            ) : (
              <button
                className="connect-button"
                onClick={connectWallet}
              >
                Connect Wallet
              </button>
            )}
          </div>
        </nav>

        <main className="payment-page">
          <div className="payment-card">
            {!paymentComplete ? (
              <>
                <div className="payment-card-header">
                  <span className="eyebrow">PAYMENT REQUEST</span>

                  <h1>{payment.amount} {payment.token}</h1>

                  <p>{payment.description}</p>
                </div>

                <div className="payment-details">
                  <div className="detail-row">
                    <span>Request ID</span>
                    <strong>{payment.id}</strong>
                  </div>

                  <div className="detail-row">
                    <span>Recipient</span>
                    <strong>
                      {payment.recipient.slice(0, 10)}...
                      {payment.recipient.slice(-8)}
                    </strong>
                  </div>

                  <div className="detail-row">
                    <span>Network</span>
                    <strong>
                      {chainId ? getNetworkName() : 'Ethereum Sepolia'}
                    </strong>
                  </div>

                  <div className="detail-row">
                    <span>Status</span>
                    <strong className="status pending">
                      {payment.status}
                    </strong>
                  </div>
                </div>

                {!address ? (
                  <button
                    className="primary-button full-width"
                    onClick={connectWallet}
                  >
                    Connect Wallet to Pay
                  </button>
                ) : (
                  <button
                    className="primary-button full-width"
                    onClick={handleTestPayment}
                    disabled={paying}
                  >
                    {paying
                      ? 'Processing Payment...'
                      : `Pay ${payment.amount} ${payment.token}`}
                  </button>
                )}

                <div className="security-notice">
                  <strong>Secure payment</strong>
                  <span>
                    Payments are processed through your connected
                    wallet.
                  </span>
                </div>

                <div className="test-notice">
                  <strong>Sepolia testnet</strong>
                  <span>
                    This is a real transaction on the Ethereum Sepolia
                    test network. No mainnet funds are involved.
                  </span>
                </div>
              </>
            ) : (
              <div className="payment-success">
                <div className="success-icon">✓</div>

                <span className="eyebrow">PAYMENT COMPLETE</span>

                <h1>Payment Successful</h1>

                <p>
                  Your test payment of{' '}
                  <strong>
                    {payment.amount} {payment.token}
                  </strong>{' '}
                  has been processed.
                </p>

                {lastTxHash && (
                  <div className="transaction-box">
                    <span>Transaction Hash</span>
                    <strong>
                      {lastTxHash.slice(0, 10)}...{lastTxHash.slice(-8)}
                    </strong>
                  </div>
                )}

                <div className="security-notice">
                  <strong>Verified on-chain</strong>
                  <span>
                    This transaction was confirmed on the Ethereum
                    Sepolia network before being marked as paid.
                  </span>
                </div>

                <button
                  className="secondary-button full-width"
                  onClick={() => {
                    window.location.href = '/'
                  }}
                >
                  Back to PayHub
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
    )
  }

  if (dashboard) {
    const totalReceived = payments
      .filter((payment) => payment.status === 'Paid')
      .reduce((total, payment) => total + Number(payment.amount), 0)

    const paidCount = payments.filter(
      (payment) => payment.status === 'Paid'
    ).length

    const successRate =
      payments.length > 0
        ? Math.round((paidCount / payments.length) * 100)
        : 0

    return (
      <div className="app">
        {toast && (
          <div className={`toast toast-${toast.type}`}>
            {toast.message}
          </div>
        )}
        <nav className="navbar">
          <div className="brand">PayHub</div>

          <div className="nav-actions">
            {address ? (
              <div className="wallet-pill">
                <span className="wallet-dot" />

                <div>
                  <strong>{shortAddress}</strong>
                  <small>{getNetworkName()}</small>
                </div>
              </div>
            ) : (
              <button
                className="connect-button"
                onClick={connectWallet}
              >
                Connect Wallet
              </button>
            )}
          </div>
        </nav>

        <main className="dashboard">
          <div className="dashboard-header">
            <div>
              <button
                className="back-button"
                onClick={() => setDashboard(false)}
              >
                ← Back to Home
              </button>

              <h1>Merchant Dashboard</h1>

              <p>
                Create and manage payment requests from one place.
              </p>
            </div>

            <button
              className="primary-button"
              onClick={() => setShowCreateForm(true)}
            >
              + Create Payment Request
            </button>
          </div>

          {showCreateForm && (
            <div className="form-card">
              <div className="form-header">
                <div>
                  <span className="eyebrow">NEW REQUEST</span>
                  <h2>Create Payment Request</h2>
                  <p>
                    Generate a unique payment link for your customer.
                  </p>
                </div>

                <button
                  className="close-button"
                  onClick={() => setShowCreateForm(false)}
                >
                  ×
                </button>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label>Description</label>

                  <input
                    type="text"
                    placeholder="e.g. Website Development"
                    value={description}
                    onChange={(event) =>
                      setDescription(event.target.value)
                    }
                  />
                </div>

                <div className="form-group">
                  <label>Amount</label>

                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0.10"
                    value={amount}
                    onChange={(event) =>
                      setAmount(event.target.value)
                    }
                  />
                </div>

                <div className="form-group">
                  <label>Token</label>

                  <select
                    value={token}
                    onChange={(event) =>
                      setToken(event.target.value)
                    }
                  >
                    <option value="ETH">ETH</option>
                    {/* More tokens (USDC, USDT, etc.) will be added
                        here once multi-token support is implemented. */}
                  </select>
                </div>

                <div className="form-group full-span">
                  <label>Recipient Wallet</label>

                  <input
                    type="text"
                    placeholder="0x..."
                    value={recipient}
                    onChange={(event) =>
                      setRecipient(event.target.value)
                    }
                  />

                  {address && (
                    <button
                      type="button"
                      className="use-wallet-button"
                      onClick={() => setRecipient(address)}
                    >
                      Use connected wallet ({shortAddress})
                    </button>
                  )}
                </div>
              </div>

              <div className="test-notice">
                <strong>Test mode</strong>
                <span>
                  Creating a request does not send funds. The request
                  is saved to your backend database.
                </span>
              </div>

              <div className="form-actions">
                <button
                  className="secondary-button"
                  onClick={() => setShowCreateForm(false)}
                >
                  Cancel
                </button>

                <button
                  className="primary-button"
                  onClick={createPaymentRequest}
                >
                  Create Request
                </button>
              </div>
            </div>
          )}

          <div className="stats-grid">
            <div className="stat-card">
              <span>Total Received</span>
              <strong>{totalReceived.toFixed(2)} ETH</strong>
              <small>From paid requests</small>
            </div>

            <div className="stat-card">
              <span>Payment Requests</span>
              <strong>{payments.length}</strong>
              <small>Total requests created</small>
            </div>

            <div className="stat-card">
              <span>Success Rate</span>
              <strong>{successRate}%</strong>
              <small>Paid requests</small>
            </div>
          </div>

          <div className="table-card">
            <div className="table-header">
              <div>
                <h2>Payment Requests</h2>
                <p>Manage your latest payment links.</p>
              </div>
            </div>

            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Request</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Payment Link</th>
                  </tr>
                </thead>

                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id}>
                      <td>
                        <div className="request-cell">
                          <strong>{payment.description}</strong>
                          <span>{payment.id}</span>
                        </div>
                      </td>

                      <td>
                        <strong>
                          {payment.amount} {payment.token}
                        </strong>
                      </td>

                      <td>
                        <span
                          className={`status ${
                            payment.status === 'Paid'
                              ? 'paid'
                              : 'pending'
                          }`}
                        >
                          {payment.status}
                        </span>
                      </td>

                      <td>{payment.created}</td>

                      <td>
                        <button
                          className="copy-button"
                          onClick={() =>
                            copyPaymentLink(payment)
                          }
                        >
                          {copiedId === payment.id
                            ? 'Copied!'
                            : 'Copy Link'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="app">
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      )}
      <nav className="navbar">
        <div className="brand">PayHub</div>

        <div className="nav-actions">
          {address ? (
            <div className="wallet-pill">
              <span className="wallet-dot" />

              <div>
                <strong>{shortAddress}</strong>
                <small>{getNetworkName()}</small>
              </div>
            </div>
          ) : (
            <button
              className="connect-button"
              onClick={connectWallet}
            >
              Connect Wallet
            </button>
          )}
        </div>
      </nav>

      <main className="hero">
        <div className="hero-content">
          <span className="eyebrow">WEB3 PAYMENTS</span>

          <h1>
            Accept crypto payments
            <br />
            <span>with a simple link.</span>
          </h1>

          <p>
            Create payment requests, share them with customers, and
            manage your payments from one simple dashboard.
          </p>

          <div className="hero-actions">
            <button
              className="primary-button"
              onClick={openDashboard}
            >
              Open Merchant Dashboard
            </button>

            {!address && (
              <button
                className="secondary-button"
                onClick={connectWallet}
              >
                Connect Wallet
              </button>
            )}
          </div>

          <div className="feature-grid">
            <div className="feature-card">
              <div className="feature-icon">↗</div>
              <h3>Payment Links</h3>
              <p>
                Create unique payment links for every customer or
                transaction.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">◈</div>
              <h3>Wallet Ready</h3>
              <p>
                Connect MetaMask and interact with your Web3 payment
                experience.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">✓</div>
              <h3>Track Payments</h3>
              <p>
                Keep payment requests organized with clear status
                tracking.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default App

