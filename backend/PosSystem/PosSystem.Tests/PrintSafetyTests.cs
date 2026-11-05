using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Moq;
using PosSystem.API.Controllers;
using PosSystem.Core.Interfaces;
using PosSystem.Infrastructure.Services;
using Xunit;

namespace PosSystem.Tests;

public class PrintSafetyTests
{
    [Theory]
    [InlineData(typeof(PrintController), "PrintReceipt")]
    [InlineData(typeof(IPrintService), "PrintReceiptAsync")]
    [InlineData(typeof(PrintService), "PrintReceiptAsync")]
    public void Receipt_DefaultOpenDrawer_IsFalse(Type type, string methodName)
    {
        // Arrange
        var parameter = type.GetMethod(methodName)!.GetParameters().Single(p => p.Name == "openDrawer");

        // Act / Assert
        Assert.True(parameter.HasDefaultValue);
        Assert.Equal(false, parameter.DefaultValue);
    }

    [Theory]
    [InlineData("receipt", "Receipt submitted to printer")]
    [InlineData("drawer", "Cash drawer command submitted to printer")]
    [InlineData("test", "Test receipt submitted to printer: Test printer")]
    public async Task SuccessfulSubmission_ReturnsHonestMessageWithOriginalShape(string operation, string expectedMessage)
    {
        // Arrange
        var service = new Mock<IPrintService>(MockBehavior.Strict);
        var receipt = new ReceiptData();
        service.Setup(s => s.PrintReceiptAsync(receipt, false)).ReturnsAsync(true);
        service.Setup(s => s.OpenCashDrawerAsync("Test printer")).ReturnsAsync(true);
        service.Setup(s => s.GetAvailablePrintersAsync()).ReturnsAsync(new List<string> { "Test printer" });
        service.Setup(s => s.TestPrintAsync("Test printer")).ReturnsAsync(true);
        var controller = new PrintController(service.Object, Mock.Of<ILogger<PrintController>>());

        // Act
        var result = operation switch
        {
            "receipt" => await controller.PrintReceipt(receipt),
            "drawer" => await controller.OpenCashDrawer("Test printer"),
            _ => await controller.TestPrint("Test printer")
        };

        // Assert
        var payload = System.Text.Json.JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(result).Value);
        Assert.Equal(new[] { "message", "success" }, payload.EnumerateObject().Select(p => p.Name).OrderBy(n => n));
        Assert.True(payload.GetProperty("success").GetBoolean());
        Assert.Equal(expectedMessage, payload.GetProperty("message").GetString());
    }

    [Theory]
    [InlineData("service")]
    [InlineData("interface")]
    [InlineData("test")]
    public async Task ReceiptSubmission_Defaults_ContainNoDrawerKick(string entryPoint)
    {
        // Arrange: all OS transports are replaced; no installed printer lookup or hardware access.
        var service = new CapturingPrintService();

        // Act
        var success = entryPoint switch
        {
            "service" => await service.PrintReceiptAsync(new ReceiptData()),
            "interface" => await ((IPrintService)service).PrintReceiptAsync(new ReceiptData()),
            _ => await service.TestPrintAsync("Test printer")
        };

        // Assert
        Assert.True(success);
        var job = Assert.Single(service.Jobs);
        Assert.Equal("Test printer", job.PrinterName);
        AssertNoDrawerKick(job.Data);
        Assert.Equal(new byte[] { 0x1B, 0x40 }, job.Data.Take(2));
        Assert.Equal(new byte[] { 0x1D, 0x56, 0x41, 0x03 }, job.Data.TakeLast(4));
    }

    [Fact]
    public async Task OpenCashDrawer_ExplicitRequest_PreservesExistingRawCommands()
    {
        // Arrange
        var service = new CapturingPrintService();

        // Act
        var success = await service.OpenCashDrawerAsync("Explicit printer");

        // Assert: keep existing pin 2 and pin 5 behavior; no hardware model is assumed.
        Assert.True(success);
        var job = Assert.Single(service.Jobs);
        Assert.Equal("Explicit printer", job.PrinterName);
        Assert.Equal(new byte[] { 0x1B, 0x70, 0x00, 0x32, 0xFA, 0x1B, 0x70, 0x01, 0x32, 0xFA }, job.Data);
    }

    [Fact]
    public async Task PrintReceipt_ExplicitOpenDrawer_PreservesOptIn()
    {
        // Arrange
        var service = new CapturingPrintService();
        var receipt = new ReceiptData();
        var withoutKick = service.BuildEscPosCommandsAsBytes(receipt, false);

        // Act
        Assert.True(await service.PrintReceiptAsync(receipt, true));

        // Assert: the only extra bytes are the existing drawer commands after initialization.
        var data = Assert.Single(service.Jobs).Data;
        Assert.Equal(new byte[] { 0x1B, 0x70, 0x00, 0x32, 0xFA, 0x1B, 0x70, 0x01, 0x32, 0xFA }, data.Skip(2).Take(10));
        Assert.Equal(withoutKick, data.Take(2).Concat(data.Skip(12)));
    }

    [Theory]
    [InlineData("receipt")]
    [InlineData("drawer")]
    [InlineData("test")]
    public async Task Submission_TransportRejects_ReturnsFalse(string operation)
    {
        // Arrange
        var service = new CapturingPrintService { SubmissionResult = false };

        // Act
        var success = operation switch
        {
            "receipt" => await service.PrintReceiptAsync(new ReceiptData()),
            "drawer" => await service.OpenCashDrawerAsync(),
            _ => await service.TestPrintAsync()
        };

        // Assert
        Assert.False(success);
        Assert.Single(service.Jobs);
    }

    [Theory]
    [InlineData("receipt")]
    [InlineData("drawer")]
    [InlineData("test")]
    public async Task Submission_ServiceRejects_ReturnsBadRequestWithOriginalShape(string operation)
    {
        // Arrange
        var service = new Mock<IPrintService>(MockBehavior.Strict);
        var receipt = new ReceiptData();
        service.Setup(s => s.PrintReceiptAsync(receipt, false)).ReturnsAsync(false);
        service.Setup(s => s.OpenCashDrawerAsync("Test printer")).ReturnsAsync(false);
        service.Setup(s => s.GetAvailablePrintersAsync()).ReturnsAsync(new List<string> { "Test printer" });
        service.Setup(s => s.TestPrintAsync("Test printer")).ReturnsAsync(false);
        var controller = new PrintController(service.Object, Mock.Of<ILogger<PrintController>>());

        // Act
        var result = operation switch
        {
            "receipt" => await controller.PrintReceipt(receipt),
            "drawer" => await controller.OpenCashDrawer("Test printer"),
            _ => await controller.TestPrint("Test printer")
        };

        // Assert
        var payload = System.Text.Json.JsonSerializer.SerializeToElement(Assert.IsType<BadRequestObjectResult>(result).Value);
        Assert.Equal(new[] { "message", "success" }, payload.EnumerateObject().Select(p => p.Name).OrderBy(n => n));
        Assert.False(payload.GetProperty("success").GetBoolean());
        Assert.False(string.IsNullOrWhiteSpace(payload.GetProperty("message").GetString()));
    }

    private static void AssertNoDrawerKick(byte[] data)
    {
        // Detect every ESC p variant, rather than just one pin/pulse combination.
        for (var i = 0; i < data.Length - 1; i++)
        {
            Assert.False(data[i] == 0x1B && data[i + 1] == 0x70, $"Unexpected drawer kick at byte {i}");
        }
    }

    private sealed class CapturingPrintService : PrintService
    {
        public List<(string PrinterName, byte[] Data)> Jobs { get; } = new();
        public bool SubmissionResult { get; set; } = true;

        public CapturingPrintService()
            : base(new Microsoft.Extensions.Configuration.ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?> { ["Printer:Name"] = "Test printer" })
                .Build(), Mock.Of<ILogger<PrintService>>())
        {
        }

        internal override Task<bool> PrintRawWindowsAsync(string printerName, byte[] data) => Capture(printerName, data);
        internal override Task<bool> PrintRawLinuxAsync(string printerName, byte[] data) => Capture(printerName, data);
        internal override Task<bool> PrintRawMacAsync(string printerName, byte[] data) => Capture(printerName, data);

        private Task<bool> Capture(string printerName, byte[] data)
        {
            Jobs.Add((printerName, data.ToArray()));
            return Task.FromResult(SubmissionResult);
        }
    }

    [Fact]
    public async Task PrintReceipt_OmittedOpenDrawer_ForwardsFalse()
    {
        // Arrange
        var service = new Mock<IPrintService>(MockBehavior.Strict);
        var receipt = new ReceiptData();
        service.Setup(s => s.PrintReceiptAsync(receipt, false)).ReturnsAsync(true);
        var controller = new PrintController(service.Object, Mock.Of<ILogger<PrintController>>());

        // Act
        var result = await controller.PrintReceipt(receipt);

        // Assert
        Assert.IsType<OkObjectResult>(result);
        service.Verify(s => s.PrintReceiptAsync(receipt, false), Times.Once);
        service.VerifyNoOtherCalls();
    }
}
