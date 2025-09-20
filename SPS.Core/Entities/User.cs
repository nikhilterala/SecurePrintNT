namespace SPS.Core.Entities;

public record User(Guid Id, string Email, string PasswordHash, string Role);
