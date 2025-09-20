
public interface IFileStorageService
{
    Task<string> UploadFileAsync(Stream fileStream, string blobPath, string contentType);
    Task<Stream> DownloadFileAsync(string blobPath);
    string GenerateSasUrl(string blobPath, DateTimeOffset expiry);
    Task DeleteFileAsync(string blobPath);
}
