namespace SPS.Application.DTOs;

public record FileDto(Guid Id, string OriginalFileName, string BlobPath, DateTime UploadedTimestamp, string? Secret = null, string? SecureLink = null);

public record ResetSecretRequest(string NewSecret);
