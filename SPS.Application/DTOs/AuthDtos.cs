namespace SPS.Application.DTOs;

public record RegisterRequest(string Email, string Password);
public record LoginRequest(string Email, string Password);
public record LoginResponse(string JwtToken);

public record RefreshTokenRequest(string ExpiredToken);
public record RefreshTokenResponse(string NewJwtToken, DateTime Expiry);
