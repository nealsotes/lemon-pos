using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;
using PosSystem.Core.Interfaces;
using PosSystem.Infrastructure.Services;

namespace PosSystem.Tests;

/// <summary>
/// The printed receipt must render each line item's temperature INDEPENDENTLY: a "cold" line
/// prints " (Iced)", a "hot" line prints " (hot)", and a line with no temperature prints
/// neither — even when an earlier line on the same receipt HAD a temperature. This is the
/// exact code path that produces the paper on desktop (ReceiptData -> ESC/POS bytes via
/// PrintService.BuildEscPosCommandsAsBytes), so it guards the reported
/// "second Latte duplicates the first Latte's (Iced)" receipt bug.
/// </summary>
public class PrintServiceTemperatureTests
{
    /// <summary>Thermal paper width these receipts are formatted for.</summary>
    private const int ColumnWidth = 32;

    private static string RenderReceipt(params ReceiptItem[] items)
    {
        var service = new PrintService(Mock.Of<IConfiguration>(), Mock.Of<ILogger<PrintService>>());
        var receipt = new ReceiptData
        {
            ReceiptNumber = "1",
            PaymentMethod = "cash",
            Items = items.ToList()
        };

        // Decode with Latin1 so ESC/POS control bytes round-trip and the ASCII item text
        // (including "(Iced)" / "(hot)") stays searchable.
        var bytes = service.BuildEscPosCommandsAsBytes(receipt, openDrawer: false);
        return Encoding.Latin1.GetString(bytes);
    }

    [Fact]
    public void IcedThenNoTemperature_PrintsIcedExactlyOnce()
    {
        // The exact scenario from the reported receipt: two Lattes, first Iced, second no temperature.
        var text = RenderReceipt(
            new ReceiptItem { Name = "Latte", Quantity = 1, Price = 150m, Temperature = "cold" },
            new ReceiptItem { Name = "Latte", Quantity = 1, Price = 150m, Temperature = null });

        // "(Iced)" belongs to the first line only — it must not bleed onto the second.
        Assert.Equal(1, Count(text, "(Iced)"));
    }

    [Fact]
    public void MixedTemperatures_RenderEachLineIndependently()
    {
        var text = RenderReceipt(
            new ReceiptItem { Name = "Latte", Quantity = 1, Price = 150m, Temperature = "cold" },
            new ReceiptItem { Name = "Americano", Quantity = 1, Price = 120m, Temperature = "hot" },
            new ReceiptItem { Name = "Cookie", Quantity = 1, Price = 90m, Temperature = null });

        Assert.Equal(1, Count(text, "(Iced)"));
        Assert.Equal(1, Count(text, "(hot)"));
    }

    [Fact]
    public void NoTemperatures_PrintNoTemperatureLabels()
    {
        var text = RenderReceipt(
            new ReceiptItem { Name = "Cookie", Quantity = 2, Price = 90m, Temperature = null },
            new ReceiptItem { Name = "Water", Quantity = 1, Price = 30m, Temperature = null });

        Assert.Equal(0, Count(text, "(Iced)"));
        Assert.Equal(0, Count(text, "(hot)"));
    }

    [Fact]
    public void EachItemStartsOnItsOwnLine()
    {
        // Regression guard for the reported bug: FormatItemLineDetailed used to return a line
        // with no trailing newline, so consecutive items concatenated into one long string and
        // the printer hard-wrapped mid-item. On paper that puts the first item's "(Iced)" on the
        // second item's physical line.
        var text = RenderReceipt(
            new ReceiptItem { Name = "Caramel Macchiato", Quantity = 1, Price = 150m, Temperature = "cold" },
            new ReceiptItem { Name = "Caramel Macchiato", Quantity = 1, Price = 150m, Temperature = null });

        var itemLines = PrintableLines(text).Where(l => l.Contains("Caramel")).ToList();

        Assert.Equal(2, itemLines.Count);
        Assert.Single(itemLines.Where(l => l.Contains("(Iced)")));
    }

    [Fact]
    public void RealisticProductNames_DoNotOverflowThePaperWidth()
    {
        // The other tests use "Latte" (5 chars). Real menu items are much longer, and the
        // assembled line is name + temperature label + " xN" + price — which must still fit
        // the paper, or the overflow wraps onto the following line.
        var text = RenderReceipt(
            new ReceiptItem { Name = "Caramel Macchiato", Quantity = 1, Price = 150m, Temperature = "cold" },
            new ReceiptItem { Name = "Caramel Macchiato", Quantity = 1, Price = 150m, Temperature = null });

        var overflowing = PrintableLines(text).Where(l => l.Length > ColumnWidth).ToList();

        Assert.True(
            overflowing.Count == 0,
            $"Lines exceeding {ColumnWidth} columns will wrap on paper:{Environment.NewLine}" +
            string.Join(Environment.NewLine, overflowing.Select(l => $"  [{l.Length}] {l}")));
    }

    /// <summary>
    /// Split the ESC/POS byte stream into printable text lines. ESC/GS command sequences are
    /// removed first: their parameter bytes ('!', 'a', 'V', …) are printable ASCII, so filtering
    /// on char.IsControl alone would leave them behind and overstate each line's width.
    /// </summary>
    private static IEnumerable<string> PrintableLines(string escPos)
    {
        const string Esc = "";
        const string Gs = "";

        var stripped = Regex.Replace(escPos, Esc + "(?:[!adR].|@|p.{3})", string.Empty, RegexOptions.Singleline);
        stripped = Regex.Replace(stripped, Gs + "(?:V.{1,2}|[!B].)", string.Empty, RegexOptions.Singleline);

        return stripped
            .Split('\n')
            .Select(line => new string(line.Where(c => !char.IsControl(c)).ToArray()))
            .Where(line => line.Length > 0);
    }

    private static int Count(string haystack, string needle)
    {
        int count = 0, i = 0;
        while ((i = haystack.IndexOf(needle, i, StringComparison.Ordinal)) >= 0)
        {
            count++;
            i += needle.Length;
        }
        return count;
    }
}
