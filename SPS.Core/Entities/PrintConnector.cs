namespace SPS.Core.Entities;

public record PrintConnector(Guid Id, Guid OwnerUserId, string MachineName, DateTime PairedTimestamp, DateTime LastActivity, bool IsActive);
