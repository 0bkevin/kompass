// Preserve delivery history without exposing removed connector metadata.
export function publicPublicationReceipt(receipt) {
  if (!receipt || receipt.provider === "webhook") return receipt;
  return { provider: "legacy", publishedAt: receipt.publishedAt };
}
