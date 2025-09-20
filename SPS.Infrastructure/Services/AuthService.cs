using BCrypt.Net;
using Microsoft.EntityFrameworkCore;
using SPS.Application.DTOs;
using SPS.Application.Services;
using SPS.Core.Entities;
using SPS.Infrastructure.Persistence;

namespace SPS.Infrastructure.Services;

public class AuthService : IAuthService
{
    private readonly SpsDbContext _context;
    private readonly JwtTokenGenerator _jwtTokenGenerator;

    public AuthService(SpsDbContext context, JwtTokenGenerator jwtTokenGenerator)
    {
        _context = context;
        _jwtTokenGenerator = jwtTokenGenerator;
    }

    public async Task<LoginResponse> RegisterAsync(RegisterRequest request)
    {
        if (await _context.Users.AnyAsync(u => u.Email == request.Email))
        {
            throw new ArgumentException("User with this email already exists.");
        }

        var passwordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);
        var user = new User(Guid.NewGuid(), request.Email, passwordHash, "User");

        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        var token = _jwtTokenGenerator.GenerateToken(user); 
        return new LoginResponse(token);
    }

    public async Task<LoginResponse> LoginAsync(LoginRequest request)
    {
        var user = await _context.Users.SingleOrDefaultAsync(u => u.Email == request.Email);

        if (user == null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
        {
            throw new UnauthorizedAccessException("Invalid credentials.");
        }

        var token = _jwtTokenGenerator.GenerateToken(user);
        return new LoginResponse(token);
    }

    public async Task<RefreshTokenResponse> RefreshTokenAsync(RefreshTokenRequest request)
    {
        // Validate the expired token to get the principal (user claims)
        var principal = _jwtTokenGenerator.GetPrincipalFromToken(request.ExpiredToken);

        if (principal == null)
        {
            throw new UnauthorizedAccessException("Invalid or expired token for refresh.");
        }

        var userIdClaim = principal.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
        if (userIdClaim == null || !Guid.TryParse(userIdClaim.Value, out var userId))
        {
            throw new UnauthorizedAccessException("User ID not found in token claims.");
        }

        var user = await _context.Users.FindAsync(userId);
        if (user == null)
        {
            throw new UnauthorizedAccessException("User not found.");
        }

        // Generate a new token with extended expiry
        var newToken = _jwtTokenGenerator.GenerateToken(user); // This will use the 2-hour expiry
        var newExpiry = DateTime.UtcNow.AddHours(2); // Match the expiry in JwtTokenGenerator

        return new RefreshTokenResponse(newToken, newExpiry);
    }
}
