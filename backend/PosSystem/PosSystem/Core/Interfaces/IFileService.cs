namespace PosSystem.Core.Interfaces;

public interface IFileService
{
    Task<string> SaveImageAsync(byte[] imageData, string fileName);
    Task<bool> DeleteImageAsync(string imagePath);
    string GetImageUrl(string imagePath);
} 