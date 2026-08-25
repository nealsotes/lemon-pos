using System.Text;
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
