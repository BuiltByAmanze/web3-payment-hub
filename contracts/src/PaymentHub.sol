 // SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PaymentHub {
    struct PaymentRequest {
        address payable merchant;
        uint256 amount;
        bool paid;
        address payer;
        uint256 paidAt;
    }

    mapping(bytes32 => PaymentRequest) public paymentRequests;

    event PaymentRequestCreated(
        bytes32 indexed requestId,
        address indexed merchant,
        uint256 amount
    );

    event PaymentReceived(
        bytes32 indexed requestId,
        address indexed payer,
        address indexed merchant,
        uint256 amount,
        uint256 paidAt
    );

    function createPaymentRequest(
        bytes32 requestId,
        uint256 amount
    ) external {
        require(requestId != bytes32(0), "Invalid request ID");
        require(amount > 0, "Amount must be greater than zero");
        require(
            paymentRequests[requestId].merchant == address(0),
            "Request already exists"
        );

        paymentRequests[requestId] = PaymentRequest({
            merchant: payable(msg.sender),
            amount: amount,
            paid: false,
            payer: address(0),
            paidAt: 0
        });

        emit PaymentRequestCreated(
            requestId,
            msg.sender,
            amount
        );
    }

    function pay(bytes32 requestId) external payable {
        PaymentRequest storage request = paymentRequests[requestId];

        require(
            request.merchant != address(0),
            "Payment request not found"
        );
        require(!request.paid, "Payment already completed");
        require(msg.value == request.amount, "Incorrect payment amount");

        request.paid = true;
        request.payer = msg.sender;
        request.paidAt = block.timestamp;

        (bool success, ) = request.merchant.call{value: msg.value}("");
        require(success, "Payment transfer failed");

        emit PaymentReceived(
            requestId,
            msg.sender,
            request.merchant,
            msg.value,
            block.timestamp
        );
    }

    function getPaymentRequest(
        bytes32 requestId
    )
        external
        view
        returns (
            address merchant,
            uint256 amount,
            bool paid,
            address payer,
            uint256 paidAt
        )
    {
        PaymentRequest memory request = paymentRequests[requestId];

        return (
            request.merchant,
            request.amount,
            request.paid,
            request.payer,
            request.paidAt
        );
    }
}
