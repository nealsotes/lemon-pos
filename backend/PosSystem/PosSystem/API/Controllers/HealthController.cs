using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Hosting;

namespace PosSystem.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class HealthController : ControllerBase
{
    private readonly IWebHostEnvironment _environment;

    public HealthController(IWebHostEnvironment environment)
    {
        _environment = environment;
    }

    [HttpGet]
    public IActionResult Get()
    {
        return Ok(new { status = "online", timestamp = DateTime.UtcNow });
    }

    [HttpGet("build-info")]
    public IActionResult GetBuildInfo()
    {
        var wwwrootPath = _environment.WebRootPath ?? Path.Combine(_environment.ContentRootPath, "wwwroot");
        var buildInfoPath = Path.Combine(wwwrootPath, "build-info.txt");
        
        if (System.IO.File.Exists(buildInfoPath))
        {
            var buildInfo = System.IO.File.ReadAllText(buildInfoPath);
            return Ok(new 
            { 
                buildInfo = buildInfo,
                wwwrootPath = wwwrootPath,
                buildInfoExists = true
            });
        }
        
        return Ok(new 
        { 
            buildInfo = "Build info file not found",
            wwwrootPath = wwwrootPath,
            buildInfoExists = false,
            message = "Frontend may not have been built or deployed correctly"
        });
    }

    [HttpGet("file-versions")]
    public IActionResult GetFileVersions()
    {
        var wwwrootPath = _environment.WebRootPath ?? Path.Combine(_environment.ContentRootPath, "wwwroot");
        var files = new Dictionary<string, object>();
        
        if (Directory.Exists(wwwrootPath))
        {
            var jsFiles = Directory.GetFiles(wwwrootPath, "*.js", SearchOption.TopDirectoryOnly);
            var cssFiles = Directory.GetFiles(wwwrootPath, "*.css", SearchOption.TopDirectoryOnly);
            var htmlFiles = Directory.GetFiles(wwwrootPath, "*.html", SearchOption.TopDirectoryOnly);
            
            foreach (var file in jsFiles.Concat(cssFiles).Concat(htmlFiles))
            {
                var fileName = Path.GetFileName(file);
                var fileInfo = new FileInfo(file);
                files[fileName] = new
                {
                    size = fileInfo.Length,
                    lastModified = fileInfo.LastWriteTimeUtc,
                    hash = ComputeFileHash(file)
                };
            }
        }
        
        return Ok(new
        {
            wwwrootPath = wwwrootPath,
            fileCount = files.Count,
            files = files,
            timestamp = DateTime.UtcNow
        });
    }

    private string ComputeFileHash(string filePath)
    {
        using (var md5 = System.Security.Cryptography.MD5.Create())
        {
            using (var stream = System.IO.File.OpenRead(filePath))
            {
                var hash = md5.ComputeHash(stream);
                return BitConverter.ToString(hash).Replace("-", "").ToLowerInvariant().Substring(0, 8);
            }
        }
    }
}




