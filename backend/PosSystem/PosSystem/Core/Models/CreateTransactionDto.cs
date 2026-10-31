namespace PosSystem.Core.Models;

/// <summary>
/// Write model for POST /api/transactions (roadmap item 2, RC-09).
///
/// The controller used to bind the <see cref="Transaction"/> domain entity directly,
/// which let the caller drive every money field: item prices, per-line discounts,
/// the total, and even the stored status. This DTO accepts only the facts of the
/// sale. Everything monetary is resolved server-side from the catalog:
/// - item price = the product's price for the chosen temperature
/// - add-on prices = the product's configured add-ons (unknown names → 400)
/// - line/total money recomputed by <c>TransactionService</c>; nothing the client
///   sends as a price or total is trusted
/// - Status is forced to "completed" (a POST /transactions is a completed, paid
///   sale; "pending" is a client-side local queue marker, not a stored state).
///
/// Wire compatibility: the checkout frontend's existing create payload binds with
/// the same field names; extra fields the client still sends (timestamp, total,
/// item name/category/price/basePrice) are ignored by the server, not trusted.
/// </summary>
public class CreateTransactionDto
{
    /// <summary>Stable per-sale key for replay dedupe. Header wins over body.</summary>
    public string? IdempotencyKey { get; set; }

    /// <summary>
    /// The moment the sale was actually rung up, sent by the offline replay when a
    /// queued sale syncs (offline spec §7.1). Absent on online sales — the server
    /// stamps <see cref="DateTime.UtcNow"/>. Validated server-side: rejected when in
    /// the future or older than the configured backdate window.
    /// </summary>
    public DateTime? OccurredAt { get; set; }

    public List<TransactionItemWriteDto> Items { get; set; } = new();

    public string PaymentMethod { get; set; } = string.Empty;

    public ServiceType ServiceType { get; set; } = ServiceType.DineIn;

    public decimal ServiceFee { get; set; }

    public CustomerInfo? CustomerInfo { get; set; }

    public string? Notes { get; set; }

    public decimal AmountReceived { get; set; }

    public decimal Change { get; set; }
}

/// <summary>
/// One cart line. Only <c>ProductId</c>, <c>Quantity</c>, <c>Temperature</c>, the
/// add-on selection (names + counts) and the discount are facts of the sale; the
/// money fields ride along for wire compatibility and are resolved from the catalog.
/// <c>Quantity</c> counts how many units this one variant holds; an add-on belongs
/// to each unit of the line (its money scales with the line quantity).
/// </summary>
public class TransactionItemWriteDto
{
    public string ProductId { get; set; } = string.Empty;

    public int Quantity { get; set; }

    public Temperature Temperature { get; set; } = Temperature.None;

    public List<AddOn>? AddOns { get; set; }

    public DiscountInfo? Discount { get; set; }

    // Wire-compatibility fields the checkout sends; server-ignored.
    public string? Name { get; set; }
    public string? Category { get; set; }
    public decimal? Price { get; set; }
    public decimal? BasePrice { get; set; }
}