namespace SPS.Core.Entities;

public record File(Guid Id, Guid OwnerUserId, string BlobPath, string OriginalFileName, string? SecretHash, bool AllowDirectAccess, DateTime UploadedTimestamp);
