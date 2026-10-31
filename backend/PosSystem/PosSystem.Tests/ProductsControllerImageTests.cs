using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using PosSystem.API.Controllers;
using PosSystem.Core.Interfaces;
using Xunit;

namespace PosSystem.Tests;

/// <summary>
/// RC-05: the anonymous product-image route must never serve anything outside
/// &lt;webroot&gt;/uploads. Traversal attempts — plain, backslashed, and percent-encoded
/// (the routing pipeline URL-decodes before the value arrives) — must 404, the
/// extension whitelist holds, and a legit upload still serves.
/// </summary>
public class ProductsControllerImageTests : IDisposable
{
    private readonly string _webRoot;
    private readonly ProductsController _controller;

    public ProductsControllerImageTests()
    {
        _webRoot = Path.Combine(Path.GetTempPath(), "lp-rc05-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.Combine(_webRoot, "uploads"));
        File.WriteAllBytes(Path.Combine(_webRoot, "uploads", "legit.png"), new byte[] { 1, 2, 3 });
        File.WriteAllText(Path.Combine(_webRoot, "appsettings.json"), "{ \"keep\": \"secret\" }");

        var environment = new Mock<IWebHostEnvironment>();
        environment.SetupGet(e => e.WebRootPath).Returns(_webRoot);

        var requestServices = new ServiceCollection()
            .AddSingleton(environment.Object)
            .BuildServiceProvider();

        _controller = new ProductsController(
            new Mock<IProductService>().Object,
            new Mock<IFileService>().Object,
            new Mock<IExportService>().Object,
            new Mock<IImportService>().Object,
            new Mock<IReportingService>().Object);
        _controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { RequestServices = requestServices }
        };
    }

    public void Dispose()
    {
        try { Directory.Delete(_webRoot, recursive: true); } catch { /* best effort */ }
    }

    [Fact]
    public void GetImage_LegitUpload_ServesWithTheOriginalContentTypeMapping()
    {
        var result = Assert.IsType<PhysicalFileResult>(_controller.GetImage("legit.png"));

        Assert.Equal("image/png", result.ContentType);
        Assert.Equal(Path.Combine(_webRoot, "uploads", "legit.png"), result.FileName);
    }

    [Theory]
    [InlineData("../appsettings.json")]
    [InlineData("..\\appsettings.json")]
    [InlineData("../uploads/../../appsettings.json")]
    [InlineData("%2e%2e%2fappsettings.json")]
    [InlineData("..%2fappsettings.json")]
    [InlineData("..")]
    [InlineData(".")]
    [InlineData("secret.txt")]
    [InlineData("appsettings.json")]
    [InlineData("ghost.png")]
    public void GetImage_TraversalAndNonImageAttempts_Return404(string fileName)
    {
        Assert.IsType<NotFoundResult>(_controller.GetImage(fileName));
    }

    [Theory]
    [InlineData("../appsettings.json")]
    [InlineData("..\\appsettings.json")]
    [InlineData("appsettings.json/../../../../etc/passwd")]
    [InlineData("%2e%2e%2fappsettings.json")]
    [InlineData("..%2fappsettings.json")]
    [InlineData("%2e%2e/appsettings.json")]
    public void ResolveUploadFilePath_NeverEscapesTheUploadsDirectory(string fileName)
    {
        var resolved = ProductsController.ResolveUploadFilePath(_webRoot, fileName);

        if (resolved != null)
        {
            // Even if a candidate resolves, it must live under uploads.
            var uploadsRoot = Path.GetFullPath(Path.Combine(_webRoot, "uploads"));
            var relative = Path.GetRelativePath(uploadsRoot, resolved);
            Assert.False(relative.StartsWith("..", StringComparison.Ordinal), $"escape via '{fileName}'");
            Assert.True(File.Exists(resolved));
        }
    }

    [Fact]
    public void ResolveUploadFilePath_LegitFile_ResolvesInsideUploads()
    {
        var resolved = ProductsController.ResolveUploadFilePath(_webRoot, "legit.png");

        Assert.Equal(Path.Combine(_webRoot, "uploads", "legit.png"), resolved);
    }

    [Fact]
    public void ResolveUploadFilePath_EnforcesTheExtensionWhitelist()
    {
        var resolved = ProductsController.ResolveUploadFilePath(_webRoot, "legit.png");
        Assert.NotNull(resolved);

        // The whitelist is kept: non-image uploads are not served (404) even inside uploads.
        File.WriteAllText(Path.Combine(_webRoot, "uploads", "notes.txt"), "not an image");
        Assert.Null(ProductsController.ResolveUploadFilePath(_webRoot, "notes.txt"));
    }

    [Fact]
    public void ResolveUploadFilePath_BlankFileName_IsRejected()
    {
        Assert.Null(ProductsController.ResolveUploadFilePath(_webRoot, ""));
        Assert.Null(ProductsController.ResolveUploadFilePath(_webRoot, "   "));
    }
}