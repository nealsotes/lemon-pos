namespace PosSystem.Core.Time;

/// <summary>
/// The single source of truth for how backend clock time maps to the store's
/// business days (roadmap item 2, OT-01).
///
/// Sales and stock movements are stored with UTC timestamps (AGENTS.md convention),
/// but the shop trades in the Philippines, where a 07:00 wall-clock sale is 23:00
/// UTC the previous instant-day. Bucketing reports by <c>Timestamp.Date</c> used to
/// file every PH-morning sale into yesterday. All day windows and day buckets in the
/// reporting path go through this class so "a day" means one PH calendar date.
///
/// PHT is UTC+8 with no DST, so a fixed offset is exact — <see cref="TimeZoneInfo"/>
/// would add lookup cost without adding correctness for a single-store PH deployment.
///
/// Window conventions (documented because the pre-fix layers disagreed):
/// - <b>Sale transactions</b>: <c>TransactionRepository.GetByDateRangeAsync</c> takes an
///   exact half-open UTC window <c>[start, endExclusive)</c>.
/// - <b>Movements, lots and expenses</b>: their repositories compare with an inclusive
///   end (<c>&lt;=</c>); callers hand them the same window with
///   <c>endExclusive.AddTicks(-1)</c>. The half-open form is the canonical one; the
///   tick-subtracted form only exists at those three call boundaries.
/// </summary>
public static class PhilippineTime
{
    public const int UtcOffsetHours = 8;

    public static readonly TimeSpan UtcOffset = TimeSpan.FromHours(UtcOffsetHours);

    /// <summary>
    /// Today as a Philippine wall date — the calendar date a PH owner would call
    /// "today" on the reports page.
    /// </summary>
    public static DateTime Today => ToWall(DateTime.UtcNow).Date;

    /// <summary>UTC instant → PH wall clock (unspecified kind, safe for .Date bucketing and display).</summary>
    public static DateTime ToWall(DateTime utc) => DateTime.SpecifyKind(utc + UtcOffset, DateTimeKind.Unspecified);

    /// <summary>PH wall clock → UTC instant. The inverse of <see cref="ToWall"/>.</summary>
    public static DateTime ToUtc(DateTime wall) => DateTime.SpecifyKind(wall - UtcOffset, DateTimeKind.Utc);

    /// <summary>
    /// One Philippine calendar date as the canonical UTC half-open window
    /// <c>[startUtc, endUtcExclusive)</c> covering exactly that business day.
    /// </summary>
    public static (DateTime StartUtc, DateTime EndUtcExclusive) DayUtc(DateTime wallDay)
    {
        var day = wallDay.Date;
        return (ToUtc(day), ToUtc(day.AddDays(1)));
    }
}