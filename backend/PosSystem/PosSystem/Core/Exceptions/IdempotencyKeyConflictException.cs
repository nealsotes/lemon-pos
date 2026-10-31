namespace PosSystem.Core;

/// <summary>
/// Thrown when a sale is submitted with an idempotency key that is already bound to a
/// different transaction payload (same key, different contents). The caller must not
/// overwrite the stored sale; resolve by picking a fresh key or matching the payload.
/// </summary>
public class IdempotencyKeyConflictException : Exception
{
    public IdempotencyKeyConflictException(string message, int existingTransactionId)
        : base(message)
    {
        ExistingTransactionId = existingTransactionId;
    }

    public int ExistingTransactionId { get; }
}