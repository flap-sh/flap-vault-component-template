export const actionGalleryExampleVaultAbi = [
  {
    type: "function",
    name: "galleryState",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "totalReserved", type: "uint256" },
          { name: "available", type: "uint256" },
          { name: "claimableRewards", type: "uint256" },
          { name: "refundable", type: "uint256" },
          { name: "deadline", type: "uint48" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "positionOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "reserved", type: "uint256" },
          { name: "claimed", type: "uint256" },
          { name: "refunded", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "reserve",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "claimRewards",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "requestRefund",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
] as const;
