namespace SPS.Core.Entities;

public record PrintJob(Guid Id, Guid FileId, Guid SenderUserId, string Status, string SecureLinkToken, DateTime ExpiryTimestamp);
